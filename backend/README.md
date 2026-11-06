# Live backend setup — BRAC University Thesis Evaluation Portal

This folder contains the server-side implementation for Google Workspace sign-in and read-only student/supervisor records. The Google Apps Script gateway is deployed separately. The portal API now runs in the **same Cloudflare Pages project** as the React frontend. Follow [`../docs/DEPLOY_PAGES_GITHUB.md`](../docs/DEPLOY_PAGES_GITHUB.md) to deploy through GitHub.

## Architecture

1. **React/Vite frontend:** Google Identity Services obtains a short-lived Google ID token. The frontend never reads a Sheet directly and never determines its own role.
2. **Cloudflare Pages Function** (`../functions/v1/[action].js`, using `api/handler.mjs`): verifies Google's RSA signature and the token's issuer, audience, expiry, verified email, and Workspace hosted domain. Only a verified email/sub is passed onward. The API has the same origin as the frontend.
3. **Google Apps Script** (`apps-script/Code.gs`): reads the master and deadline Google Sheets using its owner's existing access. Every authenticated action checks the verified email against a trusted server-side role. Faculty identities are sourced from the master's `Faculty Details` tab (A:F). It also maintains a **private, separate** indexed copy of semester evaluation comments and a separate public-announcement store.

Most source Sheets remain read-only. The requested Prime Admin faculty inline-edit feature now changes only explicitly selected cells in the master `Faculty Details` tab, with server-side validation, conflict checks and a separate private audit log. Evaluation synchronization still writes only its private comment index.

## 1. Set up university Google OAuth

- Use an authorized BRAC University Google Cloud project if institutional policy requires it.
- Configure the OAuth consent screen for the organization's users and create an **OAuth 2.0 Web application** client.
- Add the exact frontend origin (for example, `https://your-domain.example`) to **Authorized JavaScript origins**. Also add `http://localhost:5173` to test locally.
- Copy the public **Client ID**. Never use a client secret in the frontend.
- Verify the actual Workspace `hd` claim of a test faculty and student account. Configure the Pages Function allowlist accordingly; the example permits `bracu.ac.bd` and `g.bracu.ac.bd`.

## 2. Create the Apps Script data gateway

1. Visit [script.google.com](https://script.google.com/) as an account authorized to read the **Thesis Master**, the **Thesis Registration [Student View]** deadlines Sheet, the semester panel-manager workbooks and **every individual evaluator workbook**.
2. Create a standalone Apps Script project. Paste the complete contents of `apps-script/Code.gs` into `Code.gs`.
3. Under **Project Settings → Script Properties**, configure:

   | Property | Value |
   | --- | --- |
   | `BRIDGE_SECRET` | A newly generated random value of at least 32 characters, used only by Apps Script and Pages Function |
   | `MASTER_SHEET_ID` | `1Zx2ZJoFTHl8VVIxHklX6EXUVzTJuY1xwg3zVDSfclqU` |
   | `DEADLINE_SHEET_ID` | `1SkyO77YFde-N4bpxQ5lb07FH24hFINyR4JBgD47Xamk` |

   Optional: `SEMESTER_SOURCES_JSON` — e.g. `[{"semester":"Summer 2026","spreadsheetId":"1Z882cDXwrQwuMgbSFF3CQmqyWXuAXq8U3Thn7569QTU"}]`. If omitted, Summer 2026 is pre-registered.

4. Deploy as **Web app**, executing as the script owner. If using **Anyone** access for the server-to-server bridge, understand that the endpoint is publicly reachable but rejects requests without the high-entropy `BRIDGE_SECRET`. Keep the secret out of the URL and out of logs; periodically rotate it. Use a university-approved service account/deployment arrangement where possible.
5. Copy the **web app `/exec` URL**. The Apps Script owner will be prompted to authorize Spreadsheet access at first use. Verify the owner can open judge workbooks; without that access, synchronization will fail safely.
6. Do not expose the Apps Script URL or bridge secret in browser code.

## 3. Deploy the single Cloudflare Pages application

**Use GitHub → Cloudflare Pages**, with the repository root as project root, `npm run build` as build command, and `dist` as output. Pages compiles `functions/v1/[action].js` and serves the API at `/v1/*` on the same origin. No standalone Cloudflare Worker or `VITE_API_BASE_URL` is needed.

Set the following variables in the Pages **Production** environment:

- Plain text `VITE_PORTAL_MODE=live`
- Plain text `VITE_GOOGLE_CLIENT_ID=<your public OAuth Web Client ID>`
- Plain text `GOOGLE_CLIENT_ID=<same public OAuth Web Client ID>` for the Pages Function
- Plain text `APP_ORIGIN=<exact production https origin>` for same-origin request protection
- Plain text `GOOGLE_HOSTED_DOMAINS=bracu.ac.bd,g.bracu.ac.bd` (verify actual hosted domains)
- **Encrypted secret** `APPS_SCRIPT_URL=<your deployed /exec URL>`
- **Encrypted secret** `BRIDGE_SECRET=<the same value used by Apps Script>`
- Optional independent encrypted `SESSION_SIGNING_SECRET=<at least 32 random characters>`

Do not place `BRIDGE_SECRET` in source files, GitHub, build logs or any `VITE_` variable. Trigger a fresh production deployment after setting the variables. The complete Windows/GitHub procedure is in [`../docs/DEPLOY_PAGES_GITHUB.md`](../docs/DEPLOY_PAGES_GITHUB.md).

## 5. Initial academic configuration

1. Sign in as `partha.bhoumik@bracu.ac.bd`. This account is the **only hard-coded Prime Administrator**; no API route can create another prime administrator.
2. Under **Administrators**, add regular admin emails. **Faculty List** reads the official `Faculty Details` directory; Prime Admin can edit initials, designation, room and email by double-clicking with optimistic conflict checks. Run `installFacultyDirectorySync` once as the Apps Script owner to install its hourly refresh trigger. Requests refresh a stale snapshot after five minutes. Faculty edits are logged in a separate private audit spreadsheet.
   Use **News & Events** to create public landing-page notices. This automatically creates private announcement storage the first time a notice is saved; no extra spreadsheet setup or Cloudflare variable is needed. See [`../docs/NEWS_AND_EVENTS.md`](../docs/NEWS_AND_EVENTS.md). When upgrading an existing portal, redeploy a new version of this Apps Script before publishing the new GitHub build.
3. Under **Semester Sources**, register each semester's panel-manager Spreadsheet ID. Historical IDs remain in the registry, and the API prevents an existing semester's source from being overwritten.
4. For each semester and phase, use **Sync all batches**; the interface automatically repeats calls until complete, interrupted or errored. Apps Script processes up to 8 evaluator workbooks per invocation to fit its execution limits.
5. If one or more judge Sheets are inaccessible, grant the Apps Script owner access and select **Restart sync** before retrying. Incomplete/failed staged snapshots never replace the last complete index.
6. Review the source marks and faculty comments before synchronizing. There is **no separate academic Publish step**: official marks in the permanent master and successfully indexed comments become visible independently to the verified student and authorized supervising faculty. This is an intentionally changed visibility policy; obtain university approval before giving students access.
7. Repeat registration/synchronization each semester. A student can have P1 in Spring 2025, P2 in Summer 2026 and defense in Fall 2026, each from its original source.

### Important grading caveat

For P1/P2/Defense, the **official numeric scores** displayed to students come from the permanent master `Marks` tab; **comments** and semester metadata come from the individual judge workbooks via the indexed copy. Their identity is joined by both thesis/group ID and individual email/student ID. A verified supervisor sees actual phase marks for assigned students and indexed comments for those groups only. Blank marks are never treated as zero. `Group info!J` is the abstract, immediately beside the title in column I.

The prototype currently assumes one official score in `Marks` for each phase per student, even if there are multiple evaluator rows or a repeat attempt. Before production, test a few real repeat/deferred cases with the coordinator. If actual records contain *multiple attempt-specific official scores*, extend the master model to store the score per attempt and semester before making those results available.

### Administrator summary semantics

Counts are **unique students and groups with indexed evaluator records and at least one associated official mark or comment** for each semester and phase. Master-only marks have no semester attribution. These are not counts of all enrolled students in a semester (the source tables do not define enrollment by semester). The source manager's `P1_Marks` tab is not used; it contains formula errors in the inspected workbook.

The refreshed **Prime Admin Overview** also displays global master-level totals (validated students, research groups, and recorded phase marks). These are labeled separately and must not be interpreted as semester-specific enrollments.

### Prime Admin read-only role preview

- Only the verified Prime Administrator can call `preview` to inspect the student, supervisor, or ordinary admin experience. The endpoint enforces this on Apps Script as well as in the interface.
- Student/faculty previews resolve an actual matching university email against the trusted master/directory. They cannot set their own role or submit an arbitrary student ID to gain access.
- Role preview preserves the Prime Administrator's original identity and displays an exit banner. There are no write controls in the ordinary admin preview. This feature is for administrative support, **not** an alternative sign-in mechanism.
- The old student-email alias mappings, if any, remain enforced server-side. Because `All student info` contains only one email column, a student with a personal email in that column cannot be matched to an unrelated university account automatically. Obtain an authoritative university-email roster before replacing that rule; do not infer identity from names.

## 6. Verification before giving students access

- `npm run build` — compile React/TypeScript.
- `npm run test:backend` — verify Google signing/audience/hosted-domain checks, Pages origin protection and Apps Script role scoping.
- Test one mapped student, one supervisor and one admin using separate verified BRAC accounts; confirm a student cannot submit another student's ID to retrieve records.
- Attempt to sign in with consumer Gmail; expect a refusal.
- Test a faculty account with no mapping; expect a refusal, not all students.
- Test a blank mark, a valid zero mark, comments without marks, and an inaccessible judge workbook. Verify that only the actual student and assigned supervisor can view their respective data; an incomplete sync must preserve the last complete indexed snapshot.
- Test a student with P1, P2 and Defense in three **different semesters**.
- Configure Google's authorized JavaScript origins to include the actual Pages domain. Pages Functions use the request's own origin for their browser-origin checks.

## Privacy and operational notes

Do not publish the source spreadsheets themselves, expose Sheet IDs via public JSON, or put student records into client-side mock bundles. The current built-in demo uses explicitly fictional records; never copy production student details into it. Store authentication keys and the bridge URL in the Pages Function's encrypted server-side settings and Apps Script properties. Follow university retention and access policy for the private indexed comments spreadsheet.

This is an implementable scaffold, **not a production security certification**. Institution-wide deployment should be reviewed by BRAC University IT for Google Workspace/OAuth and student-data handling policy.
