from datetime import datetime

from pydantic import BaseModel, Field, field_validator


ALLOWED_PROJECT_TYPES = {
    "music",
    "video",
    "music_video",
    "voice",
    "story",
    "game",
    "website",
    "app",
}

ALLOWED_VISIBILITIES = {
    "private",
    "unlisted",
    "public",
}


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    project_type: str
    description: str | None = None
    visibility: str = "private"


class ProjectResponse(BaseModel):
    id: int
    user_id: int
    name: str
    project_type: str
    description: str | None
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }

    cover_image_id: int | None
    cover_version: int


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=5000)

    model_config = {"extra": "forbid"}

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, value):
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Project name cannot be empty.")
        return value.strip()

    @field_validator("description", mode="before")
    @classmethod
    def clean_description(cls, value):
        if isinstance(value, str):
            return value.strip() or None
        return value
