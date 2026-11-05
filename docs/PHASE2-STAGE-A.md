# Phase 2 — Stage A release readiness

Implementation batch based on merged MVP main fd6ef14, 5 November 2026. See PHASE2-AUDIT.md and the fifty-item tracker. No database migration or paid service is introduced.

## New behavior

- Startup preflight reports missing/configuration categories without printing credentials. It checks the documented local HTTP environment; it is not a production deployment validator.
- API/web services start as detached processes with logs in ignored `.local-run`. They no longer require an extra terminal to stay open. Existing listeners must identify as IndaVerse; unrelated processes are not stopped.
- `Stop-IndaVerse.ps1` stops only recorded processes after checking command line and creation time. Reused unmanaged servers require stopping their original terminal manually. Database containers remain running.
- `/status` checks web/API identity and database/Redis readiness with bounded browser waiting. It never retries a save or reads user project data.
- Game history can compare a selected revision to the working draft. Comparison is read-only and bounded to 100 fields; numbered list positions can produce several differences after a reorder. Other studios do not gain history comparison in this batch.
- Backup creation requires writers to be stopped and writes a portable checksum manifest. The restore drill only accepts a backup directory and restores into a new disposable PostgreSQL container with no network, published ports or host volume mounts. It never accepts a live target database.
- Dedicated PostgreSQL CI creates a randomly named test database and exercises concurrent version-checked writes. The normal SQLite suite is unchanged.

## Windows acceptance: run in this order

First stop older API/web terminals manually. They predate the new managed process records. Do not stop other projects or Docker.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-Release.ps1 -Browser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-IndaVerse.ps1 -WebMode production
```

Open http://localhost:3000/status. Confirm the API, database and Redis respond, then sign in and test save/reload. Closing the launcher terminal should not stop managed services. The status page describes each failure and a retry check; changing the web API URL requires rebuilding.

If startup fails, inspect `.local-run/api.log` or `.local-run/web.log` locally. Check for private values before sharing logs. A known local example is API on port 8002 and browser on localhost:3000; it does not make localhost available to remote reviewers.

To create and verify a backup:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Stop-IndaVerse.ps1 -Service api
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Backup-Local.ps1
# Use the exact newly printed folder; do not paste a placeholder path.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-Backup.ps1 -BackupPath "YOUR_NEW_BACKUP_FOLDER"
```

Stop all other application writers during backup. Do not run upgrades or edit upload files during the snapshot. The drill checks file hashes and successful relational restore, not playback of every media file or byte equality with a live database. Checksums detect changes, not a maliciously replaced manifest. Keep backups private; no encryption service is added.

Older backups with only checksums.csv do not have the new portable manifest. Preserve them and create a new backup rather than editing their integrity records.

## Automated checks and limits

Operational unit tests cover early child exit, occupied-port refusal, valid/invalid preflight, changed media, unsafe manifest paths, restore failure cleanup and tracker completeness. Web tests cover bounded read-only snapshot differences. Browser tests extend the real fixture workflows with service status and autosave/network-failure preservation.

Local Docker is unavailable in the build workspace. PostgreSQL locking and a synthetic Docker restore drill run in separate CI workflows; their results must be reported independently. A passing synthetic drill does not restore-test the user's own backup.

Windows detached startup/stop and a real local backup remain acceptance items for the user machine. IND-001/003/005/009/010 are not marked complete in full. No whole Stage A completion or production readiness is claimed until those conditions pass. Full-repository lint debt remains outside this batch; new files receive scoped lint checks.

## Continue after Stage A

Stage B will retain the courtyard fixture while adding explicit multi-scene/rule architecture and a supported independent game export. Existing three written levels do not constitute three playable scenes. Music, Story, Video, Web and Image production follow the dependency order in PHASE2-TRACKER.json; paid AI providers and production hosting remain outside this batch.


## Batch evidence

Workspace results: 248 API tests passed; 7 operational tests passed; 25 web unit tests passed; 9 real-browser tests passed (including the new status/autosave failure cases); production build and scoped lint passed. A live Linux check started API and production web as detached children, verified both remained ready after launcher commands exited, then removed only its own fixture processes. This is not a Windows PowerShell execution result.

Docker-dependent results are recorded after CI runs, separately from the above workspace results. No user backup has been supplied or restored.
