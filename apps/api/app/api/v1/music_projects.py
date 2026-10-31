from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.project import Project
from app.models.user import User
from app.providers.factory import get_music_provider
from app.providers.music import (
    MusicGenerationRequest as ProviderMusicGenerationRequest,
)
from app.schemas.music_project import (
    MusicGenerationRequest,
    MusicGenerationResponse,
    MusicProjectCreate,
    MusicProjectResponse,
    MusicProjectUpdate,
)
from app.services.music_generation_service import MusicGenerationService
from app.services.music_project_service import (
    create_music_project,
    delete_music_project,
    get_music_project,
    update_music_project,
)


router = APIRouter(
    prefix="/projects/{project_id}/music",
    tags=["Music Projects"],
)


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


@router.get(
    "",
    response_model=MusicProjectResponse,
)
def get_music(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(
        project_id,
        current_user,
        db,
    )

    music_project = get_music_project(
        db,
        project_id,
    )

    if not music_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Music project not found.",
        )

    return music_project


@router.post(
    "",
    response_model=MusicProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_music(
    project_id: int,
    data: MusicProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(
        project_id,
        current_user,
        db,
    )

    existing_music_project = get_music_project(
        db,
        project_id,
    )

    if existing_music_project:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A music project already exists for this project.",
        )

    return create_music_project(
        db,
        project_id,
        data,
    )


@router.patch(
    "",
    response_model=MusicProjectResponse,
)
def update_music(
    project_id: int,
    data: MusicProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(
        project_id,
        current_user,
        db,
    )

    music_project = get_music_project(
        db,
        project_id,
    )

    if not music_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Music project not found.",
        )

    return update_music_project(
        db,
        music_project,
        data,
    )


@router.post(
    "/generate",
    response_model=MusicGenerationResponse,
)
def generate_music(
    project_id: int,
    data: MusicGenerationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(project_id, current_user, db)

    job = MusicGenerationJob(
        project_id=project_id,
        user_id=current_user.id,
        **data.model_dump(),
        provider="unavailable",
        status="unavailable",
    )
    try:
        provider = get_music_provider()
        service = MusicGenerationService(provider)
        request = ProviderMusicGenerationRequest(**data.model_dump())
        result = service.generate(request)
    except RuntimeError as exc:
        job.error_message = str(exc)
        try:
            db.add(job)
            db.commit()
        except Exception:
            db.rollback()
            raise
        raise HTTPException(
            status_code=503,
            detail="Music generation is unavailable. Your request was saved in generation history; no audio was generated.",
        ) from exc

    for field in (
        "provider", "provider_job_id", "status", "audio_url",
        "duration_seconds", "title", "error_message",
    ):
        setattr(job, field, getattr(result, field))
    try:
        db.add(job)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return result



@router.delete(
    "",
)
def delete_music(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(
        project_id,
        current_user,
        db,
    )

    music_project = get_music_project(
        db,
        project_id,
    )

    if not music_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Music project not found.",
        )

    delete_music_project(
        db,
        music_project,
    )

    return {
        "message": "Music project deleted successfully.",
    }

# Restored song history endpoints
from datetime import datetime
from fastapi import Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from app.models.music_revision import MusicRevision


class SongRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    reason: str
    snapshot: MusicProjectCreate
    created_at: datetime


class SongRevisionPage(BaseModel):
    items: list[SongRevisionResponse]
    total: int
    limit: int
    offset: int


@router.get("/revisions", response_model=SongRevisionPage)
def list_song_revisions(
    project_id: int,
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(project_id, current_user, db)
    total = db.scalar(
        select(func.count()).select_from(MusicRevision)
        .where(MusicRevision.project_id == project_id)
    ) or 0
    items = db.scalars(
        select(MusicRevision)
        .where(MusicRevision.project_id == project_id)
        .order_by(MusicRevision.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/revisions/{revision_id}", response_model=SongRevisionResponse)
def get_song_revision(
    project_id: int,
    revision_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(project_id, current_user, db)
    revision = db.scalar(
        select(MusicRevision).where(
            MusicRevision.id == revision_id,
            MusicRevision.project_id == project_id,
        )
    )
    if revision is None:
        raise HTTPException(status_code=404, detail="Song revision not found.")
    return revision


# Restored music generation history
from app.models.music_generation_job import MusicGenerationJob
from app.schemas.music_generation_job import (
    MusicGenerationJobResponse,
    MusicGenerationJobListResponse,
)


@router.get("/jobs", response_model=MusicGenerationJobListResponse)
def list_music_generation_jobs(
    project_id: int,
    limit: int = Query(default=5, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(project_id, current_user, db)
    conditions = (
        MusicGenerationJob.project_id == project_id,
        MusicGenerationJob.user_id == current_user.id,
    )
    total = db.scalar(
        select(func.count()).select_from(MusicGenerationJob).where(*conditions)
    ) or 0
    items = db.scalars(
        select(MusicGenerationJob).where(*conditions)
        .order_by(MusicGenerationJob.id.desc())
        .offset(offset).limit(limit)
    ).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/jobs/{job_id}", response_model=MusicGenerationJobResponse)
def get_music_generation_job(
    project_id: int,
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_project(project_id, current_user, db)
    job = db.scalar(
        select(MusicGenerationJob).where(
            MusicGenerationJob.id == job_id,
            MusicGenerationJob.project_id == project_id,
            MusicGenerationJob.user_id == current_user.id,
        )
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Generation request not found.")
    return job
