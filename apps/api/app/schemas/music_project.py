from datetime import datetime

from pydantic import BaseModel, Field


class MusicProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    artist: str | None = Field(default=None, max_length=150)
    genre: str | None = Field(default=None, max_length=100)
    mood: str | None = Field(default=None, max_length=100)
    bpm: int | None = Field(default=None, ge=1, le=300)

    lyrics_intro: str | None = None
    lyrics_verse_1: str | None = None
    lyrics_chorus: str | None = None
    lyrics_verse_2: str | None = None
    lyrics_bridge: str | None = None
    lyrics_outro: str | None = None


class MusicProjectUpdate(BaseModel):
    expected_updated_at: datetime

    title: str | None = Field(default=None, min_length=1, max_length=150)
    artist: str | None = Field(default=None, max_length=150)
    genre: str | None = Field(default=None, max_length=100)
    mood: str | None = Field(default=None, max_length=100)
    bpm: int | None = Field(default=None, ge=1, le=300)

    lyrics_intro: str | None = None
    lyrics_verse_1: str | None = None
    lyrics_chorus: str | None = None
    lyrics_verse_2: str | None = None
    lyrics_bridge: str | None = None
    lyrics_outro: str | None = None


class MusicProjectResponse(BaseModel):
    id: int
    project_id: int
    title: str
    artist: str | None
    genre: str | None
    mood: str | None
    bpm: int | None

    lyrics_intro: str | None
    lyrics_verse_1: str | None
    lyrics_chorus: str | None
    lyrics_verse_2: str | None
    lyrics_bridge: str | None
    lyrics_outro: str | None

    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }


class MusicGenerationRequest(BaseModel):
    prompt: str = Field(
        min_length=1,
        max_length=5000,
    )

    output_type: str = Field(
        default="vocal",
        pattern="^(vocal|instrumental)$",
    )

    language: str = Field(
        default="English",
        min_length=1,
        max_length=50,
    )

    genre: str | None = Field(
        default=None,
        max_length=100,
    )

    mood: str | None = Field(
        default=None,
        max_length=100,
    )

    bpm: int | None = Field(
        default=None,
        ge=1,
        le=300,
    )


class MusicGenerationResponse(BaseModel):
    provider: str
    provider_job_id: str
    status: str

    audio_url: str | None = None

    duration_seconds: float | None = None

    title: str | None = None

    error_message: str | None = None
