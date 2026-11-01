from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.user import User
from app.schemas.project import (
    ALLOWED_PROJECT_TYPES,
    ALLOWED_VISIBILITIES,
    ProjectCreate,
    ProjectResponse,
)
from app.services.project_service import (
    create_project,
    delete_project,
    get_user_project,
    get_user_projects,
)


router = APIRouter(
    prefix="/projects",
    tags=["Projects"],
)


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project_endpoint(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if project_data.project_type not in ALLOWED_PROJECT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project type.",
        )

    if project_data.visibility not in ALLOWED_VISIBILITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid visibility.",
        )

    return create_project(
        db,
        current_user.id,
        project_data,
    )


@router.get(
    "",
    response_model=list[ProjectResponse],
)
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_user_projects(
        db,
        current_user.id,
    )


@router.get("/page")
def project_page(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str = Query(default="", max_length=150),
    project_type: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if project_type is not None and project_type not in ALLOWED_PROJECT_TYPES:
        raise HTTPException(status_code=422, detail="Invalid project type.")
    query = select(Project).where(Project.user_id == current_user.id)
    if project_type is not None:
        query = query.where(Project.project_type == project_type)
    if search.strip():
        query = query.where(Project.name.icontains(search.strip(), autoescape=True))
    rows = list(db.scalars(query.order_by(Project.created_at.desc(), Project.id.desc())
        .offset(offset).limit(limit + 1)))
    return {
        "items": [ProjectResponse.model_validate(row) for row in rows[:limit]],
        "has_more": len(rows) > limit, "limit": limit, "offset": offset,
    }


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
)
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_user_project(
        db,
        current_user.id,
        project_id,
    )

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    return project


@router.delete(
    "/{project_id}",
)
def remove_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_user_project(
        db,
        current_user.id,
        project_id,
    )

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    delete_project(db, project)

    return {
        "message": "Project deleted successfully.",
    }

# Restored project details editing
from sqlalchemy import select
from app.models.project import Project
from app.schemas.project import ProjectUpdate


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project_details(
    project_id: int,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        project = db.scalar(
            select(Project)
            .where(
                Project.id == project_id,
                Project.user_id == current_user.id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found.")

        changes = data.model_dump(exclude_unset=True)
        for field, value in changes.items():
            if getattr(project, field) != value:
                setattr(project, field, value)

        db.commit()
        db.refresh(project)
        return project
    except Exception:
        db.rollback()
        raise


# Restored creative brief endpoints
from app.schemas.creative_brief import CreativeBriefResponse, CreativeBriefUpdate


def brief_response(project: Project) -> CreativeBriefResponse:
    return CreativeBriefResponse(
        project_id=project.id,
        version=project.brief_version,
        goal=project.brief_goal or "",
        audience=project.brief_audience or "",
        style=project.brief_style or "",
        constraints=project.brief_constraints or "",
    )


@router.get("/{project_id}/brief", response_model=CreativeBriefResponse)
def get_creative_brief(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        ).execution_options(populate_existing=True)
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return brief_response(project)


@router.put("/{project_id}/brief", response_model=CreativeBriefResponse)
def save_creative_brief(
    project_id: int,
    data: CreativeBriefUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        project = db.scalar(
            select(Project).where(
                Project.id == project_id,
                Project.user_id == current_user.id,
            ).with_for_update().execution_options(populate_existing=True)
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found.")
        if project.brief_version != data.expected_version:
            raise HTTPException(
                status_code=409,
                detail="The creative brief changed in another tab. Your draft was not saved. Copy your edits before loading the latest brief.",
            )

        values = data.model_dump(exclude={"expected_version"})
        values = {field: value.strip() for field, value in values.items()}
        changed = any(
            (getattr(project, f"brief_{field}") or "") != value
            for field, value in values.items()
        )
        if changed:
            for field, value in values.items():
                setattr(project, f"brief_{field}", value)
            project.brief_version += 1

        db.commit()
        db.refresh(project)
        return brief_response(project)
    except Exception:
        db.rollback()
        raise
