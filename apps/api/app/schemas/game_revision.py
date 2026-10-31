from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.game_project import GameAssetRequirement, GameCharacter, GameLevel


class GameSnapshot(BaseModel):
    title: str
    dimension: Literal["2d", "3d"]
    genre: str
    concept: str
    core_loop: str
    controls: str
    characters: list[GameCharacter]
    levels: list[GameLevel]
    assets: list[GameAssetRequirement]


class GameRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    version: int
    reason: str
    snapshot: GameSnapshot
    created_at: datetime


class GameRevisionPage(BaseModel):
    items: list[GameRevisionResponse]
    total: int
    limit: int
    offset: int
