# IndaVerse | System architecture

> **Stage:** local development MVP. This describes the repository's implemented components and interfaces, not a production deployment.

```mermaid
flowchart TB
    Creator["Creator / browser"]
    Web["Next.js 16 + React 19 + TypeScript"]
    Studios["Music • Story • Video • Web & App • Game"]
    Three["Three.js scene preview / browser play prototype"]
    API["FastAPI REST API + Pydantic validation"]
    Auth["Accounts, access checks and private projects"]
    Work["Creative briefs • project plans • revisions"]
    Blueprints["Game blueprints, imports and scene records"]
    Provider["Generation provider interface"]
    Unavailable["Unavailable provider fallback — no generated media"]
    ORM["SQLAlchemy models + Alembic migrations"]
    DB[("PostgreSQL")]
    Redis[("Redis — development configuration")]
    Uploads["Local uploaded assets / media paths"]

    Creator --> Web
    Web --> Studios
    Studios --> Three
    Studios --> API
    API --> Auth
    API --> Work
    API --> Blueprints
    API --> Provider --> Unavailable
    Auth --> ORM
    Work --> ORM
    Blueprints --> ORM
    ORM --> DB
    API --> Uploads
    API -. "configured infrastructure" .-> Redis

    classDef ui fill:#D9F3FF,stroke:#17639A,color:#102E49
    classDef api fill:#E5E1FF,stroke:#6046A4,color:#24164F
    classDef data fill:#DCF8E9,stroke:#267B50,color:#173A2A
    classDef unavailable fill:#FFF1D6,stroke:#A86616,color:#663B08
    class Web,Studios,Three ui
    class API,Auth,Work,Blueprints,Provider api
    class ORM,DB,Redis,Uploads data
    class Unavailable unavailable
```

## Boundaries that matter

| Boundary | Current implementation | Not yet demonstrated |
| --- | --- | --- |
| Web → API | Next.js studio UI, FastAPI routes and request validation | Production availability, mature observability |
| API → data | SQLAlchemy database models, Alembic migrations, isolated SQLite test fixtures | Production PostgreSQL concurrency guarantees from these tests |
| Game tools | Blueprint import validation, revisions, saved scenes and browser preview | Fully generated games, production-level physics and gameplay |
| AI providers | Provider abstraction and explicit unavailable fallback | Connected, evaluated generation of audio/images |
| Local media | API-managed upload paths and asset records | Production-grade storage and access policies |
| User identity | Auth/account modules and private project workflows | Independently audited production security |

## Repository layout

- [`apps/web`](../apps/web) — creator-facing Next.js interface, Three.js scene tools
- [`apps/api`](../apps/api) — FastAPI, domain models, services, migrations and regression tests
- [`compose.yaml`](../compose.yaml) — local PostgreSQL and Redis
- [`examples/game-blueprints/zamara-demo.json`](../examples/game-blueprints/zamara-demo.json) — portable prototype blueprint
- [Demo walkthrough](DEMO.md) — reproducible manual demonstration guide
- [Milestone tracker](MILESTONES.md) — current and future work

**Validation note:** an architecture diagram describes a design and code layout; it does not prove real-world performance or deployed availability.
