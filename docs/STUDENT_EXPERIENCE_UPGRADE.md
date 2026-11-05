# Student workspace refresh and stage-aware deadlines

The live student portal now prioritizes phones and shows four simple destinations: **Dashboard**, **My Evaluations**, **Deadlines**, and **Resources**. The student Profile item has been removed; Sign out remains available at the top and in the side menu. A fixed, four-button bottom navigation appears at narrow screen widths.

## Student dashboard

- Thesis/project title, research category, **copyable thesis ID**, own student ID, group size, and registered current stage.
- Three-stage progress strip: **Pre-Thesis 1 → Pre-Thesis 2 → Final Thesis**. This reflects the authoritative `Group info!D` stage, **not** unverified assumptions about published results or grades. Completed/deferred groups are marked accordingly.
- Assigned **up to two supervisors and two co-supervisors**, showing official email, designation, and room when there is an **exact** match in the protected `Faculty Details` directory. An unmatched name is shown without fabricated contact details.
- Group member names and IDs for the student's own thesis group only.
- Shortcuts to evaluation history, deadlines, and resources.

## My Evaluations

The student can see individual phase evaluation cards and open a detail dialog. A score is displayed only when the relevant phase was formally released and complete marked-and-commented evaluator records exist. Unreleased marks and private feedback are not exposed. Multiple historical attempts remain distinct.

## Deadlines and Resources

These are now separate navigation destinations.

- **Deadlines:** for a current P2 student, the backend sends **only P2** rows from the university deadline workbook. P1 and defense entries are excluded. Final Thesis maps to the Defense phase. Completed/deferred groups receive no active phase-specific deadlines. The browser also enforces the stage filter, including when Prime Admin is in read-only preview mode.
- **Resources:** a separate collection of important guides, templates, and reference folders. Stage-specific links are filtered for students; common resources remain available. This page does not expose unrelated P1 seminar materials to P2 students.
- If the deadline source is empty, students see a clear empty state rather than being shown an outdated archived snapshot as current. Administrators can still see the labeled historical fallback.

## Prime Admin role preview correction

- Selecting **Supervisor / Faculty** loads verified faculty choices from a new Prime-only `previewCandidates` backend action.
- The dialog supports selecting from the official list or typing a **verified** faculty email. It warns before submission if the supplied email is not in the verified directory.
- A Prime Admin email that is not listed in `Faculty Details` is **not** automatically treated as a supervisor. Select a verified faculty account or update the official directory and refresh the faculty snapshot.
- The target email is used only for a read-only support preview; the signed-in Prime Admin's authenticated identity and server-side access rules remain unchanged.

## Rollout

1. Replace the deployed Apps Script `Code.gs` with the updated file in `backend/apps-script/Code.gs` and **deploy a new version of the existing deployment**.
2. Run `installFacultyDirectorySync` as the Apps Script owner if the faculty directory has not already been initialized, and verify `Faculty Details` contains correct email/room data.
3. Push the updated frontend and Pages Function project to the existing GitHub repository; Cloudflare Pages builds automatically.
4. Verify a real student in P1, P2, and Final Thesis, using a phone-sized viewport and desktop. Verify supervisor contact matches and group member names. Confirm P2 cannot retrieve P1/Defense deadlines.
5. As Prime Admin, try **View as another role → Supervisor / Faculty**, choose a verified faculty account from the dropdown, and confirm read-only group access.

`npm run test:backend` checks the stage-scoped backend and verified faculty preview authorization. The production React bundle was also compiled with `VITE_PORTAL_MODE=live` to include these protected screens. No real student login has been used as part of local automated testing.
