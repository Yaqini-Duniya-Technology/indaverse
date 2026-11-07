from io import BytesIO
from pathlib import Path
from typing import Literal
from uuid import uuid4
import warnings

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.image_asset import ImageAsset
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectResponse

router = APIRouter(prefix="/projects/{project_id}", tags=["Project Images"])
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "images"
MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 16000000


def owned(db, project_id, user_id, lock=False):
    query = select(Project).where(
        Project.id == project_id, Project.user_id == user_id,
    ).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    project = db.scalar(query)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


def metadata(asset):
    return {
        "id": asset.id, "project_id": asset.project_id,
        "label": asset.label, "category": asset.category,
        "mime_type": asset.mime_type, "file_size": asset.file_size,
        "width": asset.width, "height": asset.height,
        "created_at": asset.created_at,
    }


def encode_image(raw):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw), formats=["JPEG", "PNG", "WEBP"]) as image:
                if image.width * image.height > MAX_PIXELS:
                    raise HTTPException(status_code=400, detail="Maximum image size is 16 megapixels.")
                if getattr(image, "is_animated", False):
                    raise HTTPException(status_code=400, detail="Please upload a still image.")
                image.load()
                oriented = ImageOps.exif_transpose(image)
                pixels = oriented.convert("RGBA")
                # A new image carries pixels without the source metadata.
                clean = Image.new("RGBA", pixels.size)
                clean.paste(pixels)
                output = BytesIO()
                clean.save(output, format="WEBP", quality=90)
                return output.getvalue(), clean.width, clean.height
    except (UnidentifiedImageError, OSError, ValueError,
            Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=400, detail="Upload a valid JPEG, PNG, or WebP image.") from exc


@router.post("/images", status_code=201)
async def upload_image(
    project_id: int,
    file: UploadFile = File(...),
    label: str = Form(..., min_length=1, max_length=150),
    category: Literal["character", "scene", "location", "reference"] = Form("reference"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    path = None
    committed = False
    try:
        owned(db, project_id, user.id)
        label = label.strip()
        if not label:
            raise HTTPException(status_code=422, detail="Give this image a label.")
        raw = await file.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="Maximum upload size is 10 MB.")
        encoded, width, height = await run_in_threadpool(encode_image, raw)
        if len(encoded) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="Processed image exceeds 10 MB.")
        # Serialize image changes with project deletion and cover changes.
        owned(db, project_id, user.id, lock=True)
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        filename = uuid4().hex + ".webp"
        path = UPLOAD_DIR / filename
        path.write_bytes(encoded)
        asset = ImageAsset(
            project_id=project_id, label=label, category=category,
            stored_filename=filename, mime_type="image/webp",
            file_size=len(encoded), width=width, height=height,
        )
        db.add(asset)
        db.commit()
        committed = True
        db.refresh(asset)
        return metadata(asset)
    except Exception:
        db.rollback()
        if path is not None and not committed:
            path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@router.get("/images")
def list_images(
    project_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: str = Query(default="", max_length=150),
    category: Literal["character", "scene", "location", "reference"] | None = Query(default=None),
    sort: Literal["newest", "oldest", "label"] = Query(default="newest"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned(db, project_id, user.id)
    query = select(ImageAsset).where(ImageAsset.project_id == project_id)
    if search.strip():
        query = query.where(ImageAsset.label.icontains(search.strip(), autoescape=True))
    if category is not None:
        query = query.where(ImageAsset.category == category)
    if sort == "label":
        query = query.order_by(ImageAsset.label.asc(), ImageAsset.id.asc())
    else:
        query = query.order_by(ImageAsset.id.asc() if sort == "oldest" else ImageAsset.id.desc())
    rows = db.scalars(query.offset(offset).limit(limit + 1)).all()
    return {
        "items": [metadata(row) for row in rows[:limit]],
        "has_more": len(rows) > limit, "limit": limit, "offset": offset,
    }


@router.get("/images/{image_id}/content")
def image_content(
    project_id: int, image_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned(db, project_id, user.id)
    asset = db.scalar(select(ImageAsset).where(
        ImageAsset.id == image_id, ImageAsset.project_id == project_id,
    ))
    if asset is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    root = UPLOAD_DIR.resolve()
    path = (root / asset.stored_filename).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status_code=404, detail="Image file not found.")
    return FileResponse(path, media_type=asset.mime_type, headers={
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })


class CoverUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=0, strict=True)
    image_id: int | None = Field(default=None, ge=1, strict=True)


@router.put("/cover", response_model=ProjectResponse)
def set_cover(
    project_id: int, data: CoverUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        project = owned(db, project_id, user.id, lock=True)
        if project.cover_version != data.expected_version:
            raise HTTPException(status_code=409, detail="The cover changed. Load the latest project before choosing again.")
        if data.image_id is not None:
            asset = db.scalar(select(ImageAsset).where(
                ImageAsset.id == data.image_id, ImageAsset.project_id == project_id,
            ))
            if asset is None:
                raise HTTPException(status_code=400, detail="Choose an image belonging to this project.")
        if project.cover_image_id != data.image_id:
            project.cover_image_id = data.image_id
            project.cover_version += 1
        db.commit()
        db.refresh(project)
        return project
    except Exception:
        db.rollback()
        raise

from app.api.v1.image_generation import router as image_generation_router

router.include_router(image_generation_router)


class ImageCopyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    destination_project_id: int = Field(gt=0)
    permission_confirmed: Literal[True]


@router.post("/images/{image_id}/copy", status_code=201)
def copy_image(
    project_id: int, image_id: int, data: ImageCopyRequest,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    destination = data.destination_project_id
    if destination == project_id:
        raise HTTPException(422, "Choose a different project.")
    # Lock in ID order so copies in opposite directions cannot deadlock.
    for item in sorted((project_id, destination)):
        owned(db, item, user.id, lock=True)
    source = db.scalar(select(ImageAsset).where(
        ImageAsset.id == image_id, ImageAsset.project_id == project_id,
    ))
    if source is None:
        raise HTTPException(404, "Image not found.")
    root = UPLOAD_DIR.resolve()
    source_path = (root / source.stored_filename).resolve()
    if not source_path.is_relative_to(root) or not source_path.is_file():
        raise HTTPException(404, "Image file not found.")
    # The source was already sanitised by the upload workflow. Preserve its bytes.
    with source_path.open("rb") as original:
        encoded = original.read(MAX_BYTES + 1)
    if source.mime_type != "image/webp" or not encoded or len(encoded) > MAX_BYTES or len(encoded) != source.file_size:
        raise HTTPException(422, "This image cannot be copied. Upload a new original.")
    filename = uuid4().hex + ".webp"
    path = root / filename
    try:
        with path.open("xb") as target:
            target.write(encoded)
        copy = ImageAsset(
            project_id=destination, label=source.label, category=source.category,
            stored_filename=filename, mime_type=source.mime_type,
            file_size=source.file_size, width=source.width, height=source.height,
        )
        db.add(copy)
        db.flush()
        result = metadata(copy)
        db.commit()
        return result
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
