from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from redis import Redis
from app.core.config import settings
from app.database.connection import engine

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "indaverse-api"}


@router.get("/ready")
def readiness_check():
    checks = {}
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "unavailable"
    try:
        with Redis.from_url(settings.redis_url, socket_connect_timeout=2, socket_timeout=2) as redis:
            redis.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "unavailable"
    ready = all(value == "ok" for value in checks.values())
    return JSONResponse(
        {"status": "ready" if ready else "unavailable", "checks": checks},
        status_code=200 if ready else 503,
    )
