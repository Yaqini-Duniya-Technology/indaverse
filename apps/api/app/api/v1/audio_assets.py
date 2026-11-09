from pathlib import Path
from uuid import uuid4

from fastapi.responses import FileResponse

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.services.credits import check_storage
from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.audio_asset import AudioAsset
from app.models.project import Project
from app.models.user import User


router = APIRouter(
    prefix="/projects/{project_id}/audio",
    tags=["Audio Assets"],
)


UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "audio"


ALLOWED_AUDIO_TYPES = {
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "audio/webm": ".webm",
}


MAX_FILE_SIZE = 50 * 1024 * 1024


# =========================================================
# OWNERSHIP
# =========================================================

def get_owned_project(
    project_id: int,
    current_user: User,
    db: Session,
) -> Project:
    project = db.get(Project, project_id)

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    if project.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project.",
        )

    return project


# =========================================================
# GET PROJECT AUDIO
# =========================================================

@router.get("")
def get_project_audio(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(
        project_id,
        current_user,
        db,
    )

    statement = (
        select(AudioAsset)
        .where(
            AudioAsset.project_id == project_id
        )
        .order_by(
            AudioAsset.created_at.desc()
        )
    )

    audio_assets = list(
        db.scalars(statement).all()
    )

    return [
        {
            "id": asset.id,
            "project_id": asset.project_id,
            "original_filename": asset.original_filename,
            "stored_filename": asset.stored_filename,
            "file_path": f"/api/v1/projects/{project_id}/audio/{asset.id}/content",
            "mime_type": asset.mime_type,
            "file_size": asset.file_size,
            "created_at": asset.created_at,
        }
        for asset in audio_assets
    ]


# =========================================================
# UPLOAD AUDIO
# =========================================================

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
)
async def upload_audio(
    project_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(
        project_id,
        current_user,
        db,
    )

    if file.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported audio format.",
        )

    extension = ALLOWED_AUDIO_TYPES[
        file.content_type
    ]

    original_filename = Path(
        file.filename or "audio"
    ).name

    stored_filename = (
        f"{uuid4().hex}{extension}"
    )

    file_path = (
        UPLOAD_DIR / stored_filename
    )

    UPLOAD_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    file_size = 0
    try:
        with file_path.open("xb") as output_file:
            while chunk := await file.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(status_code=413, detail="Audio file is too large. Maximum size is 50 MB.")
                output_file.write(chunk)
        if file_size == 0:
            raise HTTPException(status_code=400, detail="Audio file cannot be empty.")
        await run_in_threadpool(check_storage, db, current_user.id, file_size)
        audio_asset = AudioAsset(
            project_id=project_id,
            original_filename=original_filename[:255],
            stored_filename=stored_filename,
            file_path=str(file_path),
            mime_type=file.content_type,
            file_size=file_size,
        )
        db.add(audio_asset)
        db.commit()
    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    db.refresh(audio_asset)
    return {
        "id": audio_asset.id, "project_id": audio_asset.project_id,
        "original_filename": audio_asset.original_filename,
        "stored_filename": audio_asset.stored_filename,
        "file_path": f"/api/v1/projects/{project_id}/audio/{audio_asset.id}/content",
        "mime_type": audio_asset.mime_type, "file_size": audio_asset.file_size,
        "created_at": audio_asset.created_at,
    }


def stored_audio_path(asset: AudioAsset) -> Path:
    # Resolve from the canonical storage root, never from a database path.
    root = UPLOAD_DIR.resolve()
    path = (root / asset.stored_filename).resolve()
    if path.parent != root:
        raise HTTPException(status_code=404, detail="Audio file not found.")
    return path


@router.get("/{audio_id}/content")
def audio_content(
    project_id: int, audio_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(project_id, current_user, db)
    asset = db.scalar(select(AudioAsset).where(
        AudioAsset.id == audio_id, AudioAsset.project_id == project_id,
    ))
    if asset is None:
        raise HTTPException(status_code=404, detail="Audio asset not found.")
    path = stored_audio_path(asset)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found.")
    return FileResponse(path, media_type=asset.mime_type, headers={
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    })


# =========================================================
# DELETE AUDIO
# =========================================================

@router.delete(
    "/{audio_id}",
)
def delete_audio(
    project_id: int,
    audio_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # -----------------------------------------------------
    # Verify project ownership
    # -----------------------------------------------------

    get_owned_project(
        project_id,
        current_user,
        db,
    )

    # -----------------------------------------------------
    # Find audio belonging to this project
    # -----------------------------------------------------

    statement = select(AudioAsset).where(
        AudioAsset.id == audio_id,
        AudioAsset.project_id == project_id,
    )

    audio_asset = db.scalar(statement)

    if not audio_asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio asset not found.",
        )

    # -----------------------------------------------------
    # Delete physical file
    # -----------------------------------------------------

    file_path = stored_audio_path(audio_asset)

    if file_path.exists():
        try:
            file_path.unlink()
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Audio record could not be deleted "
                    "because the stored file could not be removed."
                ),
            ) from exc

    # -----------------------------------------------------
    # Delete database record
    # -----------------------------------------------------

    db.delete(audio_asset)
    db.commit()

    return {
        "message": "Audio deleted successfully.",
        "audio_id": audio_id,
    }