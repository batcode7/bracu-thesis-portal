# Thesis Portal v9 — Master-Driven Feedback and Type-Ahead Role Preview

## Authoritative academic data

The `Thesis Master` Google spreadsheet is authoritative for phase comments and source links:

| Tab | Source fields | Portal behavior |
| --- | --- | --- |
| `Group info` | B: ThesisID, K: P1 Semester, L: P1 Comments, M: P2 Semester, N: P2 Comments, O: Def Semester, P: Def Comments | Finds the exact verified research group and shows group-wide P1/P2/Defense comments to that group's student and assigned supervisors. |
| `Marks` | Official student scores | Keeps per-student marks separate from group-wide comments. A recorded zero is valid. |
| `Panel Manager Links` | A: semester (e.g., `Summer26`), B: spreadsheet URL | Reads semester sources automatically. Missing/blank links are not listed. |

Empty comments, spreadsheet error markers, and formula-generated "No Comments" or "Panel manager link missing" placeholders are not treated as actual panel feedback.

## Portal changes

- The Prime Admin **Semester Sources** page shows linked semester managers read-only. The old manual source registration form and corresponding API routes are removed.
- Optional historical index synchronization remains available for historical semester statistics, but **no longer controls which comments appear** in student, supervisor, or admin details.
- The Prime Admin role-preview dialog searches students by partial names/IDs/emails. In Faculty preview, type initials/name/email to filter the verified faculty dropdown, or choose from the alphabetical full list; a separate email field also accepts a verified faculty Workspace address directly. List labels omit Mr./Ms./Mrs. while retaining Dr.; sorting ignores titles and uses the faculty's actual name. All preview requests remain authorized under the signed-in Prime Admin identity.
- Prime Admin student details, student evaluations, and authorized supervisor group details all display master group comments.

## Deploy

1. Back up the current Apps Script `Code.gs` and retain its Script Properties, especially `BRIDGE_SECRET` and `MASTER_SHEET_ID`.
2. Replace `Code.gs` with `backend/apps-script/Code.gs` from this package, then create a **new deployment version** of the existing Apps Script web app. Check that its owner can read `Group info` and `Panel Manager Links` in Thesis Master.
3. Commit the updated frontend and Pages Function to your GitHub repository, then redeploy Cloudflare Pages with `VITE_PORTAL_MODE=live` and your existing environment secrets.
4. Test with a verified student in a group that has a P2 comment, a verified supervisor assigned to the same group, and a Prime Admin role preview. Confirm a user from another group cannot read those comments.
5. Test a semester row with no URL and a group with empty comments: neither should be presented as a valid source or faculty feedback.

The supplied project does **not** automatically publish or mutate the university's live Google Sheets or Apps Script deployment.
