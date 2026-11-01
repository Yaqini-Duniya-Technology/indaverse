"""Read-only draft validation endpoints for the three versioned design studios."""
import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.project import Project
from app.models.image_asset import ImageAsset
from app.models.user import User
from app.services.studio_draft_import import validate_studio_draft

router = APIRouter(prefix="/projects/{project_id}", tags=["Studio draft validation"])
MAX_IMPORT_BYTES = 2 * 1024 * 1024
PROJECT_TYPES = {"story": {"story"}, "video": {"video", "music_video"}, "software": {"website", "app"}}


@router.post("/{studio}/validate-import")
async def validate_draft(
    project_id: int, studio: Literal["story", "video", "software"], request: Request,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == user.id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.project_type not in PROJECT_TYPES[studio]:
        raise HTTPException(status_code=400, detail="Open validation from the matching project studio.")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_IMPORT_BYTES:
            raise HTTPException(status_code=413, detail="Draft imports must be no larger than 2 MB.")
        body.extend(chunk)
    try:
        document = json.loads(body)
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise HTTPException(status_code=400, detail="This file is not valid JSON.")
    result = validate_studio_draft(studio, document)
    if result["valid"] and studio == "video":
        requested = {shot["image_id"] for shot in result["data"]["shots"] if shot["image_id"] is not None}
        available = set(db.scalars(select(ImageAsset.id).where(
            ImageAsset.project_id == project_id, ImageAsset.id.in_(requested),
        ))) if requested else set()
        removed = 0
        for shot in result["data"]["shots"]:
            if shot["image_id"] is not None and shot["image_id"] not in available:
                shot["image_id"] = None
                removed += 1
        if removed:
            result["warnings"].append(f"Removed {removed} image links unavailable in this destination project. Image files are not imported.")
    return result
