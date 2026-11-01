# Studio experience batch: 50 scoped improvements

This is the second batch, applied after release-hardening batch 1. Existing
save endpoints, optimistic version checks, blueprints and game players remain
in place. Nothing here connects an AI generation provider.

## Homepage (1–6)

1. A public landing page replaces the root sign-in redirect.
2. Five studio capability cards explain the available workflows.
3. A brief-to-draft-to-review process introduces new users to the product.
4. Expandable FAQs explain generation, export and backup limitations.
5. Responsive navigation includes a keyboard skip link and sign-in/account actions.
6. Developer attribution links to the Yaqini & Duniya Technology GitHub organisation.

## Dashboard (7–12)

7. Projects can be sorted by recent updates, creation date or name.
8. A clear-filters action resets search, type and ordering together.
9. A live count explains how many projects match the current filters.
10. A refresh action reloads project records.
11. Project cards show saved update dates using semantic time elements.
12. Damaged dashboard arrows and brand separators are replaced.

## Shared studio desk (13–20)

13. Each studio links back to dashboard, project and project image resources.
14. Working-copy status distinguishes saved versions from unsaved editor data.
15. Expandable advisory checks explain incomplete draft content without blocking saves.
16. Working-copy search finds chapters, lyric sections, shots, pages or level/character notes.
17. Markdown working notes can be downloaded without saving the draft.
18. CSV planning exports escape quoted content and neutralise spreadsheet formula prefixes.
19. Copy-to-clipboard includes success and fallback messages.
20. Application error and not-found pages provide recovery navigation without exposing raw errors.

## Music (21–25)

21. Current lyrics have a live whitespace-delimited word count.
22. A six-section coverage count shows written and empty lyric sections.
23. Tempo review flags values outside 1–300 BPM.
24. A lyric-section CSV includes section names, word counts and content.
25. An advisory chorus check identifies a missing chorus while allowing intentional arrangements.

## Games (26–30)

26. A player-role design check highlights zero or multiple player characters.
27. Level checks identify missing objectives.
28. Asset requirements can be exported as a typed planning manifest CSV.
29. Dimension, character, level and asset counts summarise the current blueprint.
30. Missing controls are highlighted as a design concern.

## Web and app blueprints (31–35)

31. A home-route check identifies blueprints without /.
32. Duplicate paths are called out in the advisory review.
33. Must-have feature counts help assess blueprint scope.
34. Section totals expose the size of the planned page/screen structure.
35. A feature backlog CSV preserves priority and description.

## Video (36–40)

36. Planned runtime is calculated from valid positive shot durations.
37. A cumulative shot-schedule CSV includes start/end times, camera and descriptions.
38. Missing camera directions appear in draft review.
39. Invalid durations are flagged without producing negative timeline positions.
40. Script word counts complement the shot schedule; they do not predict rendered runtime.

## Story (41–45)

41. Manuscript word count aggregates chapter content.
42. Reading duration is explicitly estimated at 200 whitespace-delimited words/minute.
43. Markdown working notes include synopsis, genre and chapter manuscript text.
44. A chapter outline CSV lists chapter names and word counts.
45. Empty titles and chapter bodies appear in advisory review.

## Images (46–50)

46. Server-side literal label search spans the project's entire image library.
47. Category filters are applied before pagination and retain ownership checks.
48. Newest, oldest and label ordering have stable ID tie breakers.
49. A local selected-file preview shows filename/size before upload and revokes object URLs.
50. Image downloads use the protected content endpoint and report session/download failures.

## Boundaries

Notes/CSV files contain the current working copy, possibly unsaved. They are
not blueprint import files or complete project backups. Media files, separate
playable scenes, characters stored by Story Characters Editor, and revision
history are not included unless explicitly described by an export.

Reading/word counts are whitespace-based and are not language-specific text
segmentation. Video timelines represent the planned shot durations only.
Game checks do not verify collision geometry, playability, assets or AI.
No executable website builds, generated video, generated music or complete
game exports are introduced. Saved preview tools continue to read saved data.
