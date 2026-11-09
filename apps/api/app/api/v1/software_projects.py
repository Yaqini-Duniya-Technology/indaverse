from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.project import Project
from app.models.software_project import SoftwareProject
from app.models.user import User
from app.schemas.software_project import SoftwareResponse, SoftwareSave


from app.services.export_response import guard_download_origin

router = APIRouter(
    prefix="/projects/{project_id}/software", tags=["Web & App Studio"],
)


def owned_software_project(db: Session, project_id: int, user_id: int, lock=False):
    query = select(Project).where(
        Project.id == project_id, Project.user_id == user_id,
    ).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    project = db.scalar(query)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.project_type not in {"website", "app"}:
        raise HTTPException(
            status_code=400,
            detail="Open Web & App Studio from a website or app project.",
        )
    return project


@router.get("", response_model=SoftwareResponse)
def get_software(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_software_project(db, project_id, user.id)
    draft = db.get(SoftwareProject, project_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="No software blueprint saved yet.")
    return draft


@router.put("", response_model=SoftwareResponse)
def save_software(
    project_id: int,
    data: SoftwareSave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        owned_software_project(db, project_id, user.id, lock=True)
        draft = db.get(SoftwareProject, project_id, populate_existing=True)
        current_version = draft.version if draft is not None else 0
        if data.expected_version != current_version:
            raise HTTPException(
                status_code=409,
                detail="This blueprint changed in another tab. Your draft was not saved. Export it before loading the latest blueprint.",
            )
        values = data.model_dump(exclude={"expected_version"})
        if draft is None:
            draft = SoftwareProject(project_id=project_id, version=1, **values)
            db.add(draft)
        elif any(getattr(draft, field) != value for field, value in values.items()):
            for field, value in values.items():
                setattr(draft, field, value)
            draft.version += 1
        db.commit()
        db.refresh(draft)
        return draft
    except Exception:
        db.rollback()
        raise


def export_draft(db, project_id, user_id, version):
    owned_software_project(db, project_id, user_id)
    draft = db.get(SoftwareProject, project_id)
    if draft is None or draft.version != version:
        raise HTTPException(409, "Load the latest saved blueprint before exporting.")
    if draft.platform == "mobile":
        raise HTTPException(422, "Static export requires a web or web and mobile blueprint.")
    return draft


@router.get("/site-check")
def check_site(project_id: int, version: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.static_site import validate_pages

    return {"issues": validate_pages(export_draft(db, project_id, user.id, version).pages)}


@router.get("/site.zip", dependencies=[Depends(guard_download_origin)])
def export_site(project_id: int, version: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.export_response import metered_download
    from app.services.static_site import build_site, validate_pages

    draft = export_draft(db, project_id, user.id, version)
    issues = validate_pages(draft.pages)
    if issues:
        raise HTTPException(422, issues[0])
    return metered_download(db, user.id, build_site(draft), media_type="application/zip", filename=f"indaverse-site-v{version}.zip")
