from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StoryCharacter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=150)
    role: str = Field(default="", max_length=150)
    description: str = Field(default="", max_length=10000)
    portrait_image_id: int | None = Field(default=None, ge=1, strict=True)

    @field_validator("name", "role", "description", mode="before")
    @classmethod
    def clean_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class CharactersSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0, strict=True)
    characters: list[StoryCharacter] = Field(max_length=100)

    @field_validator("characters")
    @classmethod
    def unique_ids(cls, value):
        ids = [character.id for character in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Character IDs must be unique.")
        if sum(len(character.description) for character in value) > 200000:
            raise ValueError("Character descriptions may total at most 200,000 characters.")
        return value


class CharactersResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: int
    characters: list[StoryCharacter]
    version: int
    updated_at: datetime | None
