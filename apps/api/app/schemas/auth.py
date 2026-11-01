from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserRegister(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("username", mode="before")
    @classmethod
    def clean_username(cls, value):
        return value.strip() if isinstance(value, str) else value

    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    username: str
    is_active: bool
    is_verified: bool

    model_config = {
        "from_attributes": True,
    }