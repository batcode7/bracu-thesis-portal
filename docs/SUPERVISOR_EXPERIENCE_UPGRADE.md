# Supervisor workspace — group-oriented view

The live supervisor dashboard has been redesigned to show **one row per assigned research group**, rather than repeating the same group separately for every student. The Prime Admin's read-only Supervisor preview uses this identical interface.

## Group overview

- The summary shows assigned student count, **unique** research group count, and groups marked Completed.
- Each row displays the thesis/project/internship ID, research title, **student count**, current registered stage, and research type.
- Search works locally over group ID/title, assigned student name/ID/email, and supervising faculty names. It does not generate a backend request on every keystroke.
- Stage filters: **All**, **P1**, **P2**, **Final Defense**, **Completed**, and **Deferred**.
- Type filters: **All types**, **Thesis**, **Project**, and **Internship**.

## View group details

Selecting **View** opens a read-only modal showing:

1. Group ID (with copy button), research title, registered current stage, category, and total students.
2. Supervisor 1, Supervisor 2, Co-supervisor 1, and Co-supervisor 2; empty assignments are labeled **Not assigned**.
3. Official faculty email and room when the assigned name has an exact match in the protected `Faculty Details` directory. An unmatched faculty address is **never guessed**.
4. Every student in that group: name, student ID, recorded email, and P1/P2/Defense mark-presence flags.

**Recorded** means a numeric mark is present in the permanent master; it does not imply that the mark or faculty feedback has been released to the student. The supervisor API does not expose individual confidential grading comments via this dashboard.

## Deadline and Resources navigation

- **Deadlines** and **Resources** remain separate tabs. The supervisor Profile tab is removed; Sign out is available instead.
- Supervisor deadline rows are filtered server-side to the **active stages present among their assigned groups**. For example, a supervisor with only P2 groups cannot retrieve P1-only or Final Defense deadlines through the supervisor API.
- The Prime Admin read-only Supervisor preview applies the same stage filter in the browser, even though the Prime Administrator's backend identity retains broader privileges.
- Common academic resources are always shown; stage-specific materials are included only if the supervisor has an assigned group in that phase.

## Mobile behavior

At phone widths, summary cards and filter controls stack naturally, group rows become compact readable cards, and the View dialog shows a single-column student roster. A fixed bottom bar offers **Groups**, **Deadlines**, and **Resources**. The sign-out button remains accessible at the top and in the mobile side menu.

## Deployment and verification

1. Update `backend/apps-script/Code.gs` and deploy **a new version of the existing Apps Script deployment**. The updated gateway enriches authorized group records with verified faculty contact details and filters supervisor deadlines by assigned stages.
2. Push the updated GitHub project to the Cloudflare Pages-connected branch.
3. Use the Prime Admin's View As control to inspect a known verified supervisor with several groups. Confirm one row per group, filter by stage and type, then open a group to check its roster and all four supervision slots.
4. Confirm a supervisor with only P2 assignments receives only P2 deadline entries and that the public student portal continues to hide unpublished evaluation marks/comments.

The live Vite build and backend unit tests are included. A real phone-device visual inspection and a verified faculty-account walkthrough remain necessary after deploying this version.
