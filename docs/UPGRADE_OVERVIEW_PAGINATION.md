# BRACU Thesis Portal — overview, directory, and pagination update

## Changes

- Administrator Overview now shows only four distinct-group totals: Pre-Thesis 1, Pre-Thesis 2, Final Thesis, and Completed. It reads indexed `group` stages from the active Cloudflare D1 generation when D1 is enabled. No marks, comments, or student master records are required for these counters.
- Administrator and Faculty List requests no longer load the entire student master before answering. Faculty group counts are calculated in one traversal using uniquely verified directory names instead of repeated per-faculty scans. Administrator access changes retain verified email checks and a locked audit write.
- View as another role is a normal administrator page, rather than a pop-up overlay. Previewed student and supervisor views are still read-only and still use the signed-in admin's identity.
- Resources are displayed as quiet rows with clear unavailable-link labels, not fabricated URLs.
- Pagination defaults to 10 items per page, with 10, 20, 50, or 100 options. It is available in administrator Student Search, Faculty List, supervised groups, Resources, Administrators, and News & Events. Server-side Student Search validates page-size limits.
- The landing-page role disclaimer has been removed. An understated animated progress indicator appears while Google sign-in is verified, with reduced-motion support.

## How to deploy

1. In the **existing** Google Apps Script project, replace **`Code.gs`** with this package's `backend/apps-script/Code.gs`. Keep your current properties and D1Sync script. Save, then select **Deploy → Manage deployments → Edit → New version → Deploy** so the existing web-app endpoint serves the new code.
2. Upload/commit this package to your GitHub repository and let **Cloudflare Pages** redeploy (or redeploy the Pages project manually). The environment variable `VITE_PORTAL_MODE=live` must remain set for the production build. Keep your existing bindings/secrets.
3. Refresh the portal. Confirm the four Overview counters appear quickly, Faculty List opens, and Administrators lists existing accounts and allows granting another faculty administrator. Verify a second administrator sees the same menu after D1 synchronization.
4. No D1 schema migration or manual delete is needed. The five-minute `syncD1Now` trigger continues to publish updated roles and group data; if its last run failed, fix the sync error before relying on new roles.

**How to tell the new frontend is actually deployed:** The Overview heading must read **"Thesis groups at a glance"** with exactly four counters. If you still see **"A clearer view of thesis activity"**, the browser is displaying the *old frontend bundle*. Confirm that GitHub `src/LivePortal.tsx` imports `SimpleOverview`, that Cloudflare Pages built the correct branch and commit, and then hard-refresh the page. The old `PrimeOverview` component has been removed from this package to avoid confusion when merging files.

## Resource source update

The earlier resource-link troubleshooting for `Deadlines and Links` was superseded. The portal now reads only **Thesis Master → Resources**, columns `A: Title` and `B: Data`. See [`UPGRADE_RESOURCE_GROUPING.md`](UPGRADE_RESOURCE_GROUPING.md).

## Verification

- `npm run test:backend`: backend and D1 authorization/synchronization tests.
- `VITE_PORTAL_MODE=live npm run build`: checks the live frontend, types, and production bundle.
- Admin action tests confirm the grant/list endpoints do not read student or group rows; Faculty List and Overview count tests confirm they do not read student rows; D1 overview tests confirm students/faculty cannot fetch admin counters.
