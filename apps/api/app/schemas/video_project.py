from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class VideoShot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=10000)
    camera_direction: str = Field(default="", max_length=1000)
    duration_seconds: int = Field(default=5, ge=1, le=300, strict=True)
    image_id: int | None = Field(default=None, ge=1, strict=True)

    @field_validator("title", mode="before")
    @classmethod
    def clean_title(cls, value):
        return value.strip() if isinstance(value, str) else value


class VideoSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0, strict=True)
    title: str = Field(min_length=1, max_length=150)
    script: str = Field(default="", max_length=100000)
    aspect_ratio: Literal["16:9", "9:16", "1:1"] = "16:9"
    shots: list[VideoShot] = Field(default_factory=list, max_length=200)

    @field_validator("title", mode="before")
    @classmethod
    def clean_title(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("shots")
    @classmethod
    def validate_shots(cls, value):
        ids = [shot.id for shot in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Shot IDs must be unique.")
        if sum(len(shot.description) + len(shot.camera_direction) for shot in value) > 500000:
            raise ValueError("Shot descriptions and camera directions exceed the text limit.")
        return value


class VideoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: int
    title: str
    script: str
    aspect_ratio: Literal["16:9", "9:16", "1:1"]
    shots: list[VideoShot]
    version: int
    created_at: datetime
    updated_at: datetime
