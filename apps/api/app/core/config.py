from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.credit_policy import CreditPolicy, default_credit_policy

BASE_DIR = Path(__file__).resolve().parents[4]
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "IndaVerse"
    next_public_api_url: str = "http://localhost:8002"
    api_url: str = "http://localhost:8002"
    app_url: str = "http://localhost:3000"
    database_url: str
    redis_url: str
    secret_key: str
    private_beta: bool = False
    credit_enforcement: bool = False
    credit_policy: CreditPolicy = Field(default_factory=default_credit_policy)
    cookie_secure: bool = False
    video_clip_export_enabled: bool = False
    access_token_expire_minutes: int = Field(default=60, ge=5, le=1440)
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]

    model_config = SettingsConfigDict(
        env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore",
    )

    @field_validator("cors_origins")
    @classmethod
    def valid_origins(cls, values):
        if not values:
            raise ValueError("At least one explicit CORS origin is required.")
        for value in values:
            parsed = urlsplit(value)
            if (parsed.scheme not in ("http", "https") or not parsed.hostname
                    or parsed.username or parsed.password or parsed.path
                    or parsed.query or parsed.fragment or "*" in value):
                raise ValueError("CORS origins must be explicit HTTP(S) origins without paths.")
        return values

    @field_validator("allowed_hosts")
    @classmethod
    def valid_hosts(cls, values):
        if not values or any(not v or "*" in v or "/" in v or ":" in v for v in values):
            raise ValueError("Use explicit hostnames without ports or wildcards.")
        return values

    @model_validator(mode="after")
    def production_settings(self):
        if self.app_env.lower() == "production":
            if len(self.secret_key) < 32 or self.secret_key.startswith("REPLACE_"):
                raise ValueError("Production requires an independent secret of at least 32 characters.")
            if not self.cookie_secure:
                raise ValueError("Production requires COOKIE_SECURE=true.")
            if any(not value.startswith("https://") for value in [self.app_url, self.api_url, *self.cors_origins]):
                raise ValueError("Production web/API URLs and CORS origins must use HTTPS.")
        return self


settings = Settings()
