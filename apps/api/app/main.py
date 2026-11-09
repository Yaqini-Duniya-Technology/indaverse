from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from app.core.config import settings
from app.core.http_security import HttpSecurityMiddleware

from app.api.v1.audio_assets import router as audio_assets_router
from app.api.v1.auth import router as auth_router
from app.api.v1.health import router as health_router
from app.api.v1.music_projects import router as music_projects_router
from app.api.v1.projects import router as projects_router


app = FastAPI(
    title="IndaVerse API",
    version="0.1.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# API ROUTES
# ============================================================

app.include_router(
    health_router,
    prefix="/api/v1",
)

app.include_router(
    auth_router,
    prefix="/api/v1",
)

app.include_router(
    projects_router,
    prefix="/api/v1",
)

app.include_router(
    music_projects_router,
    prefix="/api/v1",
)

app.include_router(
    audio_assets_router,
    prefix="/api/v1",
)


# ============================================================
# LOCAL MEDIA STORAGE
# ============================================================

UPLOADS_DIR = Path("uploads")

UPLOADS_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

# Uploaded media is served only by ownership-checked API routes.
app.add_middleware(HttpSecurityMiddleware)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

# Restored studio route registration
from importlib import import_module

for module_name in (
    "project_plans",
    "story_projects",
    "image_assets",
    "video_projects",
    "software_projects",
    "game_projects",
    "game_play_settings",
    "game_scenes",
):
    studio_router = import_module(f"app.api.v1.{module_name}").router

    # Some modules include child routers themselves.
    existing = {
        (route.path, method)
        for route in app.routes
        for method in (getattr(route, "methods", None) or ())
    }
    proposed = {
        ("/api/v1" + route.path, method)
        for route in studio_router.routes
        for method in (getattr(route, "methods", None) or ())
    }

    if proposed and proposed <= existing:
        continue
    if proposed & existing:
        raise RuntimeError(
            f"Partially duplicated routes in {module_name}; inspect registration."
        )
    app.include_router(studio_router, prefix="/api/v1")

from app.api.v1.studio_draft_imports import router as studio_draft_imports_router
app.include_router(studio_draft_imports_router, prefix="/api/v1")

from app.api.v1.demo_projects import router as demo_projects_router
app.include_router(demo_projects_router, prefix="/api/v1")

from app.api.v1.creative_workspace import router as creative_workspace_router
app.include_router(creative_workspace_router, prefix="/api/v1")

from app.api.v1.video_clip_export import router as video_clip_export_router
app.include_router(video_clip_export_router, prefix="/api/v1")

from app.api.v1.video_sequence import router as video_sequence_router
app.include_router(video_sequence_router, prefix="/api/v1")

from app.api.v1.music_session import router as music_session_router
app.include_router(music_session_router, prefix="/api/v1")

from app.api.v1.creator_delivery import router as creator_delivery_router
app.include_router(creator_delivery_router, prefix="/api/v1")

from app.api.v1.credits import router as credits_router
app.include_router(credits_router, prefix="/api/v1")
