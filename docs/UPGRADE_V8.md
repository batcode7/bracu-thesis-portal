# BRAC University Thesis Portal v8 — supervisor, deadlines and academic results

This release builds on v7 without replacing the React/Vite, Cloudflare Pages Functions, Apps Script, or Google Sheets architecture. The live Sheets and deployed portal were not changed while preparing this ZIP.

## What changed

- **Supervisor → My Groups:** keeps the existing list and verified stage/type/role/search filters. Removes the unnecessary explanatory lines. Group details now show the research title, abstract, type-specific ID (e.g. **Project ID**), stage/type/student count, only assigned supervision-team members, and the student roster in that order. The **Copy all emails** button copies unique nonblank student emails, comma-separated, for email recipients.
- **Supervisor marks/feedback:** individual official P1, P2, Defense and (if recorded) supervisor marks appear beside each student. Group detail shows indexed P1/P2/Defense evaluator comments, with evaluator/semester and matching student names. Feedback is deduplicated across repeated member rows. The backend resolves membership from the verified faculty email and excludes comments for unrelated or unmatched students.
- **New abstract column:** `Thesis Master` → `Group info` → **J (Abstract)**, immediately after **I (Title)**. If a row has no abstract, a neutral empty state is shown.
- **Deadlines:** the common authenticated view shows only **P1**, **P2**, and **Defense**. The extra descriptive notice and General/Early Defense sections are removed. The deadline search and links are retained. The backend and frontend apply the same three-phase filter.
- **Resources:** all four current source links are preserved, presented as a restrained, responsive resource library without the previous explanatory paragraph.
- **Header and refresh:** the signed-in Google user's **full display name** replaces initials such as “PA”. The active page is saved in tab-scoped `sessionStorage` and restored after a successful existing-session check. No authentication secrets or grades are saved there. A fresh login starts at Dashboard; an expired session still requires sign-in.
- **Academic results availability:** manual academic **Publish / Unpublish** controls and the `release` API route have been removed. A student's own official master mark appears even if a comment is absent, and a valid indexed comment appears even if a mark is absent. Zero is a valid mark. An authorized supervisor sees available marks/comments for their assigned groups without a manual release flag. The faculty-feedback sync remains explicit and staged, with no incomplete snapshot replacement. **News & Events announcement publishing is unaffected.**
- **Semester overview:** counts indexed student records with an associated official mark or indexed comment, without academic release flags. Marks present only in the master cannot be attributed to a semester and do not contribute to semester-specific summary counts.

## Important privacy decision

**Academic release gating is intentionally removed at the portal owner's request.** Once a mark exists in `Marks`, or a faculty comment is synchronized into the private index, the relevant student can see it immediately. This can expose provisional/unfinished work. Obtain approval from the thesis coordinator or relevant BRAC University academic authority for this changed visibility policy before enabling v8 for students. This does **not** give students access to other students' marks or to arbitrary academic records.

## Deployment

1. Back up the current repository and Apps Script project. Keep all existing Apps Script properties; the former `RELEASED_PHASES_JSON` is no longer read by v8, but it need not be deleted.
2. Replace the owner-executed Apps Script's `Code.gs` with `backend/apps-script/Code.gs`, save, then edit the existing Web app deployment and choose a **New version** while retaining its `/exec` URL.
3. Upload/push the updated React, TypeScript, CSS and Pages Functions files to the existing GitHub repository, allowing Cloudflare Pages to rebuild. Keep existing OAuth, bridge-secret and Cloudflare environment settings.
4. Inspect `Group info` column **J** to confirm abstracts are adjacent to titles in **I**. Confirm the Apps Script owner has read access and the private indexed comment source remains accessible.
5. Test with separate verified faculty, student, admin and Prime Admin accounts: correct abstract, assigned faculty only, unique email copy, correct recorded marks/comments, no cross-group feedback, P1/P2/Defense deadlines, unchanged resource links, full Google name and same-page refresh.
6. Review whether immediate student visibility is permitted under current university grading and moderation policy. Synchronizing P1/P2/Defense comments now makes them visible without any separate approval button.

## Verification and limitations

- Production-mode TypeScript/Vite build passed and **34 of 34** backend/API tests passed, including new abstract-column parsing, verified supervisor-only comments, independent mark/comment visibility, and phase-restricted deadline data.
- No real student marks, abstract text or private reviewer comments were downloaded for this upgrade. Column J and comment availability must be confirmed against the live master after deployment.
- Browser-level OAuth, actual network latency, mobile layouts and clipboard permissions require manual deployment testing. Chromium could not launch in this execution environment, so no successful visual/browser QA is claimed.
- The underlying permanent `Marks` tab contains one official score per phase per student; historical repeat attempts may need a richer data model to avoid attaching today's master score to multiple semester feedback entries.
