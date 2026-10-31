# IndaVerse

A creative workspace developed by Yaqini & Duniya Technology.

Organise creative direction, drafts and assets across Music, Video, Story,
Web & App, and Game studios.

## Current MVP

- Account registration, sign-in and private project workflows.
- Project creation, editing, search and studio navigation.
- Saved creative briefs, project plans and reviews.
- Music writing, song revisions and generation request history.
- Story characters, scenes and reading previews.
- Video scripts, shot planning and revision history.
- Website and app design blueprints.
- 2D and 3D game blueprints, import validation and export.
- Game draft recovery and optional version-checked autosave.
- Visual layout tools, saved 3D scenes and browser prototype testing.

## Technology

Next.js, React, TypeScript, Three.js, FastAPI, Pydantic, SQLAlchemy,
PostgreSQL, Alembic and Redis.

## Windows setup

Prerequisites: Python 3.13, a compatible Node.js installation and Docker
Desktop with its Linux engine running.

From the repository root:

    python -m venv apps/api/.venv
    & "apps/api/.venv/Scripts/python.exe" -m pip install -r apps/api/requirements.txt
    npm.cmd --prefix apps/web ci

For a fresh installation, copy .env.example to .env and
apps/web/.env.local.example to apps/web/.env.local.
Preserve existing configuration files.

Replace REPLACE_WITH_RANDOM_HEX in both database settings with the same
random hexadecimal password. Replace REPLACE_WITH_RANDOM_SECRET with an
independent random secret. Generate values locally with Python's secrets
module. Never commit real credentials.

Changing configuration does not change the password in an existing
PostgreSQL volume.

Start the application:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-IndaVerse.ps1

The launcher starts database services, applies migrations and opens missing
API and web processes. Keep their terminals open.

- Dashboard: http://localhost:3000/dashboard
- API documentation: http://localhost:8002/docs
- Health: http://localhost:8002/api/v1/health

Use localhost consistently in the browser. Port 8002 avoids another local
application on port 8000. Any existing server on port 3000 must be IndaVerse.

## Verification

Web production build:

    npm.cmd --prefix apps/web run build

API regression tests use isolated database fixtures. Configure test-only
DATABASE_URL, REDIS_URL and SECRET_KEY before running pytest from apps/api.
Do not run tests against a production database.

SQLite tests do not verify PostgreSQL row-lock concurrency. Browser
playtests are also necessary for rendering and interaction.

## Demo

See [the demo walkthrough](docs/DEMO.md).

## Limitations

This is a development MVP. AI music and image generation providers are
not connected. Recording a generation request does not generate an asset.

Game blueprints describe intended gameplay. Importing one does not generate
models, animations, levels or gameplay systems. The browser player is a
prototype, not a complete game engine.

Blueprint exports exclude image files, playable layouts and revision
history. Source code and blueprint exports are not full database backups.

Production deployment, media access controls and dependency security
require a release review.

## Roadmap

- Connected AI generation providers.
- Richer gameplay and character assets.
- Expanded scene editing.
- Complete project packaging and playable build export.
- Production deployment and operational hardening.

These are planned capabilities.
