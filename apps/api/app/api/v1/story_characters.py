from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.image_asset import ImageAsset
from app.models.project import Project
from app.models.story_characters import StoryCharacters
from app.models.user import User
from app.schemas.story_characters import CharactersResponse, CharactersSave


router = APIRouter(tags=["Story Characters"])


def owned_story(db: Session, project_id: int, user_id: int, lock=False):
    query = select(Project).where(
        Project.id == project_id, Project.user_id == user_id,
    ).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    project = db.scalar(query)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.project_type != "story":
        raise HTTPException(status_code=400, detail="Characters require a story project.")
    return project


@router.get("/characters", response_model=CharactersResponse)
def get_characters(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_story(db, project_id, user.id)
    saved = db.get(StoryCharacters, project_id)
    if saved is None:
        return CharactersResponse(
            project_id=project_id, characters=[], version=0, updated_at=None,
        )
    return saved


@router.put("/characters", response_model=CharactersResponse)
def save_characters(
    project_id: int,
    data: CharactersSave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        owned_story(db, project_id, user.id, lock=True)
        saved = db.get(StoryCharacters, project_id, populate_existing=True)
        version = saved.version if saved is not None else 0
        if version != data.expected_version:
            raise HTTPException(
                status_code=409,
                detail="Characters changed in another tab. Your draft was not saved. Export it before loading the latest profiles.",
            )

        requested = {
            character.portrait_image_id for character in data.characters
            if character.portrait_image_id is not None
        }
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
                    detail="Choose portraits from this project's image library.",
                )

        characters = [character.model_dump() for character in data.characters]
        if saved is None:
            saved = StoryCharacters(
                project_id=project_id, characters=characters, version=1,
            )
            db.add(saved)
        elif saved.characters != characters:
            saved.characters = characters
            saved.version += 1

        db.commit()
        db.refresh(saved)
        return saved
    except Exception:
        db.rollback()
        raise
