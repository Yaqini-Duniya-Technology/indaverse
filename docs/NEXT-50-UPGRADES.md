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

Items without a completion label are planned.

11. **Checked:** Review the stacked PRs against the release branch. PR #2 targets main, PR #3 is in the release branch, and PRs #4–11 each target their immediate predecessor. A local merge simulation against both fetched release and main had no conflicts. The expansion commits are absent from those targets, so merging later drafts into their immediate bases does not by itself release the stack.
12. Run the expansion migration chain on a disposable PostgreSQL backup and exercise rollback where supported.
13. Add Windows CI for launcher, FFmpeg detection, and a real rendering smoke test.
14. Add concurrent sequence edit and render snapshot coverage on PostgreSQL.
15. **Implemented:** Chromium workflow checks that a signed-out browser cannot fetch a source, and that a different signed-in account cannot fetch that source or export its publishing kit.
16. Persist sequence editor drafts locally with version-aware recovery.
17. Add undo and redo for in-session cut, caption and soundtrack changes.
18. Add a sequence revision list with preview and explicit restore.
19. Import whole-sequence subtitles with a preview of how cues map to cuts.
20. Offer a preview to review output framing, audio and caption choices before preparing the final ZIP.

## 21–30: Music Studio — planned

21. Import private audio into a saved track list.
22. Generate a bounded waveform preview for an imported track.
23. Mark audio regions with exact start and end times.
24. Place trimmed regions on a session timeline.
25. Add per-track volume, mute and solo.
26. Add per-region fades with preview.
27. Edit lyric sections and associate them with audio ranges.
28. Export a playable WAV mixdown.
29. Export a compressed MP3 listening copy.
30. Reuse a saved mixdown as a Video Studio soundtrack without a manual re-upload.

## 31–40: Story and Game Studio — planned

31. Reorder manuscript chapters and save the new order.
32. Add chapter status and writing targets.
33. Create a character and setting reference board linked to scenes.
34. Add a rule-based manuscript continuity review that points to relevant chapters.
35. Export a clean, accessible HTML manuscript.
36. Export EPUB with a navigable table of contents.
37. Add Game Studio scene templates for 2D and 3D prototypes.
38. Add trigger and objective editing with validation.
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
