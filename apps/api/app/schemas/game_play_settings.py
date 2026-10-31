from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SpawnPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int = Field(ge=0, le=776, strict=True)
    y: int = Field(ge=0, le=366, strict=True)


class Collectible(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    x: int = Field(ge=10, le=790, strict=True)
    y: int = Field(ge=10, le=390, strict=True)


class Platform(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    x: int = Field(ge=0, le=799, strict=True)
    y: int = Field(ge=0, le=399, strict=True)
    w: int = Field(ge=24, le=800, strict=True)
    h: int = Field(ge=5, le=100, strict=True)

    @model_validator(mode="after")
    def within_canvas(self):
        if self.x + self.w > 800 or self.y + self.h > 400:
            raise ValueError("Platforms must fit inside the 800 by 400 play area.")
        return self


class ExitArea(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int = Field(ge=0, le=764, strict=True)
    y: int = Field(ge=0, le=350, strict=True)


class PlayLayout(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spawn: SpawnPoint
    exit: ExitArea
    platforms: list[Platform] = Field(min_length=1, max_length=50)
    collectibles: list[Collectible] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def validate_layout(self):
        for values in (self.platforms, self.collectibles):
            ids = [item.id for item in values]
            if len(ids) != len(set(ids)):
                raise ValueError("IDs must be unique within each list.")
        positions = [(item.x, item.y) for item in self.collectibles]
        if len(positions) != len(set(positions)):
            raise ValueError("Collectibles must use different positions.")

        def overlaps(x, y, w, h, other):
            return (
                x < other.x + other.w and x + w > other.x
                and y < other.y + other.h and y + h > other.y
            )

        for platform in self.platforms:
            if overlaps(self.spawn.x, self.spawn.y, 24, 34, platform):
                raise ValueError("The player spawn cannot be inside a platform.")
            if overlaps(self.exit.x, self.exit.y, 36, 50, platform):
                raise ValueError("The exit cannot be inside a platform.")
            for item in self.collectibles:
                if overlaps(item.x - 10, item.y - 10, 20, 20, platform):
                    raise ValueError("Collectibles cannot be inside platforms.")
        return self


class PlaySettingsSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0, strict=True)
    layout: PlayLayout


class PlaySettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: int
    layout: PlayLayout
    version: int
    created_at: datetime
    updated_at: datetime
