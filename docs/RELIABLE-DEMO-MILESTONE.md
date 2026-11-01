# Reliable demo milestone — 1 November 2026

## Changes

Development uses `.next-dev`, release builds use `.next`, and browser checks use `.next-e2e`. TypeScript excludes development/test generated output from release checks. This addresses the concurrent-cache corruption seen during Windows builds. Existing locked `.next` files may still require stopping the old development server once.

Startup reports web readiness attempts, checks the X-IndaVerse-Web response marker before reusing port 3000, supports `-WebMode production`, and fails visibly if startup cannot be verified. It does not terminate other applications. Release verification shows stages and detects this project's running production process before rebuilding it.

The game autosave pending/waiting text is now derived during rendering; its effect schedules saves without synchronous state changes. Its debounce and version checks remain unchanged.

A confirmed dashboard action creates a new private Legends of Zamara project with a brief, validated design, initial revision and saved 3D courtyard. Each creation is a separate copy; it never replaces existing data. The scene uses placeholder geometry and three collectibles. No generation provider or external paid call is involved.

## Automated browser checks

Playwright starts the real API against a temporary SQLite file and builds/serves a separate test web application. It refuses to reuse occupied fixture ports 8012 and 3012. API secrets and accounts are disposable; the normal app database is never used. No Docker service is needed for this fixture.

Seven browser workflows cover:

- Public Help categories, examples, search and mobile overflow.
- Real login, private demo creation, save/reload and stale-write rejection.
- Story browser recovery, JSON validation/apply and manual save.
- Video JSON validation/apply and save.
- Web & App JSON validation/apply and save.
- Music title save/reload.
- Real WebGL Start/Pause/Resume, three-gem collection, exit completion and Restart.

Browser tests are regression examples, not exhaustive coverage of every form, touch device, upload, concurrency edge case or rendering environment.

## Results in this workspace

- 248 isolated API tests passed; 3,541 deprecation warnings remain.
- 23 web unit tests passed.
- Production build including TypeScript passed.
- 7 browser workflows passed in 25.5 seconds.
- Targeted ESLint passed for the new demo component, browser config/tests/runner and changed game editor.

Linux Python 3.12 and Node 24 were used. The standard Chromium CDN download failed here, so browser tests ran against an explicit Chromium 153 executable from the @sparticuz/chromium npm distribution, with software WebGL. CI and Windows normally install Playwright's pinned Chromium through its installer. Those environments need their own run; the local result is not a claim that remote CI or Windows startup scripts passed.

## Run on Windows

```powershell
npm.cmd --prefix apps/web ci
Push-Location apps/web
try { npx.cmd playwright install chromium } finally { Pop-Location }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Verify-Release.ps1 -Browser
```

Keep ports 3012/8012 free. Stop the production web server before rebuilding it. Development can coexist because its output is separate. Run `Start-IndaVerse.ps1` afterward, or use `-WebMode production` after a successful build. The production mode avoids development compilation pauses during a presentation.

The Playwright report is under `apps/web/playwright-report`; failure traces can contain synthetic test form inputs. Reports and temporary outputs are ignored by Git. Keep operational database/media backups separately.
