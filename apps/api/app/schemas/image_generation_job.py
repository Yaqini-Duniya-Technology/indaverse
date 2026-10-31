from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ImageGenerationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=150)
    purpose: Literal["character", "scene", "location", "reference", "cover"]
    prompt: str = Field(min_length=1, max_length=5000)

    @field_validator("label", "prompt", mode="before")
    @classmethod
    def clean_text(cls, value):
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Enter text containing more than spaces.")
        return value.strip()


class ImageGenerationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    label: str
    purpose: str
    prompt: str
    provider: str
    status: str
    error_message: str | None
    created_at: datetime


class ImageGenerationPage(BaseModel):
    items: list[ImageGenerationResponse]
    has_more: bool
    limit: int
    offset: int
