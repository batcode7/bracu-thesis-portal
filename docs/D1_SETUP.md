# D1 setup: Thesis Master remains the source of truth

This is a **deployment guide**, not an already-live migration. The application still works through its existing Google Apps Script gateway when `D1_ENABLED` is absent. Enable D1 only **after** the first successful synchronization.

## What changes

- **Google Sheets stays authoritative.** Edits to old *or* new rows, student names, group assignments, comments, scores, faculty details, deadlines, and resource links are included in each synchronized snapshot.
- A 5-minute Apps Script time trigger scans the master and current `Deadlines and Links` workbook. A SHA-256 snapshot checksum avoids rewriting unchanged data; however it still checks the D1 active checksum, so restoring or replacing a database is detected.
- Cloudflare Pages Functions read student dashboards, supervisor dashboards, account roles, deadlines and resources **directly from D1**. This removes their per-request dependency on the Apps Script execution limit.
- The master-sheet search, Prime Admin overview, faculty edits, role grants, announcements, and historical index sync remain on the authenticated Apps Script backend. They are low-volume operations, but do not have D1-level scale yet.
- Snapshot activation happens only after all batches have been stored; readers see the last complete generation during a partial/failing update. The previous three successful generations are retained for cleanup safety.
- Normal synchronization lag is approximately 0–5 minutes **plus the trigger's processing time**. It is not instant. Google may delay scheduled triggers. A temporarily unavailable upstream sheet prevents a successful new snapshot; the previous D1 generation stays available.

## Step 1 — Create D1 database

In **Cloudflare** create a D1 database, for example `bracu_thesis_cache`. On the Cloudflare Pages project for `bracu-thesis-portal.pages.dev`, add a **D1 database binding** named exactly `DB`, targeting that database.

Apply [`backend/d1/schema.sql`](../backend/d1/schema.sql). Using Wrangler on a machine authenticated to your Cloudflare account:

```bash
npx wrangler d1 execute bracu_thesis_cache --remote --file backend/d1/schema.sql
```

Or paste the statements into the database's SQL console in the Cloudflare dashboard. Execute each statement once; they are safe to rerun because they use `IF NOT EXISTS`.

Verify the three tables `portal_cache`, `portal_sync_runs`, and `portal_active` exist.

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

4. Run **`installD1Sync()`** once from the Apps Script editor as the spreadsheet-owning account. Approve the necessary spreadsheet, trigger and external-request permissions. It immediately calls `syncD1Now()` and schedules a repeat approximately every five minutes. Run `syncD1Now()` manually whenever you need an immediate refresh.
5. Verify that the execution log returns `{synced: true, count: ..., changed: true}`. Query the D1 console:

```sql
SELECT generation, updated_at FROM portal_active WHERE id = 1;
SELECT kind, COUNT(*) AS records
FROM portal_cache
WHERE generation = (SELECT generation FROM portal_active WHERE id = 1)
GROUP BY kind;
```

Do not enable the D1 read path until these checks pass. If synchronization fails, investigate Apps Script execution logs and the Cloudflare Pages Function logs. The prior active generation remains intact.

## Step 4 — Enable fast D1 reads

Set Pages **server-side** environment variable `D1_ENABLED=true` and redeploy.

Verify with actual authorized university accounts:

1. Student A sees only their own group, marks and P1/P2/Defense comments.
2. A supervisor sees only groups linked through a uniquely verified official faculty name/email.
3. A faculty member who is also a Prime Admin has both role choices in the top-right account menu.
4. A student in P2 sees only **General + P2** deadlines, including submission hyperlinks; supervisors and Prime Admins see all stage tabs.
5. Changing an existing Thesis Master comment or faculty assignment eventually appears in D1 after the next successful sync.
6. New Prime Admin grants can take one synchronization interval to appear in D1-backed login/role switching. Their write permissions are always checked against the live Apps Script role list.

If a configured D1 is unexpectedly empty or unavailable, the five high-volume actions return an explicit error rather than flooding Google Apps Script with fallback requests. Set `D1_ENABLED=false` (and redeploy) to intentionally revert to the previous Apps Script read path while investigating.

## Free-tier and reliability notes

- D1 stores **student, student-email alias, group, faculty, faculty assignment, role, deadline, and resource** records. It does not expose a public database endpoint or trust client-supplied roles.
- An unchanged snapshot sends **zero table-row writes** to D1. A changed snapshot currently writes a **complete new generation**; therefore frequent edits can still consume the Free plan's daily D1 write allowance. Monitor Cloudflare usage. For a genuinely high-edit-frequency installation, implement row-level change synchronization before claiming unrestricted free operation.
- This design reduces the major Google Apps Script bottleneck for students/supervisors. **It is not a substitute for a measured concurrency test of 2,000–3,000 authenticated students**, and it does not provide an uptime guarantee.
- The deadline workbook currently has some dates without years and may mark entries as “Expired.” The portal faithfully shows the published Day, Deadline and Days Left, rather than inventing a year or date.
- **Privacy:** D1 is a full additional copy of student and faculty information. Restrict Cloudflare account access, protect the sync secret, and confirm university approval and data-retention policies before migrating real student records.

## Multiple Prime Admins

The legacy regular Admin role has been removed from the live API. A Prime Admin may add another verified faculty-directory email through the **Prime Admins** page. `partha.bhoumik@bracu.ac.bd` remains the non-removable founding Prime Admin. Each authorized Prime Admin can grant or revoke other Prime Admins but cannot revoke themselves. Grants, revocations, and preview targets are recorded in Apps Script properties for a small rolling audit trail. More permanent auditing can be added before institutional deployment.
