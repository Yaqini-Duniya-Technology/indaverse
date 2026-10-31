from pydantic import BaseModel, ConfigDict, Field


class CreativeBriefUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0)
    goal: str = Field(max_length=5000)
    audience: str = Field(max_length=2000)
    style: str = Field(max_length=2000)
    constraints: str = Field(max_length=5000)


class CreativeBriefResponse(BaseModel):
    project_id: int
    version: int
    goal: str
    audience: str
    style: str
    constraints: str
