from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.video_project import VideoShot


class VideoSnapshot(BaseModel):
    title: str
    script: str
    aspect_ratio: Literal["16:9", "9:16", "1:1"]
    shots: list[VideoShot]


class VideoRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    version: int
    reason: str
    snapshot: VideoSnapshot
    created_at: datetime


class VideoRevisionPage(BaseModel):
    items: list[VideoRevisionResponse]
    total: int
    limit: int
    offset: int
