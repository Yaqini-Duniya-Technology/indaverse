<div align="center">

# IndaVerse

### One creative universe. Five studios. Your ideas, structured for creation.

**Music · Video · Stories · Web & Apps · 2D/3D Games**

An evolving, multi-studio creative workspace by **[Yaqini & Duniya Technology](https://yd.ydtech.workers.dev)**.

**Development stage: Functional local MVP · Active engineering · Not yet production launched**

[Explore the source](https://github.com/Yaqini-Duniya-Technology/indaverse) · [Demo walkthrough](docs/DEMO.md) · [Founder portfolio](https://indaobanyi.vercel.app)

</div>

---

## The idea

Creative work is often fragmented across documents, planning tools, file folders and disconnected apps. **IndaVerse** brings creative briefs, drafts, revisions, visual assets and project organization into one connected workspace.

The long-term vision is to help creators turn ideas into music, stories, video concepts, software blueprints and interactive game experiences—while keeping people in control of creative decisions.

**What exists today:** an integrated local development MVP for organizing projects, drafting and revising content, planning creative work, and prototyping aspects of 3D game scenes. **What does not exist yet:** a fully connected generative-AI production studio or complete game-generation engine.

## Five creative studios

| Studio | Available development-MVP capabilities | Next major goal |
| --- | --- | --- |
| **Music Studio** | Music project records, songwriting workflows, revisions, audio assets and generation-request history | Connect and validate a real music generation provider |
| **Story Studio** | Story projects, characters, scenes and reading previews | Improve long-form composition and creative assistance |
| **Video Studio** | Video project records, scripts, shot planning and revision history | Integrate production-grade media generation and export |
| **Web & App Studio** | Software-project records and website/app design blueprints | Progress from planning artifacts toward reproducible code generation |
| **Game Studio** | 2D/3D game blueprints, validation/import/export, revisions, visual layout, saved 3D scenes and browser prototype playtesting | Expand character assets, gameplay systems and complete playable builds |

These capabilities are at different levels of maturity. A saved blueprint, script or generation request is **not** a finished generated song, video, application or game.

## Current development stage

| Area | Status | Evidence in this repository |
| --- | --- | --- |
| Full-stack foundations | **Implemented for local development** | Next.js/React frontend, FastAPI routes, PostgreSQL models, Alembic migrations |
| Accounts and private projects | **Development MVP** | Auth and project API modules; dashboard and studio navigation |
| Creative planning and revisions | **Development MVP** | Creative briefs, project plans, revisions, scenes and project models |
| Game-blueprint workflow | **Prototype implemented** | Blueprint import, validation, revisions, scene tools and browser prototype |
| Automated checks | **Test suites present** | API regression tests under `apps/api/tests/`; frontend build command |
| Generative AI providers | **Not integrated** | Unavailable music-provider fallback; generation requests do not create media |
| Production deployment | **Not established** | Local setup and release review remain necessary |
| Real-world creator validation | **Not established** | Pilot usage, usability evidence and scalability testing remain future work |

**Maturity statement:** IndaVerse is a working **local development MVP with experimental studio features**. The codebase should not be presented as a publicly available AI media generator, finished game engine or production SaaS platform.

## Architecture at a glance

```text
Creator / browser
      |
      v
Next.js 16 + React + TypeScript web application
      |
      v
FastAPI / Pydantic REST endpoints
      |
      +---- Accounts, projects and studio workflows
      +---- Creative briefs, revisions and planning
      +---- Game scenes and blueprint validation
      +---- Provider abstraction (generative services not connected)
      |
      v
PostgreSQL + SQLAlchemy + Alembic migrations
      |
      +---- Redis in local service configuration
```

**Current stack:** Next.js 16, React 19, TypeScript, Three.js, Python, FastAPI, Pydantic, SQLAlchemy, PostgreSQL, Alembic and Redis.

The repository separates the frontend (`apps/web`) from the API (`apps/api`) so interfaces, studio models and generation-provider integrations can evolve independently.

## Why IndaVerse matters

- **For creators:** one organized place for concepts, drafts, characters, revisions and creative assets.
- **For developers:** a practical full-stack platform exploring multimodal workflows, stateful products and interactive scene editing.
- **For collaborators:** visible architecture, explicit capability boundaries and a roadmap that separates implemented features from ambition.
- **For emerging African digital creators:** a long-term vision of more accessible creative tools built with regional relevance in mind.

## Engineering documentation and delivery progress

- **[Architecture diagram](docs/ARCHITECTURE.md)** — visual overview of web, API, creative studios, storage and provider boundaries.
- **[Development milestone tracker](docs/MILESTONES.md)** — evidence-based status of implemented MVP work, prototypes and planned releases.
- **[Demonstration gallery](docs/GALLERY.md)** — curated links to studio interfaces, the Zamara blueprint and screenshot slots awaiting real captures.
- **[GitHub Actions CI](.github/workflows/ci.yml)** — automated Next.js build and isolated FastAPI regression tests. Check the workflow's latest run before interpreting its status.

These resources document engineering progress; they do not imply connected generative-AI providers or a production launch.

## Demo and engineering evidence

The [demo walkthrough](docs/DEMO.md) shows how to prepare and demonstrate the existing Game Studio blueprint workflow, including the **Legends of Zamara** example, validation preview, saved revisions and a separately prepared browser scene prototype.

It does **not** claim that the blueprint creates characters, animations, quests or a complete world automatically.

- [Game blueprint example](examples/game-blueprints/zamara-demo.json)
- [API regression tests](apps/api/tests)
- [Frontend application](apps/web)
- [Backend service](apps/api)
- [Demo walkthrough and limits](docs/DEMO.md)

## Run locally on Windows

**Prerequisites:** Python 3.13, compatible Node.js and Docker Desktop with Linux containers enabled.

From the repository root in PowerShell:

```powershell
python -m venv apps/api/.venv
& "apps/api/.venv/Scripts/python.exe" -m pip install -r apps/api/requirements.txt
npm.cmd --prefix apps/web ci
```

For a first installation, copy `.env.example` to `.env` and `apps/web/.env.local.example` to `apps/web/.env.local`. Set matching strong database passwords and a separate random secret. Keep real credentials out of Git. An existing PostgreSQL volume retains its previously configured password.

Start the local services:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-IndaVerse.ps1
```

| Local service | URL |
| --- | --- |
| Creator dashboard | http://localhost:3000/dashboard |
| API documentation | http://localhost:8002/docs |
| API health | http://localhost:8002/api/v1/health |

Use `localhost` consistently and ensure the local ports are not already occupied by another app.

### Check your installation

```powershell
npm.cmd --prefix apps/web run build
```

API tests use isolated test database settings. Configure a **test-only** `DATABASE_URL`, `REDIS_URL` and `SECRET_KEY` before running pytest from `apps/api`. Do not run tests against a production or valuable development database.

The existence of tests does not, by itself, mean they passed on your machine. SQLite fixture tests do not establish PostgreSQL concurrency guarantees; manual browser playtesting is still required.

## Roadmap

**Near term:** Improve studio usability, strengthen tests, add export and backup coverage, refine 3D scene editing, and document repeatable local demos.

**Medium term:** Integrate generation providers behind clear contracts, connect asset outputs to projects, and add monitoring, security and controlled user pilots.

**Long term:** Explore richer multimodal creative assistance, more complete game systems, portable project packages and production deployment after appropriate validation.

These are **planned milestones**, not completed capabilities or delivery promises.

## Important limitations

- AI music and image-generation providers are **not connected** in the current local codebase.
- A generation request may be recorded without a generated asset.
- Imported game blueprints do not automatically produce 3D models, animations, complete levels or quests.
- The browser player is an interactive **prototype**, not a finished game engine.
- Blueprint exports omit important material such as image files, playable layouts and revision history; they are not backups.
- Production deployment, media authorization, security review and end-user validation remain outstanding.

## About the team

**IndaVerse** is developed under **Yaqini & Duniya Technology (YD Tech)**, an emerging Nigerian technology venture working on practical AI, interactive software and digital products.

**Project lead:** [Inda Obanyi](https://github.com/Inda-Obanyi) — Founder, Software Developer & AI/ML Engineer.

[Founder portfolio](https://indaobanyi.vercel.app) · [LinkedIn](https://www.linkedin.com/in/inda-obanyi-8886553a6/) · [YD Technology GitHub](https://github.com/Yaqini-Duniya-Technology)

---

<div align="center">

**IndaVerse — Create with structure. Build with imagination.**

*Built in Africa. Designed for creative possibility. Developed responsibly, one milestone at a time.*

</div>


## Reliable demo milestone — 1 November 2026

The latest milestone adds a categorized Help Centre, illustrated studio cards, production planning tools, validated draft transfer, opt-in browser recovery, isolated build outputs and a private Zamara demonstration project.

**Workspace validation:** 248 API tests, 23 web unit tests, 7 real-browser workflows and the production TypeScript build passed. These results were obtained locally in the build workspace; GitHub Actions and Windows must report their own results. Browser coverage includes collecting three gems and reaching the demo exit with software WebGL. This is prototype evidence, not a complete game-engine claim.

- [Milestone details and verification limits](docs/RELIABLE-DEMO-MILESTONE.md)
- [Demonstration walkthrough and screenshot](docs/DEMO.md)
- [Local operational setup and backup guidance](docs/OPERATIONS.md)

Run `scripts/Setup-Local.ps1` for first-time Windows setup. Keep `.env`, uploaded media and database backups outside Git. Development uses `.next-dev`; release builds use `.next`; isolated browser checks use `.next-e2e`.

```powershell
npm.cmd --prefix apps/web ci
Push-Location apps/web
try { npx.cmd playwright install chromium } finally { Pop-Location }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Verify-Release.ps1 -Browser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File Start-IndaVerse.ps1 -WebMode production
```

Create a demo from the signed-in dashboard using **Create private Zamara demo**. It creates a new private copy and never overwrites an existing project. No AI provider is connected.
