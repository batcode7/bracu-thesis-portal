# D1 setup: Thesis Master remains the source of truth

This is a **deployment guide**, not an already-live migration. The application still works through its existing Google Apps Script gateway when `D1_ENABLED` is absent. Enable D1 only **after** the first successful synchronization.

## What changes

- **Google Sheets stays authoritative.** Edits to old *or* new rows, student names, group assignments, comments, scores, faculty details, deadlines, and resource links are included in each synchronized snapshot.
- An optional 5-minute Apps Script trigger scans the Thesis Master and academic links. A full-data checksum skips unchanged data; when source data changes, per-record SHA-256 hashes select only added, updated and removed records.
- Cloudflare Pages Functions read student dashboards, **paginated faculty dashboards**, student search/results, student/group details, the faculty directory, autocomplete suggestions, account roles, deadlines and resources **directly from D1**.
- Initial directory and faculty pages retrieve only 10 records; later pages are fetched on demand. Group abstracts are omitted from the initial faculty group listing and are prefetched separately after the first page renders, then revealed only when requested.
- Faculty edits, role grants, announcements, historical index sync, and other state-changing operations still use the authenticated Apps Script backend. An administrative update to the authoritative sheet is reflected in D1 after synchronization, not instantly.
- The first import activates one complete generation. Later imports stage changed rows/removals and atomically apply only that delta to the long-lived active generation. Failed/interrupted uploads cannot partially overwrite active data.
- Normal synchronization lag is approximately 0–5 minutes **plus the trigger's processing time**. It is not instant. Google may delay scheduled triggers. A temporarily unavailable upstream sheet prevents a successful new snapshot; the previous D1 generation stays available.

## Step 1 — Create D1 database

In **Cloudflare** create a D1 database, for example `bracu_thesis_cache`. On the Cloudflare Pages project for `bracu-thesis-portal.pages.dev`, add a **D1 database binding** named exactly `DB`, targeting that database.

Apply [`backend/d1/schema.sql`](../backend/d1/schema.sql) to a **new or empty** database. The v11 schema includes row hashes and a removal staging table. `CREATE TABLE IF NOT EXISTS` does not upgrade an existing v10 schema. Using Wrangler on a machine authenticated to your Cloudflare account:

```bash
npx wrangler d1 execute bracu_thesis_cache --remote --file backend/d1/schema.sql
```

Or paste the statements into the database's SQL console in the Cloudflare dashboard. Execute each statement once; they are safe to rerun because they use `IF NOT EXISTS`.

Verify four tables: `portal_cache`, `portal_sync_runs`, `portal_sync_deletes`, and `portal_active`.

## Step 2 — Configure Cloudflare Pages

In your Pages project's server-side settings, configure:

| Setting | Value |
| --- | --- |
| D1 binding | `DB` → `bracu_thesis_cache` |
| Secret environment variable | `D1_SYNC_SECRET` → a new unique random secret of **32+ characters** |
| Existing settings | Keep `GOOGLE_CLIENT_ID`, `APP_ORIGIN`, `BRIDGE_SECRET`, `SESSION_SIGNING_SECRET` (if set), and `APPS_SCRIPT_URL` |
| `D1_ENABLED` | **Leave unset** until Step 4 |

Use different secrets for D1 and Apps Script. Never put either secret in a frontend `VITE_` variable. If you use different production/preview bindings, check the binding on the actual production environment. Redeploy the GitHub-backed Pages project so Pages Functions receive the new bindings and `/internal/d1-sync` endpoint.

## Step 3 — Update the existing owner-run Google Apps Script

1. Replace the existing **`Code.gs`** with [`backend/apps-script/Code.gs`](../backend/apps-script/Code.gs). Redeploy the same existing web-app deployment as a **new version**, keeping it owner-executed and protected by `BRIDGE_SECRET`.
2. Add a **second Apps Script code file** named `D1Sync.gs`, with the contents of [`backend/apps-script/D1Sync.gs`](../backend/apps-script/D1Sync.gs). It relies on helper functions in `Code.gs`.
3. Add these values under **Project settings → Script properties**:

   | Property | Value |
   | --- | --- |
   | `D1_SYNC_URL` | `https://bracu-thesis-portal.pages.dev/internal/d1-sync` |
   | `D1_SYNC_SECRET` | Exactly the same strong secret as in Pages Functions |
   | `MASTER_SHEET_ID` | The existing Thesis Master spreadsheet ID (the file has a verified default) |
   | `DEADLINE_SHEET_ID` | `1SkyO77YFde-N4bpxQ5lb07FH24hFINyR4JBgD47Xamk` (the current deadline/resource workbook; already the code default) |

4. For a freshly cleared database, remove any stale Script Properties `D1_PENDING_GENERATION`, `D1_PENDING_CHECKSUM`, `D1_PENDING_CURSOR`, and `D1_PENDING_DELETE_CURSOR`. Run **`syncD1Now()` manually** from Apps Script. If it returns `pending: true`, run it again to resume. Once the new Pages code, schema, and Apps Script are deployed and a complete manual import is verified, optionally run `installD1Sync()` to enable the five-minute trigger.
5. Verify that the execution log returns `{synced: true, count: ..., changed: true}`. Query the D1 console:

```sql
SELECT generation, updated_at FROM portal_active WHERE id = 1;
SELECT kind, COUNT(*) AS records
FROM portal_cache
WHERE generation = (SELECT generation FROM portal_active WHERE id = 1)
GROUP BY kind;
```

Do not enable the D1 read path until these checks pass. If synchronization fails, investigate Apps Script execution logs and the Cloudflare Pages Function logs. The prior active generation remains intact.

The `faculty_list` count must be **nonzero** before enabling D1-backed reads. Update `Code.gs`, `D1Sync.gs`, Pages Functions, and D1 schema together. The v11 Apps Script uploader is incompatible with the old Pages sync endpoint; the v11 Pages endpoint requires the new schema.

### Handling duplicated source records

- **Student ID is the immutable record key.** If the same Student ID appears twice in Thesis Master, synchronization intentionally fails; correct the upstream import formula before trying again.
- Multiple **different IDs with the same Google Workspace email do not stop synchronization**. Both Student ID records remain in D1. The conflicted email is omitted from the `student_email` login index so the same Google account cannot access one student's private data arbitrarily.
- Examine the Apps Script execution log and Script Properties `D1_EMAIL_COLLISION_COUNT` / `D1_EMAIL_COLLISIONS_JSON` (up to 40 entries) to find conflicted addresses and Student IDs. The official UG Thesis source does not need to be edited.
- Students whose emails are ambiguous cannot use their student account until an administrator verifies a separate unique email or resolves the conflict through an authoritative, controlled override. This is intentional; never select the first matching ID for authorization.
- Large imports are **resumable**. A run checkpoints the job identifier, checksum, update cursor and removal cursor in `D1_PENDING_GENERATION`, `D1_PENDING_CHECKSUM`, `D1_PENDING_CURSOR`, and `D1_PENDING_DELETE_CURSOR`. If the source changes mid-import, abandoned temporary rows are cleaned before the new job. Use `syncD1Now()` for manual updates.
- D1 search-index strings have a 250-character limit. The Apps Script uploader truncates only the denormalized `name` index for unusually long thesis/resource titles; the full original text remains in `data_json` and the snapshot checksum. Other invalid indexes or oversized source records produce a descriptive error before uploading any more batches.

## Step 4 — Enable fast D1 reads

Set Pages **server-side** environment variable `D1_ENABLED=true` and redeploy.

Verify with actual authorized university accounts:

1. Student A sees only their own group, marks and P1/P2/Defense comments.
2. A supervisor sees only groups linked through a uniquely verified official faculty name/email.
3. A faculty member who is also an administrator has both role choices in the top-right account menu.
4. A student in P2 sees only **General + P2** deadlines, including submission hyperlinks; supervisors and administrators see all stage tabs.
5. Changing an existing Thesis Master comment or faculty assignment eventually appears in D1 after the next successful sync.
6. New administrator grants can take one synchronization interval to appear in D1-backed login/role switching. Their write permissions are always checked against the live Apps Script role list.
7. Faculty directory shows the first 10 records promptly, with search/filter results and totals computed server-side. Student search also starts with 10 records and retrieves the next page only when requested.
8. Faculty group totals reflect every matching group, while only the selected page's group/student records are sent to the browser. Opening a group shows a collapsed abstract; the active page's abstracts are fetched securely afterward.

If a configured D1 is unexpectedly empty or unavailable, accelerated reads return an explicit error rather than flooding Google Apps Script with fallback requests. Set `D1_ENABLED=false` (and redeploy) to intentionally revert to the previous Apps Script read path while investigating. This is a **degraded mode**: it is substantially slower and must not be used as a performance benchmark.

## Free-tier and reliability notes

- D1 stores **student, student-email alias, group, faculty, precomputed faculty directory, faculty assignment, role, deadline, and resource** records. It does not expose a public database endpoint or trust client-supplied roles.
- An unchanged snapshot sends **zero D1 data-row writes**. A changed snapshot scans compact current fingerprints and stages/commits **only added, changed and deleted rows**. Small metadata writes still occur for a changed sync. Monitor Cloudflare usage; this is periodic Google Sheets comparison, not event-driven replication.
- This design reduces the major Google Apps Script bottleneck for students/supervisors. **It is not a substitute for a measured concurrency test of 2,000–3,000 authenticated students**, and it does not provide an uptime guarantee.
- The deadline workbook currently has some dates without years and may mark entries as “Expired.” The portal faithfully shows the published Day, Deadline and Days Left, rather than inventing a year or date.
- **Privacy:** D1 is a full additional copy of student and faculty information. Restrict Cloudflare account access, protect the sync secret, and confirm university approval and data-retention policies before migrating real student records.

## Administrator management

There is exactly one privileged role: **Admin**. Every administrator sees the same administrator workspace and may appoint another verified email from the official faculty directory through **Administrators**. Admins may revoke each other but not their own access. The account `partha.bhoumik@bracu.ac.bd` is included as a migration bootstrap administrator **without permanent special protection**. No extra privileged founder role exists.

When the upgraded Apps Script first writes `ADMIN_ROLE_LIST_JSON`, it merges the bootstrap account and any previous `ADMIN_EMAILS_JSON` and `PRIME_ADMIN_EMAILS_JSON` lists. These older properties remain untouched for rollback but no longer grant privileges after the first role edit. D1 accepts older `prime_admin` records from already active generations, presenting them as ordinary `admin` until the next successful synchronization publishes `admin` records. Admin grants/revocations and preview targets are recorded in rolling Apps Script audit properties; consider permanent auditing before broad deployment.

**Upgrade order from an older Prime Admin deployment:** Update `Code.gs` and `D1Sync.gs`, redeploy the existing Apps Script web app; deploy the updated Cloudflare Pages build; then run `syncD1Now()` (or let the five-minute trigger finish). Existing D1 data remains available during the rollout. Do not manually delete old D1 rows or properties.
