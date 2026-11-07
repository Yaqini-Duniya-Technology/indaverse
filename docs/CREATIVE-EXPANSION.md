# IndaVerse creative expansion — Phase A, first batch

Developed by Yaqini & Duniya Technology. This 60-item roadmap is separate from the earlier 50-item Phase 2 tracker; matching numbers do not refer to the same feature. See [the expansion tracker](CREATIVE-EXPANSION-TRACKER.json).

The development branch starts from release PR #2 at `bab12b7`, including the Windows fixes merged in PR #3. The release branch and main are separate from this work. No deployment or live database migration was performed.

## Baseline audit

| Capability | Classification | Evidence and boundaries |
|---|---|---|
| Accounts and private projects | Tested | Registration/sign-in and cookie-based ownership checks; project create/edit/reopen and version-conflict tests. No expanded account recovery or sharing. |
| Startup, database and storage | Tested locally on release baseline | User confirmed Windows sign-in after the launcher fix, and a separate container restored their backup with media checksum validation. Baseline GitHub workflows also passed. PostgreSQL and Redis are local Compose services; media lives under API uploads and is read through protected routes. The development workspace uses a disposable SQLite fixture and does not access that database or media. |
| Dashboard and Help Centre | Working | Five project editors plus image management and contextual help. Image management is not a standalone canvas studio. |
| Image reference workflow | Tested | Validated images, project covers, filtered metadata and protected downloads. No canvas, layers or manipulation. |
| Music | Partially Working | Saved lyrics, uploaded audio, song history and request history. No waveform timeline, mixdown or mastering. |
| Video | Prototype | Saved storyboard, shot timing and preview. No media timeline or playable rendered output. |
| Story | Working for drafting | Saved chapters, characters, scenes and a reading preview. No verified PDF, DOCX or EPUB book export. |
| Game | Prototype | Saved blueprint, 2D layout, 3D scene and browser prototype. The playable Zamara courtyard is not a standalone downloadable game. |
| Web & App | Prototype | Saved site/app blueprint and preview. No isolated code execution, working exported app or backend. |
| AI generation | Blocked | No active provider. The legacy image/music routes record unavailable requests; they do not return generated media. |
| Existing exports | Partially Working | JSON design and recovery files, planning reports and source image/audio downloads. These are not finished video, audio mixdown, manuscript, game or website production exports. |

## What this batch delivers

- **IND-001:** Open a project to archive or unarchive it. On Dashboard, switch **Project status** to **Archived** to reopen it. Archiving is a visibility filter for your own workspace, not a permission change or deletion. **Duplicate saved content** creates a private project with a new ID and saved editor data, including supported game layouts. It starts a fresh version lineage and excludes files, image references, cover, plan, earlier revisions and browser-only drafts.
- **IND-002:** In **My asset library**, choose **Images** or **Audio**. Browse across projects you own. Use **Copy image** to create an independent copy of a supported stored WebP in another project you own. Confirm you have reuse rights. The destination uses the existing project image editor. Audio is listed and opens its source project; direct audio copying and durable rights metadata are pending.
- **IND-003:** The project workspace explains what Manual, AI and Hybrid mean today. Manual tools remain available; external files can be imported where already supported. There is no AI or integrated hybrid execution.
- **IND-004:** A server-side adapter contract and per-capability registry provide capability discovery for seven kinds of generation. No provider is registered or called. Provider selection via configuration, safe dispatch, timeouts and integration tests remain future work.
- **IND-005:** **Load generation history** reads existing image and music records across a single paginated view for the selected project. It does not expose prompts or submit/retry requests. Unified scheduling, progress, output management, cancellation, usage and retry are pending.

The only schema change adds a nullable archive timestamp to the projects table; existing projects stay active. Before trying this branch with a real local workspace, keep your verified backup and run the normal local migration flow. The API code expects the new column.

## Manual acceptance

1. In a backed-up local environment, start this branch using the normal startup procedure, sign in and open a saved project.
2. Archive it, refresh, and find it via **Dashboard → Project status → Archived**. Reopen and unarchive it.
3. Duplicate it, reopen the private copy, and compare the saved editor data. The source should remain unchanged. Use a separate demo project for destructive experiments.
4. Copy a reference image to a different owned project, open the destination and preview the copy. Confirm the original is still visible.
5. Open **Load generation history**. Confirm unavailable requests are labeled correctly and the page does not claim to generate media.

## Test matrix and next slice

| Area | Evidence / required acceptance |
|---|---|
| Project persistence, archive, duplication, permissions, invalid input | API fixture and Chromium workflow. Add concurrent lifecycle testing on PostgreSQL when extending archive rules. |
| Uploads, cross-studio reuse, artifact integrity | API creates two owners, performs real image uploads, rejects foreign access, and compares copied bytes and decoded WebP dimensions. |
| AI failures, quotas and interrupted work | Availability and ownership tested here. Real provider failure, quota enforcement and interrupted-job recovery are pending execution infrastructure. |
| Version history, mobile and Help Centre | Existing save/recovery and mobile Help tests; full shared undo/redo is pending. |
| Render, mixdown, image, manuscript and site output | Require each phase to generate a real artifact and open/decode it in an independent reader. |
| Game execution and exports | Existing prototype browser test plus a browser download parsed as versioned blueprint JSON. Standalone runtime export remains pending. |

Next: define shared export contracts, then deliver a narrow Video Studio workflow with actual clip edits and a verified playable MP4. Consider timeline/preview/render separation and keep the manual pipeline independent of AI provider access.

## Verification for this batch

- Release baseline before changes: 248 API tests and 25 web logic tests passed locally; [release baseline browser CI](https://github.com/Yaqini-Duniya-Technology/indaverse/actions/runs/42166972057), PostgreSQL concurrency and synthetic restore workflows passed on GitHub.
- This branch: 252 API tests, 7 operational tests, 25 web logic tests, and 10 Chromium browser workflows passed. Chromium ran against a disposable API database and separate production-mode web server. The new browser workflow reads the actual downloaded JSON file.
- The archive migration was applied and reversed against an existing-row SQLite fixture, and its PostgreSQL upgrade SQL was generated offline. It was not applied to the live PostgreSQL database.
- The Next.js production build and scoped lint passed. Windows startup and the backup restore reported earlier apply to the release baseline, not a live installation of this expansion.

## Design reference for the next phase

[CapCut's editing workflow](https://www.capcut.com/resource/ai-video-editor-guide) separates clip import, manual timeline edits, optional assists and export. [Its range export guide](https://www.capcut.com/help/export-clip-of-video) gives a concrete acceptance idea: a selected range must change the bytes and duration of the exported video. For IndaVerse, the first video milestone should prove a manual cut can be rendered and replayed before adding generation.
