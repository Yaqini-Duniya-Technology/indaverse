from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StepFeedback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_number: int = Field(ge=1, le=50, strict=True)
    note: str = Field(min_length=1, max_length=2000)

    @field_validator("note", mode="before")
    @classmethod
    def clean_note(cls, value):
        return value.strip() if isinstance(value, str) else value


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_plan_version: int = Field(ge=1, strict=True)
    expected_brief_version: int = Field(ge=0, strict=True)
    decision: Literal["needs_changes", "approved"]
    summary: str = Field(min_length=1, max_length=5000)
    step_feedback: list[StepFeedback] = Field(default_factory=list, max_length=50)

    @field_validator("summary", mode="before")
    @classmethod
    def clean_summary(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("step_feedback")
    @classmethod
    def unique_steps(cls, values):
        numbers = [value.step_number for value in values]
        if len(numbers) != len(set(numbers)):
            raise ValueError("Add only one feedback entry per step.")
        return values


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    reviewer_id: int
    plan_version: int
    brief_version: int
    decision: Literal["needs_changes", "approved"]
    summary: str
    step_feedback: list[StepFeedback]
    plan_snapshot: dict
    created_at: datetime


class ReviewPage(BaseModel):
    items: list[ReviewResponse]
    has_more: bool
    limit: int
    offset: int
