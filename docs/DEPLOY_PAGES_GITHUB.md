# Deploy BRACU Thesis Portal with GitHub + Cloudflare Pages

This is the recommended **single Cloudflare Pages project** deployment. It hosts both the Vite frontend and the secure Pages Functions API. For this upgrade, update the **existing** Apps Script deployment to a new version before pushing the frontend; keep the same Web app URL. See [UPGRADE_V7.md](UPGRADE_V7.md).

**Never commit the `BRIDGE_SECRET`, Google passwords, a client secret, student records, or `.env.local` to GitHub.** Create a **private** GitHub repository while the system is being tested. Note that private source code does not automatically make a `*.pages.dev` website private; the server must continue enforcing login and per-record permissions.

## 1. Prepare the repository on Windows

Extract this ZIP, open PowerShell **in the project root** (the folder containing `package.json`), and run:

```powershell
npm install
npm run test:backend
npm run build
git --version
```

If Git is not installed, install **Git for Windows** before proceeding. Local `npm run dev` and `npm run build` may continue to show the fictional demo—that is intentional until Cloudflare supplies its production build variables.

On [github.com/new](https://github.com/new), create a repository named `bracu-thesis-portal`:

- Visibility: **Private** (recommended while testing).
- Do **not** pre-create a README, `.gitignore`, or license; they are already in this ZIP.

In the same PowerShell window, run (replace `YOUR_USERNAME`):

```powershell
git init
git branch -M main
git add .
git commit -m "Initial BRACU Thesis Portal"
git remote add origin https://github.com/YOUR_USERNAME/bracu-thesis-portal.git
git push -u origin main
```

If a Git repository is already initialized, skip `git init`; if a remote named `origin` already exists, inspect it with `git remote -v` before adding a different one.

## 2. Connect GitHub to Cloudflare Pages

1. Open **Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git**.
2. Choose **GitHub**, authorize access to your `bracu-thesis-portal` repository, and select it.
3. Set the production branch to `main`.
4. Use the following **Build settings**:

   | Setting | Value |
   | --- | --- |
   | Framework preset | React (Vite), if offered |
   | Root directory | Repository root (leave blank/default) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

5. Create the Pages project. Cloudflare may publish a first **demo-mode** build until you add the variables below. Do not share it with students yet.

The Pages Functions route is included in the repository at `functions/v1/[action].js`. It is compiled automatically for `/v1/*` when Cloudflare Pages builds from Git.

## 3. Configure production variables and secrets

In your Cloudflare Pages project, open **Settings → Variables and Secrets**. Under **Production**, add:

| Type | Variable name | Value |
| --- | --- | --- |
| Plain text | `VITE_PORTAL_MODE` | `live` |
| Plain text | `VITE_GOOGLE_CLIENT_ID` | `913503508398-omvltps9211nqdefuga8jcq1bvb1bi7f.apps.googleusercontent.com` |
| Plain text | `GOOGLE_CLIENT_ID` | The exact same public OAuth Web Client ID (for server-side audience verification) |
| Plain text | `APP_ORIGIN` | Exact production site origin, e.g. `https://bracu-thesis-portal.pages.dev`, without a trailing `/` |
| Plain text | `GOOGLE_HOSTED_DOMAINS` | `bracu.ac.bd,g.bracu.ac.bd` (verify actual Google Workspace hosted-domain claims) |
| **Encrypted secret** | `APPS_SCRIPT_URL` | Your already-deployed `https://script.google.com/macros/s/.../exec` URL |
| **Encrypted secret** | `BRIDGE_SECRET` | The **same** 64-character key you saved in Apps Script `Script Properties` |
| Optional encrypted secret | `SESSION_SIGNING_SECRET` | An independent random string of at least 32 characters for signing HttpOnly sessions; otherwise `BRIDGE_SECRET` is used |

You may configure these for Preview too **only if you intend to let previews access live academic records**. Otherwise, restrict the live configuration to Production. Do not set `VITE_API_BASE_URL`: requests use the same Pages origin and relative `/v1/...` URLs.

**Do not put `BRIDGE_SECRET` in a variable beginning `VITE_`**: Vite copies such variables into public browser JavaScript. Keep it as an encrypted Pages Function secret.

After saving variables, **trigger a fresh production deployment** (redeploy the latest commit or push a new Git commit). The first deployment may have been built in demo mode; the new one must be built with `VITE_PORTAL_MODE=live`.

## 4. Register your final Pages origin with Google

Cloudflare shows a URL like `https://bracu-thesis-portal.pages.dev` (use the actual domain shown in your dashboard).

In [Google Cloud Console → Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients), open the OAuth **Web application** client and add that exact origin under **Authorized JavaScript origins**. Retain `http://localhost:5173` for local tests if useful. No redirect URI is needed by the existing button callback.

If you later add your own domain, add that domain as an authorized JavaScript origin too. Verify both faculty `@bracu.ac.bd` and student `@g.bracu.ac.bd` accounts can authenticate; both may or may not share a single Google Workspace organization.

## 5. Verify before inviting students

1. Visit the published Pages URL. You should see the **Google sign-in screen**, not the demo role selector.
2. Sign in as `partha.bhoumik@bracu.ac.bd`. The server must return `prime_admin`.
3. Open **Faculty List** and verify that official faculty names with or without `Mr.`, `Ms.`, etc. resolve to the same identity; use approved inline edits only when needed.
4. Map any student's BRAC email to their 8-digit Student ID if their master-sheet row contains a personal email.
5. Register semester manager IDs and choose **Sync all batches** for P1/P2/Defense until each is complete. Allow the Apps Script owner to open every evaluator workbook; inaccessible workbooks fail the sync.
6. Review academic marks and feedback **before** syncing. The new portal intentionally has no academic Publish button: available master marks appear immediately, and successfully synchronized comments appear automatically for verified students and assigned supervisors. Confirm this policy is approved by the university before providing student access.
7. Test accounts for a student, supervisor, admin and unauthorized Gmail user; confirm row-level data separation.

### What happens on later updates?

Edit source code, then run from your Windows project folder:

```powershell
git add .
git commit -m "Update thesis portal"
git push
```

Cloudflare Pages automatically rebuilds your production branch when you push to GitHub. Do not commit secrets or student data.

### Technical notes

- `src/live-api.ts` fetches the same-origin `/v1/<action>` API.
- `functions/v1/[action].js` authenticates calls using `backend/api/handler.mjs`.
- The handler validates Google ID-token signature, issuer, audience, expiry, verified email and Workspace hosted domain. It issues a two-hour Secure/HttpOnly/SameSite cookie so refresh does not require a new login, then calls Apps Script with a server-side shared secret. Each backend action rechecks the real user's role; sign-out clears the cookie.
- Apps Script independently authorizes students, assigned supervisors, admins and the one Prime Administrator.
- The private semester comment index is separate from the university source Sheets.
- Root `.gitignore` excludes local environment files, local secrets, dependencies and generated build output from **new** GitHub repositories.

The deployed website is only ready for real student use after successful end-to-end tests and approval under university data-handling policy.
