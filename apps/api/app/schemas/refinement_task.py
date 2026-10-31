from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TaskEvidenceReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["audio", "song_revision", "image", "video_revision"]
    id: int = Field(ge=1, strict=True)


class RefinementTaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1, strict=True)
    status: Literal["todo", "in_progress", "done"]
    resolution: str = Field(default="", max_length=5000)
    evidence: list[TaskEvidenceReference] = Field(default_factory=list, max_length=20)

    @field_validator("evidence")
    @classmethod
    def unique_evidence(cls, value):
        keys = [(item.kind, item.id) for item in value]
        if len(keys) != len(set(keys)):
            raise ValueError("Evidence links must be unique.")
        return value

    @field_validator("resolution", mode="before")
    @classmethod
    def clean_resolution(cls, value):
        return value.strip() if isinstance(value, str) else value


class RefinementTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    review_id: int
    source_number: int
    title: str
    source_feedback: str
    status: Literal["todo", "in_progress", "done"]
    resolution: str
    evidence: list[TaskEvidenceReference] = Field(default_factory=list)
    version: int
    created_at: datetime
    updated_at: datetime


class RefinementTaskPage(BaseModel):
    items: list[RefinementTaskResponse]
    has_more: bool
    limit: int
    offset: int
