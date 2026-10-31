from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SceneModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ScenePoint(SceneModel):
    x: float = Field(ge=-50, le=50, strict=True)
    y: float = Field(ge=0, le=25, strict=True)
    z: float = Field(ge=-50, le=50, strict=True)


class ScenePlatform(SceneModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    x: float = Field(ge=-50, le=50, strict=True)
    z: float = Field(ge=-50, le=50, strict=True)
    w: float = Field(ge=1, le=40, strict=True)
    d: float = Field(ge=1, le=40, strict=True)
    top: float = Field(ge=0, le=20, strict=True)

    @model_validator(mode="after")
    def inside_world(self):
        if abs(self.x) + self.w / 2 > 50 or abs(self.z) + self.d / 2 > 50:
            raise ValueError("Platforms must fit within the -50 to 50 world bounds.")
        return self


class SceneCollectible(ScenePoint):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")


class SceneLayout(SceneModel):
    spawn: ScenePoint
    exit: ScenePoint
    platforms: list[ScenePlatform] = Field(min_length=1, max_length=50)
    collectibles: list[SceneCollectible] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def validate_scene(self):
        for items in (self.platforms, self.collectibles):
            ids = [item.id for item in items]
            if len(ids) != len(set(ids)):
                raise ValueError("IDs must be unique within each scene list.")

        positions = [(item.x, item.y, item.z) for item in self.collectibles]
        if len(positions) != len(set(positions)):
            raise ValueError("Collectibles must have different positions.")

        # Spawn and exit use feet-level coordinates.
        def supported(point, margin):
            return any(
                abs(point.y - platform.top) < 0.001
                and abs(point.x - platform.x) + margin <= platform.w / 2
                and abs(point.z - platform.z) + margin <= platform.d / 2
                for platform in self.platforms
            )

        if not supported(self.spawn, 0.3):
            raise ValueError("Place the player spawn on a platform with room for the player.")
        if not supported(self.exit, 0.4):
            raise ValueError("Place the exit on a platform with room around it.")

        # Platforms are solid boxes extending 0.6 units below their top.
        def intersects(point, radius, height):
            return any(
                abs(point.x - platform.x) < platform.w / 2 + radius
                and abs(point.z - platform.z) < platform.d / 2 + radius
                and point.y < platform.top
                and point.y + height > platform.top - 0.6
                for platform in self.platforms
            )

        if intersects(self.spawn, 0.3, 1.1):
            raise ValueError("The player spawn cannot intersect another platform.")
        if intersects(self.exit, 0.4, 2.3):
            raise ValueError("The exit cannot intersect another platform.")

        for item in self.collectibles:
            # Collectible coordinates describe the centre of the gem.
            if item.y < 0.3 or any(
                abs(item.x - platform.x) < platform.w / 2 + 0.3
                and abs(item.z - platform.z) < platform.d / 2 + 0.3
                and item.y - 0.3 < platform.top
                and item.y + 0.3 > platform.top - 0.6
                for platform in self.platforms
            ):
                raise ValueError("Place collectibles clear of platform surfaces.")
        return self


class SceneSave(SceneModel):
    expected_version: int = Field(ge=0, strict=True)
    layout: SceneLayout


class SceneResponse(SceneModel):
    model_config = ConfigDict(
        extra="forbid", allow_inf_nan=False, from_attributes=True,
    )

    project_id: int
    layout: SceneLayout
    version: int
    created_at: datetime
    updated_at: datetime
