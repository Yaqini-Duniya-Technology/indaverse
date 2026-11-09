"""Editable beta plan policy. Amounts are integer credits or NGN kobo."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PlanKey = Literal["free", "basic", "pro", "studio", "enterprise"]
Source = Literal["subscription", "purchase", "promotion", "adjustment"]
Action = Literal["image_generation", "image_edit", "story_generation", "music_generation",
                 "voice_generation", "video_generation", "game_assistance", "website_generation",
                 "code_assistance"]
ProjectType = Literal["music", "video", "music_video", "voice", "story", "game", "website", "app"]
ACTIONS = list(Action.__args__)
PROJECT_TYPES = list(ProjectType.__args__)
PLAN_KEYS = list(PlanKey.__args__)
MAX_CREDITS = 1_000_000_000


class CreditPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    monthly_kobo: int | None = Field(default=None, ge=0, le=MAX_CREDITS, strict=True)
    annual_kobo: int | None = Field(default=None, ge=0, le=MAX_CREDITS, strict=True)
    included_credits: int = Field(default=0, ge=0, le=MAX_CREDITS, strict=True)
    monthly_downloads: int | None = Field(default=None, ge=0, strict=True)
    project_limit: int | None = Field(default=None, ge=0, strict=True)
    storage_bytes: int | None = Field(default=None, ge=0, strict=True)
    max_export_edge: int | None = Field(default=None, ge=1, strict=True)
    premium_exports: bool = False
    project_types: list[ProjectType] = Field(default_factory=lambda: PROJECT_TYPES.copy())
    ai_actions: list[Action] = Field(default_factory=list)


class CreditPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plans: dict[PlanKey, CreditPlan]
    action_costs: dict[Action, Annotated[int, Field(strict=True, ge=1, le=MAX_CREDITS)]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def complete(self):
        if set(self.plans) != set(PLAN_KEYS):
            raise ValueError("Configure all five credit plans.")
        if any(type(cost) is not int or not 1 <= cost <= MAX_CREDITS for cost in self.action_costs.values()):
            raise ValueError("Action costs must be positive whole credits.")
        return self


def default_credit_policy() -> CreditPolicy:
    return CreditPolicy(plans={
        "free": CreditPlan(name="Free", monthly_downloads=5, project_limit=3, max_export_edge=1920),
        "basic": CreditPlan(name="Creator Basic", monthly_downloads=25, project_limit=20,
                            max_export_edge=1920, ai_actions=["image_generation", "image_edit"]),
        "pro": CreditPlan(name="Creator Pro", monthly_downloads=100, project_limit=100,
                          max_export_edge=2560, premium_exports=True, ai_actions=ACTIONS.copy()),
        "studio": CreditPlan(name="Creator Studio", monthly_downloads=500, project_limit=500,
                             max_export_edge=4096, premium_exports=True, ai_actions=ACTIONS.copy()),
        "enterprise": CreditPlan(name="Enterprise", premium_exports=True, ai_actions=ACTIONS.copy()),
    })
