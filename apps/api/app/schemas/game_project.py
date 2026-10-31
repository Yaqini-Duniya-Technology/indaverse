from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class GameCharacter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=150)
    role: Literal["player", "ally", "enemy", "npc"] = "player"
    image_id: int | None = Field(default=None, gt=0, strict=True)
    description: str = Field(default="", max_length=5000)

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class GameLevel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    title: str = Field(min_length=1, max_length=150)
    setting: str = Field(default="", max_length=5000)
    objective: str = Field(default="", max_length=5000)
    challenges: str = Field(default="", max_length=5000)
    image_id: int | None = Field(default=None, gt=0, strict=True)

    @field_validator("title", mode="before")
    @classmethod
    def clean_title(cls, value):
        return value.strip() if isinstance(value, str) else value


class GameAssetRequirement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    title: str = Field(min_length=1, max_length=150)
    kind: Literal[
        "model", "sprite", "texture", "material", "animation", "vfx",
        "audio", "ui", "environment", "prefab", "shader", "other",
    ] = "sprite"
    description: str = Field(default="", max_length=5000)

    @field_validator("title", mode="before")
    @classmethod
    def clean_title(cls, value):
        return value.strip() if isinstance(value, str) else value


class GameSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0, strict=True)
    title: str = Field(min_length=1, max_length=150)
    dimension: Literal["2d", "3d"] = "2d"
    genre: str = Field(default="", max_length=100)
    concept: str = Field(default="", max_length=10000)
    core_loop: str = Field(default="", max_length=10000)
    controls: str = Field(default="", max_length=5000)
    characters: list[GameCharacter] = Field(default_factory=list, max_length=100)
    levels: list[GameLevel] = Field(default_factory=list, max_length=100)
    assets: list[GameAssetRequirement] = Field(default_factory=list, max_length=200)

    @field_validator("title", "genre", "concept", "core_loop", "controls", mode="before")
    @classmethod
    def clean_metadata(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("characters", "levels", "assets")
    @classmethod
    def unique_ids(cls, values):
        ids = [item.id for item in values]
        if len(ids) != len(set(ids)):
            raise ValueError("IDs must be unique within each list.")
        return values

    @model_validator(mode="after")
    def limit_total_content(self):
        total = sum(len(value) for value in (
            self.title, self.genre, self.concept, self.core_loop, self.controls,
        ))
        for items in (self.characters, self.levels, self.assets):
            for item in items:
                total += sum(
                    len(value) for value in item.model_dump().values()
                    if isinstance(value, str)
                )
        if total > 500000:
            raise ValueError("A game blueprint may contain at most 500,000 characters.")
        return self


class GameResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: int
    title: str
    dimension: Literal["2d", "3d"]
    genre: str
    concept: str
    core_loop: str
    controls: str
    characters: list[GameCharacter]
    levels: list[GameLevel]
    assets: list[GameAssetRequirement]
    version: int
    created_at: datetime
    updated_at: datetime
