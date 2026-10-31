from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlanAssetReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["audio", "song_revision", "image", "video_revision"]
    id: int = Field(gt=0, strict=True)


class PlanStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=5000)
    status: Literal["todo", "in_progress", "done"] = "todo"
    assets: list[PlanAssetReference] = Field(default_factory=list, max_length=20)

    @field_validator("assets")
    @classmethod
    def unique_assets(cls, values):
        keys = [(value.kind, value.id) for value in values]
        if len(keys) != len(set(keys)):
            raise ValueError("An asset can only be linked once per step.")
        return values

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Step title cannot be blank.")
        return value


class PlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_brief_version: int = Field(ge=0)


class PlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)
    steps: list[PlanStep] = Field(min_length=1, max_length=50)


class PlanResponse(BaseModel):
    project_id: int
    version: int
    brief_version: int
    current_brief_version: int
    stale: bool
    planner: str
    brief_snapshot: dict[str, str]
    steps: list[PlanStep]
    created_at: datetime
    updated_at: datetime


class PlanReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)
    expected_brief_version: int = Field(ge=0)
