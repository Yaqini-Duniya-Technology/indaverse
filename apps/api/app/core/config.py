from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[4]
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "IndaVerse"

    next_public_api_url: str = "http://localhost:8000"

    api_url: str = "http://localhost:8000"
    app_url: str = "http://localhost:3000"

    database_url: str
    redis_url: str

    secret_key: str

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()