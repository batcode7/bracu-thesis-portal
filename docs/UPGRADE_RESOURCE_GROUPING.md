# Resources and submission deadline update

## Authoritative resource source

The Resources page reads **Thesis Master**, tab **Resources**, columns **A (Title)** and **B (Data)**, starting from row 2. The header row must be `Title | Data`. All non-empty titles are displayed in source order within groups; HTTPS URLs in the Data column become Open links. Empty or invalid Data URLs display Link unavailable.

Previously, the portal used the unrelated `Deadlines and Links` workbook to discover resources. This behavior is removed. That workbook is now used for deadlines only. The change also applies to D1 snapshot creation through the existing `academicInformation_()` function; `D1Sync.gs` itself does not need changes.

At the time of the source check, the master contained six resource entries:

1. Special Application Submission Form/Internship Offer Letter
2. Information Update Google Form/Thesis Defer Form
3. Thesis Template Fall 2024 onwards (for thesis groups who registered for pre-thesis 1 in Fall 2024) This template will be used by Pre-1 groups from Fall 2024 and onwards
4. Marking Rubric
5. UG Thesis Policy
6. Tutorial on Thesis Template

These are grouped in four expandable sections by their titles: **Forms & Requests**, **Thesis Templates**, **Policies & Guidelines**, **Tutorials & Media**. An **Other Resources** group appears only if future titles do not fit a known category. All groups start expanded. Pagination remains available and defaults to 10 entries per page.

## Submission deadline visibility

- Admin and supervisor/faculty: initially see **All**, with exactly four choices: **All**, **P1**, **P2**, **Defense**. The P1/P2/Defense buttons show only that phase. All also includes general university-wide deadlines.
- Student: no manual stage picker. The backend verifies their student identity and returns only **General** plus the student's *current registered thesis stage*; the frontend applies the same restriction when displaying deadlines.
- The redundant **All stages** filter and deadline search box have been removed.

## Deployment

1. Replace `backend/apps-script/Code.gs` in the existing Apps Script project and publish a new **web app deployment version**. Keep the existing D1Sync script and its five-minute trigger.
2. Commit the entire updated frontend and backend project to GitHub; verify Cloudflare Pages built that commit, with `VITE_PORTAL_MODE=live`.
3. For immediate refresh, run `syncD1Now()` in Apps Script after the new `Code.gs` has been saved, and verify its completion. Otherwise wait for the next successful five-minute trigger. An already-active D1 generation continues to show the old resources until a new generation commits.
4. Hard-refresh the portal. The Resources page should show **six** source items, assuming the source sheet has not changed since inspection.

No D1 schema migration, credential change, or Google Sheet edit is necessary.
