from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SoftwareSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    kind: Literal["hero", "text", "cards", "form", "call_to_action"] = "text"
    heading: str = Field(default="", max_length=200)
    content: str = Field(default="", max_length=10000)
    link_path: str = Field(default="", max_length=200, pattern=r"^(/[a-zA-Z0-9/_-]*)?$", exclude_if=lambda v: not v)


class SoftwarePage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=150)
    path: str = Field(min_length=1, max_length=200, pattern=r"^/[a-zA-Z0-9/_-]*$")
    nav_label: str = Field(default="", max_length=80, exclude_if=lambda v: not v)
    seo_title: str = Field(default="", max_length=150, exclude_if=lambda v: not v)
    seo_description: str = Field(default="", max_length=300, exclude_if=lambda v: not v)
    social_title: str = Field(default="", max_length=150, exclude_if=lambda v: not v)
    social_description: str = Field(default="", max_length=300, exclude_if=lambda v: not v)
    sections: list[SoftwareSection] = Field(default_factory=list, max_length=30)

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("sections")
    @classmethod
    def unique_sections(cls, values):
        ids = [item.id for item in values]
        if len(ids) != len(set(ids)):
            raise ValueError("Section IDs must be unique within each page.")
        return values


class SoftwareFeature(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    priority: Literal["must_have", "should_have", "later"] = "must_have"

    @field_validator("title", mode="before")
    @classmethod
    def clean_title(cls, value):
        return value.strip() if isinstance(value, str) else value


class SoftwareSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0, strict=True)
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=10000)
    platform: Literal["web", "mobile", "web_and_mobile"] = "web"
    pages: list[SoftwarePage] = Field(default_factory=list, max_length=50)
    features: list[SoftwareFeature] = Field(default_factory=list, max_length=100)

    @field_validator("title", "description", mode="before")
    @classmethod
    def clean_metadata(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("pages")
    @classmethod
    def unique_pages(cls, values):
        ids = [item.id for item in values]
        paths = [item.path for item in values]
        if len(ids) != len(set(ids)) or len(paths) != len(set(paths)):
            raise ValueError("Page IDs and paths must be unique.")
        total = sum(
            len(section.heading) + len(section.content)
            for page in values for section in page.sections
        )
        if total > 500000:
            raise ValueError("Page content may contain at most 500,000 characters.")
        return values

    @field_validator("features")
    @classmethod
    def unique_features(cls, values):
        ids = [item.id for item in values]
        if len(ids) != len(set(ids)):
            raise ValueError("Feature IDs must be unique.")
        return values


class SoftwareResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: int
    title: str
    description: str
    platform: Literal["web", "mobile", "web_and_mobile"]
    pages: list[SoftwarePage]
    features: list[SoftwareFeature]
    version: int
    created_at: datetime
    updated_at: datetime
