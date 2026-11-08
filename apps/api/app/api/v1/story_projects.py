from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.project import Project
from app.models.story_project import StoryProject
from app.models.user import User
from app.schemas.story_project import StoryResponse, StorySave

router = APIRouter(prefix="/projects/{project_id}/story", tags=["Story Studio"])


def owned_story_project(db: Session, project_id: int, user_id: int, lock=False):
    query = select(Project).where(
        Project.id == project_id, Project.user_id == user_id,
    ).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    project = db.scalar(query)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.project_type != "story":
        raise HTTPException(status_code=400, detail="Open Story Studio from a story project.")
    return project


@router.get("", response_model=StoryResponse)
def get_story(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_story_project(db, project_id, user.id)
    story = db.get(StoryProject, project_id)
    if story is None:
        raise HTTPException(status_code=404, detail="No story draft saved yet.")
    return story


@router.put("", response_model=StoryResponse)
def save_story(
    project_id: int,
    data: StorySave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        owned_story_project(db, project_id, user.id, lock=True)
        story = db.get(StoryProject, project_id, populate_existing=True)
        current_version = story.version if story is not None else 0
        if data.expected_version != current_version:
            raise HTTPException(
                status_code=409,
                detail="This story changed in another tab. Your draft was not saved. Export it before loading the latest story.",
            )
        values = data.model_dump(exclude={"expected_version"})
        if story is None:
            story = StoryProject(project_id=project_id, version=1, **values)
            db.add(story)
        elif any(getattr(story, field) != value for field, value in values.items()):
            for field, value in values.items():
                setattr(story, field, value)
            story.version += 1
        db.commit()
        db.refresh(story)
        return story
    except Exception:
        db.rollback()
        raise

@router.get("/manuscript/{format}")
def export_manuscript(project_id: int, format: Literal["html", "epub"], version: int,
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.export_response import private_download
    from app.services.manuscript_export import manuscript_epub, manuscript_html

    story = get_story(project_id, user, db)
    if story.version != version:
        raise HTTPException(409, "The saved story changed. Reload before exporting.")
    if format == "html":
        content = manuscript_html(story.title, story.synopsis, story.chapters)
        media_type = "text/html; charset=utf-8"
    else:
        content = manuscript_epub(project_id, story.version, story.title, story.synopsis, story.chapters)
        media_type = "application/epub+zip"
    return private_download(content, media_type=media_type, filename=f"indaverse-manuscript-v{version}.{format}")


from app.api.v1.story_characters import router as story_characters_router

router.include_router(story_characters_router)

from app.api.v1.story_scenes import router as story_scenes_router

router.include_router(story_scenes_router)
