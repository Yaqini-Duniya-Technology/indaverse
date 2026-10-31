from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MusicGenerationJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    provider: str
    provider_job_id: str | None

    prompt: str
    output_type: str
    language: str
    genre: str | None
    mood: str | None
    bpm: int | None

    status: str
    audio_url: str | None
    duration_seconds: float | None
    title: str | None
    error_message: str | None

    created_at: datetime
    updated_at: datetime


class MusicGenerationJobListResponse(BaseModel):
    items: list[MusicGenerationJobResponse]
    total: int
    limit: int
    offset: int
