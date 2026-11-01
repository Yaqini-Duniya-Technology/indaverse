# Creative options batch verification

Prepared 1 November 2026 on the Guided Recovery checkpoint.

- Web unit tests: 23 passed, including 8 new production-tool cases.
- Next.js production build and TypeScript: passed, including /help.
- ESLint: passed for the new production tools, artwork, Help Centre and production library; also passed for the changed workbench, page-help, guide library, homepage and dashboard.
- Git patch whitespace and clean-baseline applicability: checked during packaging.

The existing game editor has a pre-existing react-hooks/set-state-in-effect lint error in its autosave effect. This batch does not claim repository-wide lint is clean. Backend code and database schema are unchanged; the last backend regression run for the preceding batch passed 246 tests.

Browser rendering, screen-reader behavior, downloads and Windows installer execution remain local acceptance checks. Automated Chromium setup was unavailable in this workspace. Do not treat build success as browser test evidence.

## Acceptance on Windows

1. Stop web and API processes. Install after Guided Recovery 50.
2. Run scripts/Verify-Release.ps1 and restart with Start-IndaVerse.ps1.
3. Open /help. Select each studio, search for a field, open its explanation and example, and test the no-results state.
4. Check illustrated cards and readable text on homepage/dashboard at phone and desktop widths.
5. In Game Studio select 2D then 3D. Check explanatory text, suggested and custom genres. Save before opening the matching layout; previous content should remain.
6. In Music, test 120 BPM, 8 bars, 4 beats: 16 seconds. Use draft BPM and filter lyric cues.
7. In Story, test chapter pacing and unwritten-chapter filtering.
8. In Video, compare target runtime with total shots; ensure a filtered later shot keeps its original start time.
9. In Web & App, inspect routes, section inventory, priority filters and temporary acceptance checks.
10. In Game, filter all asset kinds, search a level objective and inspect role/asset counts.
11. Download a production CSV from each studio. Confirm studio content and saved versions have not changed from tool use.

No new provider connection, publishing pipeline, AI media generation or complete game engine is added. Reports describe the draft and are not proof that an app or game is implemented.
