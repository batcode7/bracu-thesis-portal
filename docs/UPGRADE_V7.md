# Thesis Portal v7 — changes and deployment

**Historical release notes:** For the new v8 supervisor/abstract/deadline changes and the deliberate removal of academic mark-publication gating, follow [`UPGRADE_V8.md`](UPGRADE_V8.md). The v7 instructions about academic publication are superseded. Announcement publishing remains unchanged.

This release updates the existing React/Vite → Cloudflare Pages Functions → Google Apps Script → Sheets architecture. No live deployment or master-sheet write was performed while building this archive.

## Implemented

- Faculty names: remove `Mr.`, `Ms.`, `Mrs.`, `Miss`, `Dr.`, and `Prof.` before comparing capitalization, whitespace and harmless punctuation. A name must map to exactly one directory email to confer faculty-group membership. Duplicate group assignments are counted only once per group. The official name remains the display name.
- Supervisor: verified `myRoles` derived by Apps Script (`Supervisor`, `Co-Supervisor`, or both); combined stage/type/role/search filters; unique-student count across filtered groups; responsive role column.
- Faculty directory: double-click editable initial, designation, room and email. All mutations are Prime Admin-only, update only the matching `Faculty Details` cell, perform conflict and duplicate checks, lock concurrent writes, record an independent faculty edit audit, and refresh the verified snapshot.
- Session refresh: Google ID token is exchanged for a signed, short-lived, Secure/HttpOnly/SameSite session cookie on the same Pages origin. Sessions restore on page reload, last two hours, and are cleared by logout. No long-lived browser storage tokens.
- Student completeness: preserve student records with valid student IDs even if group IDs have formatting variations; normalize group identifiers; distinguish registered data from released marks; show malformed/unmatched source counts and stage totals to Prime Admin. Admin search is paginated beyond 100 records.
- Sync: automated 8-sheet batches with processed/total counts, progress display, bounded retries, pause-at-batch-boundary and stalled/error handling. Publishing is still a separate explicit action, never a side effect of sync.
- Student: compact group member table with emails and a `You` badge, followed by the four-slot supervision team; removed redundant quick-access and stage-explanation content.
- In-memory deadline caching (90 seconds) with manual Refresh, scoped to the signed-in session; caches are cleared at login, logout and preview changes.
- Prime Admin predictive search: typing at least two characters returns debounced, verified suggestions for partial student names, student IDs, faculty names/initials, and thesis IDs/titles. Use ↑/↓ and Enter or click to choose. Faculty selections search by verified directory email (not ambiguous name text); suggestions do not include evaluation marks. The 12 suggestions displayed are a shortlist, not a limit on the full search.
- Loading feedback: a consistent animated spinner and subtle skeleton placeholders appear while Google sign-in initializes, accounts are verified, sessions restore, dashboards load, student or faculty searches run, details open, deadlines load, semester sources refresh, and announcements load. A thin progress indicator accompanies longer authenticated requests. Predictive search displays its own small spinner without interrupting typing. Loaders stop after success or failure, with error messages where requests fail; motion is reduced for visitors who prefer reduced animation.

## One-time deployment steps

1. Back up the current Apps Script `Code.gs` and the project repository. Keep existing Script Properties, especially `BRIDGE_SECRET`, `MASTER_SHEET_ID`, `DEADLINE_SHEET_ID`, `SEMESTER_SOURCES_JSON`, `COMMENTS_INDEX_SHEET_ID`, and any alias/admin properties.
2. Replace the Apps Script editor's complete `Code.gs` with `backend/apps-script/Code.gs` from this ZIP. Save, choose **Deploy → Manage deployments → Edit** for the existing Web app, select **New version**, and deploy. Retain its existing `/exec` deployment URL.
3. Run `installFacultyDirectorySync()` once as the Apps Script owner, authorizing access when prompted. This creates/refreshes a scheduled directory sync. Faculty lookups use a five-minute refresh window.
4. The first successful Prime Admin faculty edit creates a **private audit spreadsheet** owned by the Apps Script account. It is saved under the `FACULTY_AUDIT_SHEET_ID` Script Property; do not grant student access to it. The account must have write access to the master `Faculty Details` tab for inline editing.
5. Replace the GitHub repository files with this project (without `node_modules`, `.env.local`, or live credentials). Run `npm ci`, `npm run test:backend`, and a live-mode build: `VITE_PORTAL_MODE=live VITE_GOOGLE_CLIENT_ID=<your-public-web-client-id> npm run build` on Unix; use Cloudflare's build variables for deployment.
6. In Cloudflare Pages, confirm: `VITE_PORTAL_MODE=live`, `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_HOSTED_DOMAINS`, `APP_ORIGIN` (exact public URL), `APPS_SCRIPT_URL`, and encrypted `BRIDGE_SECRET`. Optional: add independent encrypted `SESSION_SIGNING_SECRET` of at least 32 random characters; otherwise the bridge secret is used with session-specific message separation. The session secret must be stable across deployments.
7. Push to GitHub; allow Cloudflare Pages to rebuild. Confirm Google OAuth's authorized JavaScript origins contain the exact Pages domain and any custom domain in use.
8. Test with separate accounts: Prime Admin, Regular Admin, assigned Supervisor, ordinary Student, and an unauthorized user. Check login, refresh, logout, student-group isolation, supervisor counts, faculty edit permissions, stage deadlines, and private mark publication.
9. In Prime Admin, compare **source/student/group diagnostics** to the current master. Verify the actual P1/P2 counts; the reported 187/182 and 20+12 figures are historical and cannot be asserted for today's data without connecting the live sheet.
10. Review incomplete sync imports, start **Sync all batches**, check progress and errors, and explicitly review/publish results only after verifying all evaluator feedback.

## Verified locally

- `npm run test:backend` — 31 gateway and Pages API tests including partial-name/ID suggestions, verified faculty selection, name normalization, ambiguity, Prime-only edits, conflict checking, audit writes, authorization, publication gating and signed-cookie restoration.
- `VITE_PORTAL_MODE=live VITE_GOOGLE_CLIENT_ID=testing-only-client.apps.googleusercontent.com npm run build` — TypeScript production build. This ID is used for build verification only; it is not in committed source.

## Limitations / required live checks

- No production Google Sheet was read or edited; historical group counts must be verified against current data after deployment.
- Real Google OAuth/browser refresh, all mobile viewport rendering, and Apps Script performance must be tested on the deployed Pages origin. Headless Chromium could not start in the execution environment due to OS socket restrictions; no successful visual QA is claimed.
- Sheets edited externally can be briefly stale: faculty snapshot is on a five-minute TTL; actual group/student reads remain source-backed.
- Audit storage is separate from the master. University IT should review backup, retention, access permissions, and whether log writes need stronger transactional guarantees before high-stakes use.
- The master `Marks` tab supplies a single score per phase; repeat-attempt/semester score ambiguity requires registrar-level policy review before publishing.
- Student source rows with malformed student IDs are reported in diagnostics rather than automatically treated as verified students. Unmatched students remain visible in counts but cannot be given a group dashboard until identity/group data is repaired.
