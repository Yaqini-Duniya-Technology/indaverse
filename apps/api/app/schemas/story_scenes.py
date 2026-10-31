from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


ReferenceID = Annotated[
    str, Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$"),
]


class StoryScene(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: ReferenceID
    title: str = Field(min_length=1, max_length=150)
    setting: str = Field(default="", max_length=1000)
    summary: str = Field(default="", max_length=10000)
    chapter_id: ReferenceID | None = None
    character_ids: list[ReferenceID] = Field(default_factory=list, max_length=100)
    image_id: int | None = Field(default=None, ge=1, strict=True)

    @field_validator("title", "setting", "summary", mode="before")
    @classmethod
    def clean_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("character_ids")
    @classmethod
    def unique_characters(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("A character may be linked only once per scene.")
        return value


class ScenesSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0, strict=True)
    scenes: list[StoryScene] = Field(max_length=200)

    @field_validator("scenes")
    @classmethod
    def validate_scenes(cls, value):
        ids = [scene.id for scene in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Scene IDs must be unique.")
        if sum(len(scene.summary) + len(scene.setting) for scene in value) > 500000:
            raise ValueError("Scene text may total at most 500,000 characters.")
        return value


class ScenesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: int
    scenes: list[StoryScene]
    version: int
    updated_at: datetime | None
