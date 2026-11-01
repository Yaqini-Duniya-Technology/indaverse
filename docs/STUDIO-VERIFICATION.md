# Verification: studio experience batch

Verified in the Linux build workspace on 2026-10-31:

- Full isolated API suite: 231 passed.
- Web calculation/export tests: 11 passed using Node's test runner.
- Production Next.js build: passed, including TypeScript and all studio routes.
- New component, helper and test files pass targeted ESLint checks.
- Existing repository-wide lint remains failing on pre-existing React-hook issues.
- Git whitespace check: passed.

The new tests cover counts, duration arithmetic, immutable shot schedules,
CSV escaping/formula prefixes, design advice, manuscript reports, and image
filtering/pagination/ownership. Web tests are included in release verification
and the prepared CI workflow.

A browser test was attempted but could not run: Chromium installation failed
because the downloaded archive was invalid. Browser appearance, keyboard
navigation and downloads therefore remain unverified here. Do not describe
these as browser-tested. Test desktop/mobile views on the target machine.

Target smoke checks:

1. Open / and test navigation and FAQs on desktop and mobile.
2. Sign in and test dashboard sort/search/reset/refresh.
3. Open each studio and review its Draft desk. Edit content and confirm live metrics.
4. Download the Markdown and CSV exports; confirm current unsaved content appears.
5. Confirm exports do not change the saved server version.
6. In Video Studio, verify cumulative shot times against known durations.
7. In Story Studio, compare manuscript export with the chapter text.
8. Filter/search/sort images across multiple pages and verify another account cannot download them.
9. Select a local image and confirm the preview appears before uploading.
10. Confirm existing blueprint saves, 2D/3D playback and saved previews still work.
