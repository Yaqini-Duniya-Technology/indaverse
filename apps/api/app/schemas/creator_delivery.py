import re
from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class DeliveryModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class PlaytestReport(DeliveryModel):
    scene_version: int = Field(ge=1)
    gems: int = Field(ge=0, le=50)
    falls: int = Field(ge=0, le=10000)
    resets: int = Field(ge=0, le=10000)
    checkpoint: bool
    completed: bool
    note: str = Field(default="", max_length=1000)


class CampaignAsset(DeliveryModel):
    kind: Literal["image", "video"]
    project_id: int = Field(gt=0)
    id: str = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def validate_id(self):
        if not re.fullmatch(r"[1-9][0-9]{0,9}" if self.kind == "image" else r"[a-f0-9]{32}", self.id):
            raise ValueError("Invalid asset ID.")
        return self


class CampaignPost(DeliveryModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    channel: Literal["instagram", "youtube", "tiktok", "linkedin", "facebook", "other"]
    text: str = Field(alias="copy", min_length=1, max_length=2200)
    status: Literal["draft", "review", "ready", "posted_manually"] = "draft"
    scheduled_local: str = Field(default="", pattern=r"^(\d{4}-\d\d-\d\dT\d\d:\d\d)?$")
    timezone: str = Field(default="Africa/Lagos", max_length=64)
    notes: str = Field(default="", max_length=500)
    landing_url: str = Field(default="", max_length=500)
    utm_source: str = Field(default="", max_length=80)
    utm_medium: str = Field(default="", max_length=80)
    utm_campaign: str = Field(default="", max_length=80)
    assets: list[CampaignAsset] = Field(default_factory=list, max_length=8)

    @field_validator("scheduled_local")
    @classmethod
    def valid_date(cls, value):
        if value:
            datetime.fromisoformat(value)
        return value

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value):
        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError) as exc:
            raise ValueError("Enter a valid IANA timezone such as Africa/Lagos.") from exc
        return value

    @field_validator("landing_url")
    @classmethod
    def valid_landing(cls, value):
        if value:
            parsed = urlsplit(value)
            if (parsed.scheme != "https" or not parsed.hostname or parsed.username is not None
                    or parsed.password is not None or any(c.isspace() or c == "\\" or not c.isprintable() for c in value)):
                raise ValueError("Use an HTTPS landing URL without credentials.")
        return value


class CampaignSave(DeliveryModel):
    version: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=150)
    posts: list[CampaignPost] = Field(default_factory=list, max_length=30)

    @field_validator("posts")
    @classmethod
    def unique_posts(cls, posts):
        if len({post.id for post in posts}) != len(posts):
            raise ValueError("Post IDs must be unique.")
        return posts


class PilotRequest(DeliveryModel):
    provider: Literal["fixture"]
    consent: Literal[True]
    prompt: str = Field(min_length=3, max_length=800)
