from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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

app.mount(
    "/uploads",
    StaticFiles(directory=UPLOADS_DIR),
    name="uploads",
)

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
