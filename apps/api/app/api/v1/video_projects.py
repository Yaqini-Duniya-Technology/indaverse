from copy import deepcopy

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.image_asset import ImageAsset
from app.models.project import Project
from app.models.user import User
from app.models.video_project import VideoProject
from app.models.video_revision import VideoRevision
from app.schemas.video_revision import VideoRevisionPage, VideoRevisionResponse
from app.schemas.video_project import VideoResponse, VideoSave


router = APIRouter(prefix="/projects/{project_id}/video", tags=["Video Studio"])


def owned_video_project(db: Session, project_id: int, user_id: int, lock=False):
    query = select(Project).where(
        Project.id == project_id, Project.user_id == user_id,
    ).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    project = db.scalar(query)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.project_type not in {"video", "music_video"}:
        raise HTTPException(status_code=400, detail="Open Video Studio from a video project.")
    return project


@router.get("", response_model=VideoResponse)
def get_video(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_video_project(db, project_id, user.id)
    video = db.get(VideoProject, project_id)
    if video is None:
        raise HTTPException(status_code=404, detail="No video draft saved yet.")
    return video


@router.put("", response_model=VideoResponse)
def save_video(
    project_id: int,
    data: VideoSave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        owned_video_project(db, project_id, user.id, lock=True)
        video = db.get(VideoProject, project_id, populate_existing=True)
        current_version = video.version if video is not None else 0
        if data.expected_version != current_version:
            raise HTTPException(
                status_code=409,
                detail="This video changed in another tab. Your draft was not saved. Export it before loading the latest video.",
            )

        requested = {shot.image_id for shot in data.shots if shot.image_id is not None}
        if requested:
            available = set(db.scalars(
                select(ImageAsset.id).where(
                    ImageAsset.project_id == project_id,
                    ImageAsset.id.in_(requested),
                )
            ).all())
            if requested != available:
                raise HTTPException(
                    status_code=400,
                    detail="A shot image is unavailable or belongs to another project. Remove its link before saving.",
                )

        values = data.model_dump(exclude={"expected_version"})
        if video is None:
            video = VideoProject(project_id=project_id, version=1, **values)
            db.add(video)
            record_revision(db, video, "created")
        elif any(getattr(video, field) != value for field, value in values.items()):
            existing = db.scalar(
                select(VideoRevision.id).where(
                    VideoRevision.project_id == project_id,
                    VideoRevision.version == video.version,
                )
            )
            if existing is None:
                record_revision(db, video, "baseline")
            for field, value in values.items():
                setattr(video, field, value)
            video.version += 1
            record_revision(db, video, "saved")

        db.commit()
        db.refresh(video)
        return video
    except Exception:
        db.rollback()
        raise

def record_revision(db: Session, video: VideoProject, reason: str) -> None:
    db.add(VideoRevision(
        project_id=video.project_id,
        version=video.version,
        reason=reason,
        snapshot=deepcopy({
            "title": video.title,
            "script": video.script,
            "aspect_ratio": video.aspect_ratio,
            "shots": video.shots,
        }),
    ))


@router.get("/revisions", response_model=VideoRevisionPage)
def list_video_revisions(
    project_id: int,
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_video_project(db, project_id, user.id)
    total = db.scalar(
        select(func.count()).select_from(VideoRevision)
        .where(VideoRevision.project_id == project_id)
    )
    items = db.scalars(
        select(VideoRevision)
        .where(VideoRevision.project_id == project_id)
        .order_by(VideoRevision.version.desc(), VideoRevision.id.desc())
        .offset(offset).limit(limit)
    ).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/revisions/{revision_id}", response_model=VideoRevisionResponse)
def get_video_revision(
    project_id: int,
    revision_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_video_project(db, project_id, user.id)
    revision = db.scalar(
        select(VideoRevision).where(
            VideoRevision.id == revision_id,
            VideoRevision.project_id == project_id,
        )
    )
    if revision is None:
        raise HTTPException(status_code=404, detail="Video revision not found.")
    return revision
