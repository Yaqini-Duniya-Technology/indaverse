# IndaVerse | Development milestone tracker

**As of 31 October 2026.** Status is based on repository files and documentation, not an independently verified production deployment.

| Milestone | Stage | Evidence / acceptance boundary |
| --- | --- | --- |
| M1. Monorepo and local service setup | Implemented in source | Next.js frontend, FastAPI backend, Docker Compose, env templates |
| M2. Accounts and project workspaces | Development MVP | Auth routes, project models, dashboard and studio pages |
| M3. Creative drafting studios | Development MVP | Music/song revisions, story characters/scenes, video scripts, software blueprints |
| M4. Game blueprint import and history | Prototype implemented | Validation endpoints, import demo, revisions and test modules |
| M5. Visual scene editing and playtesting | Prototype implemented | Three.js scene and browser play pages; not a finished game engine |
| M6. Reproducible automated checks | CI configured; execution to verify | GitHub Actions web build and isolated API regression suite |
| M7. Real generative-media providers | Not integrated | A provider must generate and save actual assets before marking complete |
| M8. Complete playable project exports | Planned | Exported build with assets and gameplay; blueprint export alone insufficient |
| M9. Real-user pilots and usability evidence | Planned | Documented consented creator sessions, defects and improvements |
| M10. Production security and deployment | Planned | Secure media access, secrets, storage, DB backups, monitoring and release verification |

## Current release gate

**Public claim supported:** “Local development MVP with five studio workflows and experimental 3D/game tooling.”

**Public claims not supported yet:** fully working AI music or image generation, automatic 2D/3D game production, full application generation, independently verified production SaaS, field-tested scalability.

## Next priorities

1. Verify CI results on `main`; repair environment and failing tests if necessary.
2. Run the [demo walkthrough](DEMO.md) on a clean local installation and capture genuine screenshots.
3. Validate provider interfaces using a clearly labeled sandbox before connecting any paid generation service.
4. Improve asset packaging, export integrity, access control and backup/restore procedures.
5. Conduct documented usability testing before opening public production registration.

Tracking rule: advance milestones only after reproducible evidence exists; a file, route or screenshot does not on its own prove production readiness.
