# IndaVerse: next 50 upgrades

This run starts from the Video Studio caption milestone (PR #11). The numbers below identify this run only. Studio features depend on the earlier draft PRs in the expansion stack; a draft PR is not a production release.

## 1–10: Video delivery — implemented in the delivery branch

| # | Upgrade | Acceptance |
|---|---|---|
| 1 | Private publishing ZIP | Open a downloaded kit and play its MP4. |
| 2 | JPEG poster | Open a poster extracted from the final render. |
| 3 | Poster time selection | Pick a later shot; reject a time beyond the saved cut. |
| 4 | Optional subtitle sidecars | Choose SRT, WebVTT, both, or neither. |
| 5 | Timestamped plain-text transcript | Compare transcript timestamps with the same rendered sequence. |
| 6 | Edit timing CSV | Verify both source ranges and final timeline ranges. |
| 7 | Versioned delivery manifest | Identify the saved sequence version, format and intended duration. |
| 8 | File integrity checksums | Verify the SHA-256 digest of each payload in the ZIP. |
| 9 | Publishing checklist | Open a short checklist for captions, framing, sound and permissions. |
| 10 | Export readiness feedback | See package contents, and catch unsaved edits or invalid poster times before rendering. |

## 11–20: Release readiness and resilient editing

Items without a status label are planned. Hosted checks need a passing runner result before release.

11. **Checked:** Review the stacked PRs against the release branch. PR #2 targets main, PR #3 is in the release branch, and PRs #4–11 each target their immediate predecessor. A local merge simulation against both fetched release and main had no conflicts. The expansion commits are absent from those targets, so merging later drafts into their immediate bases does not by itself release the stack.
12. **CI check added:** Back up a seeded release database, restore it to another disposable PostgreSQL database, upgrade through sequences and soundtracks, then rehearse rollback and verify preserved rows.
13. **CI check added:** Start and reap the API through the launcher on a Windows runner, require FFmpeg and FFprobe, then render and decode an MP4 and a publishing kit.
14. **CI check added:** Hold a render after it snapshots a saved version while two PostgreSQL writers contend. Verify one save wins, the other is rejected, and the renderer keeps the original clip and audio snapshot.
15. **Implemented:** Chromium workflow checks that a signed-out browser cannot fetch a source, and that a different signed-in account cannot fetch that source or export its publishing kit.
16. **Implemented:** Keep opt-in browser drafts of clip, caption, and soundtrack edits per account and project. Recover only against a matching server version; stale edits can be downloaded for reference.
17. **Implemented:** Undo and redo up to 50 in-session edits to cuts, captions, and soundtrack settings.
18. **Implemented:** List and review up to 30 saved sequence revisions. Explicitly restore compatible settings to the editor and save as a new version.
19. **Implemented:** Import whole-sequence SRT, preview its clip-relative mapping, and confirm before applying.
20. **Implemented:** Render and review the publishing kit's output settings before preparing the ZIP.

## 21–30: Music Studio

21. **Implemented:** Save a track list made from the project's private Audio Library.
22. **Implemented:** Preview a bounded 128-bin waveform for each supported source.
23. **Implemented:** Trim source regions with exact start and end times.
24. **Implemented:** Position regions on a saved session timeline.
25. **Implemented:** Control track volume, mute and solo during the preview mix.
26. **Implemented:** Set per-region fades and hear them in the browser preview.
27. **Implemented:** Write lyric sections and link them to time ranges that highlight during playback.
28. **Implemented:** Export a playable WAV mixdown.
29. **Implemented:** Export a compressed MP3 listening copy.
30. **Implemented:** Reuse a saved mixdown as a Video Studio soundtrack without a manual re-upload.

## 31–40: Story and Game Studio

31. **Implemented:** Reorder manuscript chapters and save the new order.
32. **Implemented:** Add chapter status and writing targets.
33. **Implemented:** Create a character and setting reference board linked to scenes.
34. **Implemented:** Add a rule-based manuscript continuity review that points to relevant chapters.
35. **Implemented:** Export a clean, accessible HTML manuscript.
36. **Implemented:** Export EPUB with a navigable table of contents.
37. **Implemented:** Add Game Studio scene templates for 2D and 3D prototypes.
38. **Implemented:** Edit a 3D checkpoint trigger and required gem count, with server-side validation and playable respawn behavior.
39. Add a saved playtest report for objectives, resets and completion.
40. Export a self-contained browser build for a supported Zamara scene.

## 41–50: Web, image and promotion — planned

41. Add Web Studio page templates and a shared navigation editor.
42. Add page titles, descriptions, and social preview metadata.
43. Validate internal links before export.
44. Export a usable static site from a supported project blueprint.
45. Crop, rotate and resize private images with an original preserved.
46. Save image derivatives back into the shared asset library.
47. Create a private campaign with draft posts linked to existing video and image assets.
48. Add a campaign calendar with status and local scheduling notes; no automatic posting.
49. Export a campaign handoff with copy, asset references and tracking parameters.
50. Add a bounded, opt-in AI adapter pilot with mocked tests and explicit provider, quota and output review; real execution requires approved credentials and operating limits.

For every stage, test artifacts independently, check account ownership, and record unresolved work before promoting a release.
