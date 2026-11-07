# D1 and progressive-loading upgrade

This release keeps the existing React + Cloudflare Pages + Apps Script architecture. It changes authenticated **read** operations; Google Sheets remains the official source and Apps Script still handles authorized writes.

## What is faster

| Page or operation | Data path | First load |
| --- | --- | --- |
| University login and faculty identity | Verified Google sign-in + D1 | One indexed role check; Google authentication is unchanged |
| Faculty research groups | D1 | First 10 matching groups, matching group/student totals |
| Faculty group abstracts | D1 | Hidden; prefetched together after the group page renders |
| Faculty directory | Precomputed D1 faculty index | First 10, with server-side filters and page sizes 10/20/50/100 |
| Student search | D1 | First 10, with server-side search, filters and pagination |
| Student/group details | D1 | Loaded only when the user opens a record |
| Search suggestions | D1 | A bounded list on demand |

The faculty group query now batches group records and members instead of making one D1 request per group. D1 still enforces verified identity, admin-only searches, faculty assignments, and student ownership. The browser is never given direct D1 credentials.

## Required upgrade steps

1. **Back up** the existing Apps Script files and Pages configuration.
2. Apply the updated [`backend/d1/schema.sql`](../backend/d1/schema.sql) to the existing D1 database. It adds a safe `IF NOT EXISTS` index; it does not delete data.
3. Deploy the updated Cloudflare Pages project, including `backend/d1/read.mjs`, `backend/d1/sync.mjs` and `backend/api/handler.mjs`.
4. Update the existing Apps Script deployment with **both** [`backend/apps-script/Code.gs`](../backend/apps-script/Code.gs) and [`backend/apps-script/D1Sync.gs`](../backend/apps-script/D1Sync.gs). If the second file is named `D1code.gs` in your editor, replace its contents; do **not** keep both copies defining the same functions. Deploy a new version of the **same** web-app deployment.
5. Run `syncD1Now()` from Apps Script. If a large snapshot checkpoints, let its next trigger resume until it reports a completed generation.
6. Check the active D1 generation has a nonzero `faculty_list` count:

   ```sql
   SELECT kind, COUNT(*) AS records
   FROM portal_cache
   WHERE generation=(SELECT generation FROM portal_active WHERE id=1)
   GROUP BY kind;
   ```

7. Confirm the **production** Pages environment has the `DB` D1 binding and **server-side** `D1_ENABLED=true`, then redeploy after any configuration change.
8. Confirm the **build** environment has `VITE_PORTAL_MODE=live` and the public `VITE_GOOGLE_CLIENT_ID` value. Neither the D1 sync secret nor Apps Script bridge secret belongs in a frontend variable.

## Validation after deployment

- Log in as an ordinary faculty member; check group totals, role filters, pagination, and group details. Open the first abstract after a short pause; it should appear without loading the entire dashboard again.
- Log in as an administrator; check that student search starts with 10 rows and that pages, query, stage, type and faculty selection return the correct total.
- Check the faculty directory's first page, name search, verified/unmatched filter, page size and page navigation. An edit is written immediately to Sheets but can take one synchronization interval to appear in D1.
- Verify that an unauthorized faculty member cannot read another faculty member's groups or abstracts, and that a student cannot search the private directory.
- Use browser Developer Tools → Network to record timings for `/v1/session`, `/v1/supervisor`, `/v1/search`, `/v1/facultyList` and `/v1/groupAbstracts` (no need to share tokens or private responses). Speed claims should be based on those timings and concurrent-user testing, not animations.

For complete first-time setup and security notes, see [`D1_SETUP.md`](D1_SETUP.md).
