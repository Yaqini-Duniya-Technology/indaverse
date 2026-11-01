from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project
from app.schemas.project import ProjectCreate


def create_project(
    db: Session,
    user_id: int,
    project_data: ProjectCreate,
) -> Project:
    project = Project(
        user_id=user_id,
        name=project_data.name,
        project_type=project_data.project_type,
        description=project_data.description,
        visibility=project_data.visibility,
    )

    db.add(project)
    db.commit()
    db.refresh(project)

    return project


def get_user_projects(
    db: Session,
    user_id: int,
) -> list[Project]:
    statement = (
        select(Project)
        .where(Project.user_id == user_id)
        .order_by(Project.created_at.desc(), Project.id.desc())
    )

    return list(db.scalars(statement).all())


def get_user_project(
    db: Session,
    user_id: int,
    project_id: int,
) -> Project | None:
    statement = select(Project).where(
        Project.id == project_id,
        Project.user_id == user_id,
    )

    return db.scalar(statement)


def delete_project(
    db: Session,
    project: Project,
) -> None:
    db.delete(project)
    db.commit()