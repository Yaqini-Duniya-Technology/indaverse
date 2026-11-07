from pathlib import Path
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.v1.dependencies import get_current_user
from app.api.v1.video_projects import owned_video_project
from app.core.config import settings
from app.database.connection import get_db
from app.models.user import User
from app.services import clip_export
from app.services.export_response import private_download

router = APIRouter(prefix="/projects/{project_id}/video/clip-export", tags=["Video Studio"])
render_slot = BoundedSemaphore(1)


def available_tools():
    if settings.video_clip_export_enabled and settings.app_env.lower() in {"development", "test"}:
        return clip_export.renderer_tools()
    return None


@router.get("")
def export_capabilities(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned_video_project(db, project_id, user.id)
    return {
        "available": available_tools() is not None,
        "max_bytes": clip_export.MAX_BYTES,
        "max_source_seconds": clip_export.MAX_SOURCE_SECONDS,
        "min_clip_seconds": clip_export.MIN_CLIP_SECONDS,
        "max_clip_seconds": clip_export.MAX_CLIP_SECONDS,
    }


@router.post("")
async def export_clip(
    project_id: int, request: Request,
    start: float = Query(ge=0, le=clip_export.MAX_SOURCE_SECONDS),
    end: float = Query(gt=0, le=clip_export.MAX_SOURCE_SECONDS),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    await run_in_threadpool(owned_video_project, db, project_id, user.id)
    await run_in_threadpool(db.close)
    tools = available_tools()
    if tools is None:
        raise HTTPException(503, "MP4 export is not enabled on this server.")
    if not clip_export.MIN_CLIP_SECONDS <= round(end - start, 6) <= clip_export.MAX_CLIP_SECONDS:
        raise HTTPException(422, "Select a range between 0.5 and 30 seconds.")
    if request.headers.get("content-type") != "video/mp4":
        raise HTTPException(415, "Choose an MP4 video.")
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            size = int(declared)
        except ValueError as exc:
            raise HTTPException(400, "Invalid upload size.") from exc
        if size < 0:
            raise HTTPException(400, "Invalid upload size.")
        if size > clip_export.MAX_BYTES:
            raise HTTPException(413, "The source MP4 must be 32 MB or smaller.")
    if not render_slot.acquire(blocking=False):
        raise HTTPException(429, "Another clip is being processed. Try again shortly.")
    try:
        with TemporaryDirectory(prefix="indaverse-clip-") as folder:
            source, output = Path(folder) / "source.mp4", Path(folder) / "export.mp4"
            size = 0
            try:
                with anyio.fail_after(30):
                    async with await anyio.open_file(source, "wb") as target:
                        async for chunk in request.stream():
                            size += len(chunk)
                            if size > clip_export.MAX_BYTES:
                                raise HTTPException(413, "The source MP4 must be 32 MB or smaller.")
                            await target.write(chunk)
            except TimeoutError as exc:
                raise HTTPException(408, "The video upload timed out.") from exc
            if not size:
                raise HTTPException(422, "The uploaded video is empty.")
            content = await run_in_threadpool(clip_export.trim_mp4, tools, source, output, start, end)
    except clip_export.ClipError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(503, "Temporary video storage is unavailable.") from exc
    finally:
        render_slot.release()
    return private_download(content, media_type="video/mp4", filename=f"indaverse-{project_id}-clip.mp4")
