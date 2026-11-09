"""Sandbox checkout catalogue. Prices are editable integer NGN kobo."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BundleKey = Literal["starter", "creator", "professional", "studio"]
Period = Literal["monthly", "annual"]


class CreditBundle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    credits: int = Field(default=0, ge=0, le=1_000_000_000, strict=True)
    amount_kobo: int | None = Field(default=None, gt=0, le=1_000_000_000, strict=True)


def default_bundles():
    return {key: CreditBundle(name=key.title() + " Credits")
            for key in ("starter", "creator", "professional", "studio")}
