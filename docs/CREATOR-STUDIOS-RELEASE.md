# Creator Studios release candidate

This candidate brings the Phase 2 reliability work and Creator Studios
upgrades into one review against `main`. It includes PR #2 and the work in
PRs #4–17. PR #3 was already merged into the Phase 2 branch. The individual
pull requests record how each feature was built and tested.

| Area | What creators can try |
| --- | --- |
| Workspace | Archive and reopen projects, duplicate saved drafts, and reuse private assets across owned projects. |
| Video | Edit ordered clips, add captions and soundtracks, then export an MP4 or a publishing ZIP. |
| Music | Arrange source audio on a timeline, save a mix, export WAV or MP3, or send a selected range to Video Studio. |
| Story and Game | Export a text manuscript as HTML or EPUB. Create a private Zamara demo, record a playtest, and export a small standalone browser game. |
| Web and Image | Check internal links and download a static website ZIP. Crop, rotate and resize images while retaining the original. |
| Campaigns | Draft posts, link private assets, and export a manual handoff. The assistant uses a local test adapter. |

## Evidence before promotion

The integrated source at `61d2064` passed its
[Chromium workflows](https://github.com/Yaqini-Duniya-Technology/indaverse/actions/runs/42515373747),
[PostgreSQL migration and concurrency rehearsal](https://github.com/Yaqini-Duniya-Technology/indaverse/actions/runs/42515373803),
[backup restore drill](https://github.com/Yaqini-Duniya-Technology/indaverse/actions/runs/42515373815)
and [Windows launcher and media smoke tests](https://github.com/Yaqini-Duniya-Technology/indaverse/actions/runs/42515373854).
The PostgreSQL rehearsal restored a synthetic release backup, upgraded to the new
head and rolled back in disposable databases. Check the release pull request's
own results before merging.

## First verification on a Windows checkout

1. Follow [Operations](OPERATIONS.md) to make and verify a private backup of
   the database and uploaded media. Keep the existing service available
   until you have tested the candidate with a disposable restored copy.
2. Install the candidate dependencies and run `scripts/Verify-Release.ps1 -Browser`.
   Run the migration and launch against the intended test database. The latest
   Alembic revision is `3bd80a2749c1`. The local launcher applies migrations
   before it starts the app.
3. Sign in, open an existing project and load its media. Create a private
   Zamara demo, save a playtest, and open the exported HTML offline. In Video
   Studio, make one publishing ZIP and verify the MP4, poster and captions.
4. Confirm sign-out and a second account cannot fetch private assets. Compare
   the test copy's project counts and media integrity with the backup.

## Limits and recovery

Local media rendering requires FFmpeg and FFprobe. Static website export does
not execute forms or mobile app features. Campaign dates are planning notes;
the candidate does not publish automatically or connect to a live AI provider.

Keep the prior application revision and verified backup. If a rollout fails,
stop writes before deciding how to recover. The new tables may contain reports,
campaigns, and arrangement data; downgrading migrations can discard those
records. Rehearse recovery against a disposable copy and reconcile any writes
made since the backup before restoring a live environment.
