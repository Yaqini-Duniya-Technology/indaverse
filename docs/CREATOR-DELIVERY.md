# Creator delivery

Upgrade the database to Alembic head before using this milestone. The
`3bd80a2749c1` revision creates private project records for playtest history,
campaigns and sandbox usage. The normal local startup script applies migrations.

| Where | Workflow |
| --- | --- |
| Game Studio → Play 3D test | After starting a saved scene, save a report with gem progress, checkpoint, falls, manual resets, completion and an optional note. The latest 30 records retain their scene version. |
| Game Studio → Play 3D test | Download the offline HTML and open it in a browser. It uses a lightweight Canvas view of the saved layout, with jumps, checkpoints, gems and an exit. It does not include the WebGL renderer, account data or custom media. |
| Web & App Studio | Add an About, Launch or Portfolio template. Set navigation labels in page order, enter search and social title/description text, and choose section links by page path. Save, check links, then extract the ZIP and open its `index.html`. Static exports do not implement forms or app features. |
| Project → Images & cover | Choose an image, set the crop in original pixels, rotate, optionally limit the longest edge, then preview or save a new WebP in the library. The original and cover selection stay in place. |
| Project → Campaign Studio | Add posts, link images and uploaded Video Studio sources from projects you own, and set local dates, zones, notes and statuses. The handoff JSON includes copy, private asset references and tracked URLs. It does not contain media or publish posts. |
| Campaign Studio → Draft assistant sandbox | Opt in for each request. A local fixture adapter returns up to three review drafts, with five successful requests per project per UTC day. Review and explicitly add a suggestion to the unsaved campaign if useful. No credentials, external model calls or background jobs are configured. |

Playtest reports reflect the creator's browser session. They are not competitive
scores. Exports are private downloads; share only the files you intend to share.
