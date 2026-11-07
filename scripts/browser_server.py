"""Disposable browser fixture server; never reads the user's application database."""
import os
from pathlib import Path
import secrets
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "apps/api"))
with tempfile.TemporaryDirectory(prefix="indaverse-browser-") as temporary:
    os.environ.update(
        DATABASE_URL="sqlite:///" + str(Path(temporary) / "fixture.sqlite"),
        REDIS_URL="redis://127.0.0.1:6379/15", SECRET_KEY=secrets.token_urlsafe(48),
        APP_ENV="test", VIDEO_CLIP_EXPORT_ENABLED="true", COOKIE_SECURE="false", CORS_ORIGINS='["http://127.0.0.1:3012"]',
        ALLOWED_HOSTS='["127.0.0.1","localhost","testserver"]',
    )
    import app.models
    from app.database.connection import Base, engine
    Base.metadata.create_all(engine)
    from app.main import app
    import uvicorn
    try:
        uvicorn.run(app, host="127.0.0.1", port=8012, log_level="warning")
    finally:
        engine.dispose()
