"""Copy saved workspace content without sharing mutable data or private files."""
from copy import deepcopy

from sqlalchemy import inspect, select

from app.models import (
    GamePlaySettings, GameProject, GameScene, MusicProject, Project,
    SoftwareProject, StoryCharacters, StoryProject, StoryScenes, VideoProject,
)

DRAFT_MODELS = {
    "game": (GameProject, GamePlaySettings, GameScene),
    "music": (MusicProject,),
    "story": (StoryProject, StoryCharacters, StoryScenes),
    "video": (VideoProject,),
    "music_video": (VideoProject,),
    "website": (SoftwareProject,),
    "app": (SoftwareProject,),
}
COPY_EXCLUSIONS = {"id", "project_id", "version", "created_at", "updated_at"}


def without_image_links(value):
    if isinstance(value, list):
        return [without_image_links(item) for item in value]
    if isinstance(value, dict):
        return {key: None if key in {"image_id", "portrait_image_id"} else without_image_links(item)
                for key, item in value.items()}
    return value


def duplicate_saved_project(db, source, name):
    copy = Project(
        user_id=source.user_id, name=name, project_type=source.project_type,
        description=source.description, visibility="private",
        brief_goal=source.brief_goal, brief_audience=source.brief_audience,
        brief_style=source.brief_style, brief_constraints=source.brief_constraints,
        brief_version=int(source.brief_version > 0),
    )
    db.add(copy)
    db.flush()
    for model in DRAFT_MODELS.get(source.project_type, ()):
        draft = db.scalar(select(model).where(model.project_id == source.id))
        if draft is None:
            continue
        values = {column.key: deepcopy(getattr(draft, column.key))
                  for column in inspect(model).column_attrs if column.key not in COPY_EXCLUSIONS}
        if model is GameProject:
            for field in ("characters", "levels"):
                values[field] = without_image_links(values[field])
        if model in (StoryCharacters, StoryScenes):
            field = "characters" if model is StoryCharacters else "scenes"
            values[field] = without_image_links(values[field])
        if model is VideoProject:
            values["shots"] = without_image_links(values["shots"])
        db.add(model(project_id=copy.id, **values))
    db.commit()
    db.refresh(copy)
    return copy
