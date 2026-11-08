# Operating this development MVP

## Install and verify on Windows

Run from the repository root:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Setup-Local.ps1
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Verify-Release.ps1

Setup preserves existing .env files. The test runner replaces connection
settings only in its own process; it does not migrate or modify the application DB.
Development and production use separate generated folders. Stop an existing production server before rebuilding it. See PHASE2-STAGE-A.md for managed startup/stop and restore drills.

## Health

GET /api/v1/health is liveness only. GET /api/v1/ready returns 200 when both
PostgreSQL and Redis respond, otherwise 503. Readiness does not migrate the
database or certify its schema revision. Check alembic current separately.

## Browser smoke checks before publishing

- Sign in, create a project and verify it persists after refresh.
- Edit a brief, save and check stale-version rejection in a second tab.
- Import a game blueprint, save and reopen it.
- Test 2D and 3D playback and scene editing on a WebGL-capable browser.
- Upload audio, play it, seek within it, then sign out and confirm its URL denies access.
- Sign in as another account and confirm it cannot play that audio.
- Confirm direct /uploads URLs no longer serve private files.
- Confirm uploaded images still load using the protected image route.
- Test offline/retry handling without automatically replaying writes.

## Configuration for a future deployment

Set APP_ENV=production, COOKIE_SECURE=true and a separate random SECRET_KEY
of at least 32 characters. Set API_URL and APP_URL to HTTPS URLs.
CORS_ORIGINS is a JSON array of exact browser origins without trailing slashes.
ALLOWED_HOSTS is a JSON array of API hostnames without ports or wildcards.

Cookies use SameSite=Lax. Deploy browser and API on the same site (for example,
app.example.com and api.example.com), or provide a same-origin proxy. Arbitrary
cross-site hosting requires a separately designed cookie/CSRF configuration.
The Origin check is defense in depth and allows non-browser clients without
Origin; it is not a replacement for authentication or a complete CSRF-token system.

No rate limiter, distributed abuse prevention, email verification delivery,
production asset storage or provider integration is added in this batch.
Audio MIME labels are not a full content-security scan. Review these before
opening unrestricted public registration/uploads.

## Local backups

Stop API writes before backing up so media and database copies agree. Keep
Docker's database container running. Then:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Backup-Local.ps1

The default backups directory is ignored by Git. It contains private user data.
Copy it to a separate trusted disk. It does not contain your configuration secrets;
preserve those separately in a password manager or encrypted backup.

Archive inspection and checksums do not prove restorability. Test restoration
into a NEW disposable PostgreSQL database with pg_restore, never the live database.
For example, create indaverse_restore_check, copy database.dump into the container,
then run pg_restore --exit-on-error --no-owner -U indaverse -d indaverse_restore_check
against that archive. Copy the media into a separate test storage directory.
Check table counts and sign-in/project/media behavior with a separate API instance.
Document the result before describing a backup as restore-tested. Do not point
the production API at the disposable database.

## Repository checks

    python scripts/check_repository.py

This checks tracked filenames, not source contents. Use GitHub secret scanning
and review source for credentials before publishing. Do not force-push over a
remote branch if your local history has diverged.
