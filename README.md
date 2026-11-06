# BRAC University Thesis Evaluation Portal

React + TypeScript + Vite foundation, using a restrained academic UI. This repository supports both an explicitly fictional `demo` mode and a `live` Google Workspace mode. The live Cloudflare Pages build uses authenticated Pages Functions and an owner-executed Google Apps Script gateway; demo data is not used for live student records.

## Run locally

```bash
npm install
npm run dev
```

For production static build:

```bash
npm run build
```

The compiled site is in `dist/`.

To deploy from a **private GitHub repository into Cloudflare Pages**, use **[`docs/DEPLOY_PAGES_GITHUB.md`](docs/DEPLOY_PAGES_GITHUB.md)**. The same Pages project serves the React frontend and authenticated `/v1/*` Pages Functions. Your existing Google Apps Script deployment remains the private data gateway. Keep the preview in `VITE_PORTAL_MODE=demo` until the backend, OAuth origins, and authorized Google identities have been tested. Detailed data integration is documented in [`backend/README.md`](backend/README.md).

**Latest upgrade:** See [`docs/UPGRADE_V7.md`](docs/UPGRADE_V7.md) for verified code changes, source-sheet editing safeguards, the secure session-cookie migration, faculty name normalization, synchronization behavior, and exact deployment checks. This release requires deploying a new version of the existing Apps Script Web app before updating the live frontend.

## Current state

- Google Workspace-first landing design; demo previews cannot impersonate a university login. Responsive student dashboard, evaluation cards, semester labels and faculty-comment dialogs.
- Read-only supervisor student listing, search and stage filters.
- Read-only administrator and Prime Administrator student search by student ID, thesis/project/internship ID, supervisor initial, name, or title, with detailed group and sample mark views.
- Semester-by-semester completion summary including distinct student/group counts and separate P1, P2, and final-defense student/group counts. **All preview counts are fictional** until phase-completion synchronization exists.
- Searchable, phase-grouped Deadlines & Links view containing verified hyperlink destinations extracted from the `Deadlines and Links` tab of `Thesis Registration [Student View]` on 5 November 2026. Its demo labels are a static snapshot, not a live feed; the live view uses the authenticated API.
- Semester registry display and Prime Administrator-only access-management preview.
- Verified master/semester source cards and an expandable mapping view for the Summer 2026 reviewer-sheet structure.
- Typed data models and `PortalApi` contract in `src/portal-api.ts`.
- All academic records and evaluation comments are fictional.
- Implemented a separate **live-mode** Google Identity Services sign-in, authenticated student and supervisor pages, administrator search/statistics, phase-comment synchronization controls, and a private Apps Script gateway.
- The updated live Prime Admin area has actual master-level overview metrics, a complete four-person supervision display, faculty directory, useful deadline fallback, animated lookups, and a role-restricted read-only View As feature. See [`docs/PRIME_ADMIN_UPGRADE.md`](docs/PRIME_ADMIN_UPGRADE.md) for the rollout sequence.
- The official `Faculty Details` directory in the permanent master provides initials, names, designations, status, rooms and university email addresses. No faculty email needs to be guessed from a name.
- The live landing page includes a public **News & events** section. Regular and Prime Administrators can create and publish announcements in the **News & Events** editor, with drafts, featured notices, archives and links. It uses a separate private Google spreadsheet, not the student master. See [`docs/NEWS_AND_EVENTS.md`](docs/NEWS_AND_EVENTS.md) for setup and publishing.
- The refreshed **live student workspace** is mobile-oriented, with thesis/group overview, all four assigned supervision slots and verified faculty contact details, separately released evaluation marks and feedback, stage-specific deadlines, a dedicated Resources tab, and bottom navigation on phones. Prime Admin supervisor preview now offers verified faculty selections. See [`docs/STUDENT_EXPERIENCE_UPGRADE.md`](docs/STUDENT_EXPERIENCE_UPGRADE.md).
- The **live supervisor workspace** now shows unique assigned research groups, a student count and current stage per group, stage/type/search filters, and a read-only group-detail popup with the complete student roster, all supervision slots, and directory-verified faculty contact information. Supervisor deadlines and resources are scoped to assigned active stages; Profile is removed. See [`docs/SUPERVISOR_EXPERIENCE_UPGRADE.md`](docs/SUPERVISOR_EXPERIENCE_UPGRADE.md).

## Intended real data mapping

Permanent **Thesis Master** Google Sheet:

| Tab | Lookup | Fields |
| --- | --- | --- |
| `All student info` | Verified Google email → student | B: Student ID; C: Name; D: ThesisID; E: Email |
| `Group info` | ThesisID → group | B: ThesisID; C: Type; D: Current Level; E–H: Supervisors; I: Title |
| `Marks` | Student ID → marks | H: P1; I: P2; J–L: Panel; M: Supervisor; N: Penalty; O: Total; P: Grade point; Q: Letter grade; R: Final Check |
| `Faculty Details` | Verified university email → faculty | A: Initial; B: Name; C: Designation; D: Status; E: Room; F: Email |

Semester-wise panel managers link to **individual judge spreadsheets** where comments actually live. See [`docs/VERIFIED_SHEET_SCHEMA.md`](docs/VERIFIED_SHEET_SCHEMA.md) for the observed table layout, exact phase/comment columns, inheritance of group IDs, formula errors in the consolidated manager marks tab, and historical lookup design. A permanent registry must keep all old semester spreadsheet IDs. A student's P1, P2, and defense records may come from three different semesters. Use a student + phase + attempt/semester index; never replace an archived manager ID.

## Security prerequisites before live launch

1. Create a Google Cloud OAuth web client authorized for the production origin.
2. Verify Google ID tokens **server-side** (issuer, audience, signature, expiration, email verification, Workspace hosted domain). Never trust client-selected roles or requested student IDs.
3. Enforce row-level authorization for every request: students access only their own records; supervisors access only groups assigned to their verified faculty email; administrators see permitted wider records.
4. Pin `partha.bhoumik@bracu.ac.bd` as `prime_admin` in trusted server configuration. Only this principal can create/revoke normal administrators; a Sheets edit must not grant root privileges.
5. Hide unpublished marks and comments together. Treat blank scores differently from zero. Require nonblank comments for each published evaluation.
6. Keep Google Sheets credentials and administrative keys only on the backend, never in `VITE_` frontend variables or downloadable bundles.
7. Connect Google Apps Script through a trusted backend with authenticated requests and proper CORS. Avoid a publicly readable owner-executed Apps Script endpoint that trusts an email string from the client.
8. Comment columns have been checked against representative Summer 2026 judge workbooks; confirm the evaluation-attempt policy, multi-judge feedback policy, and grading-release rules before integration.
9. Link the source sheet's `Deadlines and Links` tab to an authenticated, read-only server API and preserve hyperlink metadata. Its current date labels omit the year and its deadlines are marked expired. Do not claim a new active deadline from these values.
10. Semester completion statistics must be calculated from verified outcome records, not inferred from current `Group info!D` stage, which has no event timestamps. Count unique students/groups per semester and phase; do not sum phase counts to obtain unique totals.

The demo role switcher remains a fictional walkthrough. The live Prime Admin **View As** feature is different: it requires an authenticated Prime Administrator at the backend, retrieves role-scoped data in read-only mode, and is unavailable to regular administrators. It should still undergo university privacy/security review before broad deployment.
