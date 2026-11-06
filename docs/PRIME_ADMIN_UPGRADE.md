# Historical administrator UI refresh — rollout notes

**Role note:** Older references to “Prime Admin” now mean **Admin**, the only administrator role. Follow [`D1_SETUP.md`](D1_SETUP.md) for the current role migration.

**Historical documentation:** The academic Publish/Unpublish control described in older notes has been removed by v8. See [`UPGRADE_V8.md`](UPGRADE_V8.md); News & Events publication is unaffected.

This update modifies the live Cloudflare Pages frontend **and** the owner-executed Google Apps Script. Update both sides; pushing only the frontend will leave the new `overview`, `facultyList`, and `preview` actions unavailable.

## New Prime Admin screens

- **Overview:** real permanent-master population and recorded phase marks, semester-specific released evaluation counts, publication state, sync timestamp, and navigation shortcuts. It never invents counts.
- **Student Search:** animated loading state and detailed record with supervisor 1/2, co-supervisor 1/2, members, recorded marks, and a copy-thesis-ID control.
- **Faculty List:** automatically indexed from `Thesis Master` → `Faculty Details` (`A` initial, `B` name, `C` designation, `D` status, `E` room, `F` email). Shows names in `Group info` without an exact faculty match as email-unavailable, without inventing an address.
- **Deadlines & Links:** normalized stages for the live `Deadlines and Links` source; reference resource cards; clearly labeled November 2026 snapshot fallback when the live feed has no entries.
- **Administrators:** keeps only administrator management, removes the visible supervisor and student-email mapping forms. Existing private mappings are not deleted.
- **View as:** Prime Admin–only read-only previews for a regular admin role or a specific faculty/student email. Server-side role checks remain in force, and previews never write on behalf of the target.

## Deploy in this order

1. Open the existing Apps Script project linked to the portal.
2. Replace the existing `Code.gs` with `backend/apps-script/Code.gs` from this update; save.
3. In Apps Script, select the `installFacultyDirectorySync` function and run it **once** as the script owner. Approve the normal authorization prompt. This reads the official master `Faculty Details` tab, snapshots the directory privately and installs a six-hour time trigger. Confirm its result and verify the trigger under **Triggers**.
4. Use **Deploy → Manage deployments → Edit → New version → Deploy**. Keep the same web-app URL and existing `BRIDGE_SECRET`, `MASTER_SHEET_ID`, and `DEADLINE_SHEET_ID` Script Properties.
5. Push the updated GitHub repository to `main`. Cloudflare Pages will build and deploy the frontend and `functions/v1/[action].js` API routes automatically.
6. Sign in as the Prime Administrator. Verify Overview, Faculty List, a Student Search detail, and Deadlines & Links. Test **View as** with a known university student email and a known faculty email; exit the preview afterward.
7. Confirm a **regular admin** cannot see the Faculty List or the View As control and cannot call the `preview` or `facultyList` APIs. Confirm a student's evaluation remains hidden when not formally released.

## Known data boundaries

- A faculty name is assigned to an email only if it exactly matches a trusted directory name or an earlier protected mapping; fuzzy matching is not used to grant student-data access.
- Some students have a personal address in the permanent master's only email field. Existing alias mappings remain valid; this UI removes the manual form but does not invent a way to verify an unrelated university email. A university-approved mapping source is needed for full zero-touch student onboarding.
- The live deadlines sheet may contain undated reference materials and expired forms. The fallback snapshot is not a new academic schedule; it is labeled as a historical reference.
- The new Overview makes an additional protected backend call. Lookup performance optimizations (batching, cached index, and timing measurements) should be assessed separately from this UI refresh.

## Verification

```bash
npm ci
npm run build
npm run test:backend
```
