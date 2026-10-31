from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.image_generation_job import ImageGenerationJob
from app.models.project import Project
from app.models.user import User
from app.schemas.image_generation_job import (
    ImageGenerationCreate,
    ImageGenerationPage,
    ImageGenerationResponse,
)


router = APIRouter(tags=["Image Generation"])


def owned_project(db: Session, project_id: int, user_id: int, lock=False):
    query = select(Project).where(
        Project.id == project_id,
        Project.user_id == user_id,
    )
    if lock:
        query = query.with_for_update()
    project = db.scalar(query)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.post(
    "/image-jobs",
    response_model=ImageGenerationResponse,
    status_code=201,
)
def create_image_request(
    project_id: int,
    data: ImageGenerationCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        owned_project(db, project_id, user.id, lock=True)
        job = ImageGenerationJob(
            project_id=project_id,
            **data.model_dump(),
            provider="unavailable",
            status="unavailable",
            error_message=(
                "Image generation is not connected to a provider yet. "
                "Your request has been saved; no image was generated."
            ),
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job
    except Exception:
        db.rollback()
        raise


@router.get("/image-jobs", response_model=ImageGenerationPage)
def list_image_requests(
    project_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_project(db, project_id, user.id)
    rows = db.scalars(
        select(ImageGenerationJob)
        .where(ImageGenerationJob.project_id == project_id)
        .order_by(ImageGenerationJob.id.desc())
        .offset(offset)
        .limit(limit + 1)
    ).all()
    return ImageGenerationPage(
        items=rows[:limit],
        has_more=len(rows) > limit,
        limit=limit,
        offset=offset,
    )


@router.get("/image-jobs/{job_id}", response_model=ImageGenerationResponse)
def get_image_request(
    project_id: int,
    job_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_project(db, project_id, user.id)
    job = db.scalar(
        select(ImageGenerationJob).where(
            ImageGenerationJob.id == job_id,
            ImageGenerationJob.project_id == project_id,
        )
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Image request not found.")
    return job
