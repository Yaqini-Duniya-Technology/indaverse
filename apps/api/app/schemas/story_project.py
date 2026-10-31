from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StoryChapter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    title: str = Field(min_length=1, max_length=150)
    content: str = Field(default="", max_length=100000)

    @field_validator("title", mode="before")
    @classmethod
    def clean_title(cls, value):
        return value.strip() if isinstance(value, str) else value


class StorySave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Zero creates a first draft; subsequent saves require its current version.
    expected_version: int = Field(ge=0, strict=True)
    title: str = Field(min_length=1, max_length=150)
    synopsis: str = Field(default="", max_length=10000)
    genre: str = Field(default="", max_length=100)
    chapters: list[StoryChapter] = Field(default_factory=list, max_length=100)

    @field_validator("title", "synopsis", "genre", mode="before")
    @classmethod
    def clean_metadata(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("chapters")
    @classmethod
    def validate_chapters(cls, value):
        ids = [chapter.id for chapter in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Chapter IDs must be unique.")
        if sum(len(chapter.content) for chapter in value) > 1000000:
            raise ValueError("A story may contain at most 1,000,000 content characters.")
        return value


class StoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: int
    title: str
    synopsis: str
    genre: str
    chapters: list[StoryChapter]
    version: int
    created_at: datetime
    updated_at: datetime
