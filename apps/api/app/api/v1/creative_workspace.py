from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import literal, select, union_all
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models import AudioAsset, ImageAsset, ImageGenerationJob, MusicGenerationJob, Project, User
from app.providers.creative import capabilities
from app.schemas.project import ProjectResponse
from app.services.creative_workspace import duplicate_saved_project

router = APIRouter(tags=["Creative Workspace"])


class ArchiveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    archived: bool


def owned_project(db, user_id, project_id, lock=False):
    query = select(Project).where(Project.id == project_id, Project.user_id == user_id)
    project = db.scalar(query.with_for_update() if lock else query)
    if project is None:
        raise HTTPException(404, "Project not found.")
    return project


@router.put("/projects/{project_id}/archive", response_model=ProjectResponse)
def archive(project_id: int, data: ArchiveRequest, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    project = owned_project(db, user.id, project_id, lock=True)
    if data.archived != (project.archived_at is not None):
        project.archived_at = datetime.now(timezone.utc).replace(tzinfo=None) if data.archived else None
        db.commit()
        db.refresh(project)
    return project


@router.post("/projects/{project_id}/duplicate", response_model=ProjectResponse, status_code=201)
def duplicate(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    source = owned_project(db, user.id, project_id, lock=True)
    name = f"{source.name[:143]} (copy)"
    return duplicate_saved_project(db, source, name)


def page(db, combined, limit, offset, **filters):
    view = combined.subquery()
    query = select(view)
    for key, value in filters.items():
        if value is not None:
            query = query.where(view.c[key] == value)
    rows = db.execute(query.order_by(view.c.created_at.desc(), view.c.kind, view.c.id.desc())
                      .offset(offset).limit(limit + 1)).mappings().all()
    return {"items": [dict(row) for row in rows[:limit]], "has_more": len(rows) > limit}


@router.get("/creative/assets")
def assets(kind: str | None = Query(default=None, pattern="^(image|audio)$"),
           offset: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=50),
           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    def listing(model, label, kind):
        return (select(literal(kind).label("kind"), model.id, model.project_id,
                       Project.name.label("project_name"), label.label("name"), model.mime_type,
                       model.file_size, model.created_at)
                .join(Project, Project.id == model.project_id).where(Project.user_id == user.id))
    return page(db, union_all(listing(ImageAsset, ImageAsset.label, "image"),
                              listing(AudioAsset, AudioAsset.original_filename, "audio")),
                limit, offset, kind=kind)


@router.get("/creative/capabilities")
def creative_capabilities(user: User = Depends(get_current_user)):
    return {"manual": True, "capabilities": capabilities()}


@router.get("/creative/jobs")
def generation_jobs(project_id: int, offset: int = Query(default=0, ge=0),
                    limit: int = Query(default=20, ge=1, le=50),
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned_project(db, user.id, project_id)
    def listing(model, kind):
        return select(literal(kind).label("kind"), model.id, model.status,
                      model.created_at).where(model.project_id == project_id)
    return page(db, union_all(listing(ImageGenerationJob, "image"),
                              listing(MusicGenerationJob, "music").where(
                                  MusicGenerationJob.user_id == user.id)), limit, offset)
