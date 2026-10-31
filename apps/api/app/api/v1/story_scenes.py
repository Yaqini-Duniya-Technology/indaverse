from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.api.v1.story_characters import owned_story
from app.database.connection import get_db
from app.models.image_asset import ImageAsset
from app.models.story_characters import StoryCharacters
from app.models.story_project import StoryProject
from app.models.story_scenes import StoryScenes
from app.models.user import User
from app.schemas.story_scenes import ScenesResponse, ScenesSave


router = APIRouter(tags=["Story Scenes"])


@router.get("/scenes", response_model=ScenesResponse)
def get_scenes(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_story(db, project_id, user.id)
    saved = db.get(StoryScenes, project_id)
    return saved if saved is not None else ScenesResponse(
        project_id=project_id, scenes=[], version=0, updated_at=None,
    )


@router.put("/scenes", response_model=ScenesResponse)
def save_scenes(
    project_id: int,
    data: ScenesSave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        # Chapter and character saves use this same project lock.
        owned_story(db, project_id, user.id, lock=True)
        saved = db.get(StoryScenes, project_id, populate_existing=True)
        version = saved.version if saved is not None else 0
        if version != data.expected_version:
            raise HTTPException(
                status_code=409,
                detail="Scenes changed in another tab. Your draft was not saved. Export it before loading the latest scenes.",
            )

        story = db.get(StoryProject, project_id, populate_existing=True)
        cast = db.get(StoryCharacters, project_id, populate_existing=True)
        chapters = {chapter["id"] for chapter in story.chapters} if story else set()
        characters = {character["id"] for character in cast.characters} if cast else set()

        requested_chapters = {
            scene.chapter_id for scene in data.scenes if scene.chapter_id is not None
        }
        requested_characters = {
            character_id for scene in data.scenes for character_id in scene.character_ids
        }
        if not requested_chapters.issubset(chapters):
            raise HTTPException(
                status_code=400,
                detail="A linked chapter is unavailable. Choose a saved chapter from this story or remove its link.",
            )
        if not requested_characters.issubset(characters):
            raise HTTPException(
                status_code=400,
                detail="A linked character is unavailable. Choose a saved character from this story or remove its link.",
            )

        requested_images = {
            scene.image_id for scene in data.scenes if scene.image_id is not None
        }
        if requested_images:
            available = set(db.scalars(
                select(ImageAsset.id).where(
                    ImageAsset.project_id == project_id,
                    ImageAsset.id.in_(requested_images),
                )
            ).all())
            if requested_images != available:
                raise HTTPException(
                    status_code=400,
                    detail="A linked image is unavailable. Choose an image from this project or remove its link.",
                )

        scenes = [scene.model_dump() for scene in data.scenes]
        if saved is None:
            saved = StoryScenes(project_id=project_id, scenes=scenes, version=1)
            db.add(saved)
        elif saved.scenes != scenes:
            saved.scenes = scenes
            saved.version += 1

        db.commit()
        db.refresh(saved)
        return saved
    except Exception:
        db.rollback()
        raise
