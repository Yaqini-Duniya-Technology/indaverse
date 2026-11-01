# Verification: guided recovery batch

Built on 1 November 2026 against the studio experience upgrade checkpoint.

Checks performed in the Linux workspace:

- Production Next.js build including TypeScript: passed.
- Node unit tests: 15 passed, including recovery isolation, malformed records, portable envelope and help contexts.
- Targeted ESLint for the new recovery/help components and their JavaScript libraries: passed.
- Full isolated API regression suite: 246 passed (3,501 dependency/deprecation warnings).

Browser rendering, download behavior, page-exit persistence, cross-tab interactions and the Windows PowerShell installer have not been executed in this environment. The Chromium download required for browser automation failed. Existing repository-wide lint findings are outside this batch; targeted lint passing is not a claim that full lint passes. SQLite tests do not verify PostgreSQL locking.

## Local acceptance checks

1. Stop API and web terminals; apply the patch after the preceding studio experience batch.
2. Run scripts/Verify-Release.ps1. Restart using Start-IndaVerse.ps1.
3. In Story, Video and Web & App, export a draft. Import it, inspect the preview, confirm apply, then save manually.
4. Confirm an invalid draft shows field errors without changing editor content or the server version.
5. In Video, transfer a shot referencing an unavailable image; verify the warning and cleared link.
6. Enable browser recovery, edit, wait a second and refresh. Review the prior tab's copy and apply only after inspecting it.
7. Check another project/account cannot see that copy through the recovery list. Local storage remains accessible to anyone with access to the browser profile.
8. Check Help on mobile and desktop, keyboard Escape/Close, field search, and project Images/Plan section links.
9. Confirm the saved-version conflict checks still reject an outdated server save.

Recovery is best effort and opt-in, and is off again on refresh. Export valuable work before changing accounts, clearing storage or replacing a draft. No push, migration or secret change is part of installation.
