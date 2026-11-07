# D1 incremental recovery — BRACU Thesis Portal v11

This guide assumes you **already dropped** `portal_cache`, `portal_sync_runs`, and `portal_active` in Cloudflare D1 and **deleted** the five-minute Google Apps Script sync trigger. The original Google Sheet is the authority; D1 is a replaceable, private read cache.

**Do not run the previous v10 `D1Sync.gs` or `installD1Sync()`.**

## 1. Create the new tables

In Cloudflare Dashboard → Workers & Pages → D1 → your existing thesis database → Console, paste **the entire contents** of `backend/d1/schema.sql`. The updated schema includes a fourth table, `portal_sync_deletes`, and a `record_hash` column in `portal_cache`.

Alternatively, from the project root with Wrangler already authenticated:

```bash
npx wrangler d1 execute bracu_thesis_cache --remote --file backend/d1/schema.sql
```

Change the database name above if yours is different. Verify:

```sql
SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;
PRAGMA table_info(portal_cache);
```

Expected project tables: `portal_active`, `portal_cache`, `portal_sync_deletes`, `portal_sync_runs`. `portal_cache` **must have** `record_hash`. If an older table already exists, rerunning `CREATE TABLE IF NOT EXISTS` alone will not add that column.

## 2. Deploy matching application code

- Deploy the supplied **full website project** to the same Cloudflare Pages GitHub repository and wait for the Pages Functions deployment. The Pages endpoint `/internal/d1-sync` must use the new `backend/d1/sync.mjs`.
- In the **existing** Google Apps Script project, replace `D1Sync.gs` with the supplied `backend/apps-script/D1Sync.gs`. Keep the matching `Code.gs` from this project, your existing Script Properties and the existing Apps Script web-app deployment configuration.
- Keep the five-minute trigger **disabled** and avoid running the old uploader between steps.
- If D1-backed pages currently error because the database is empty, temporarily set Pages server-side `D1_ENABLED=false` and redeploy. This intentionally switches to the slower Google Apps Script fallback until the cache is repopulated.

## 3. Remove stale import checkpoints

Apps Script → Project Settings → Script Properties: delete these keys **only if present**:

- `D1_PENDING_GENERATION`
- `D1_PENDING_CHECKSUM`
- `D1_PENDING_CURSOR`
- `D1_PENDING_DELETE_CURSOR`

Keep `D1_SYNC_URL`, `D1_SYNC_SECRET`, and other application configuration. The URL must point to your correctly deployed Pages project.

## 4. Import once

From the Apps Script editor, select and run `syncD1Now()` **manually**. Do not use `installD1Sync()` to seed, because it also creates a new recurring trigger.

- A first full import of about 14,000 rows takes multiple batches. If it returns `{pending:true}`, run `syncD1Now()` again until `{synced:true}`.
- If the request fails, inspect Apps Script → Executions and Cloudflare Pages Functions logs. Do not reactivate the periodic trigger until errors are fixed.
- Cloudflare Free plan also has daily write quotas, so a first import may need to wait for quota reset if you previously exhausted it.

Verify in D1 Console:

```sql
SELECT generation, updated_at FROM portal_active WHERE id = 1;
SELECT COUNT(*) AS active_records
FROM portal_cache
WHERE generation = (SELECT generation FROM portal_active WHERE id = 1);
SELECT COUNT(DISTINCT generation) AS total_generations, COUNT(*) AS total_rows
FROM portal_cache;
SELECT kind, COUNT(*) AS count
FROM portal_cache
WHERE generation = (SELECT generation FROM portal_active WHERE id = 1)
GROUP BY kind ORDER BY kind;
```

Expect one active generation, total rows approximately equal to the active record count, and a nonzero `faculty_list` count.

## 5. Verify the incremental behavior before scheduling

1. Run `syncD1Now()` again without editing the Sheets. It should report `changed:false`; **no cache rows should be written**.
2. Change exactly one non-sensitive source field in the master Sheet (or wait for a real authorized edit), then run `syncD1Now()` once. Logs should show a small number of added/updated or deleted records. Additional derived records may change if they depend on the edited field.
3. Repeat the generation-count query. **It should still be 1.** The number of rows should change only if source items were added or removed.
4. Restore the test field if you changed it; sync again.
5. Confirm faculty login, student login, student search, group details, and faculty directory show authorized data.

Only after these checks, if you want updates approximately every five minutes, run **`installD1Sync()` once**. It installs the time trigger and also starts a sync immediately. Keep the Pages `DB` binding and `D1_SYNC_SECRET` unchanged.

## What changed

- **Previous design:** every detected source change wrote a complete new 14,000-row generation; failed cleanup left old full copies behind.
- **Updated design:** one stable active generation. The client obtains compact hashes for current rows, uploads only changed/new records and removed keys, and the server applies that delta in one atomic transaction. Temporary rows and completed sync job metadata are removed.
- The Google Sheets master is still scanned periodically to discover old-row/formula changes. D1 stores only the compact active record set and temporary in-progress changes.

The initial import is a full write because the database is empty; future imports are incremental. This is an application-level improvement tested locally, **not yet a verified production deployment**.
