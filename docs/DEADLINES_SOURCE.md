# Deadlines & Links source mapping

Source workbook: **Thesis Registration [Student View]**, provided by the portal owner.

Source tab: `Deadlines and Links` (`gid=760084043`, observed range `A1:F31`). Inspected 5 November 2026 through the authenticated Google Drive connection.

| Column | Meaning |
| --- | --- |
| A | Thesis stage, often blank for subsequent rows belonging to the previous stage |
| B | Submission/event title |
| C | Day of week, or a resource URL/label in the non-deadline rows |
| D | Deadline text, without year in the current sheet |
| E | Status, generally `Expired` |
| F | Submission link label, often `Click here` |

**The visible `Click here` cell text is not the submission URL.** The real destination must be extracted from the Google Sheets cell's `hyperlink` property (or `HYPERLINK` formula), not from the plain-values API. Some general-resource hyperlinks appear in column C rather than F.

The current React `src/deadlines-data.ts` stores a verified snapshot of student-facing deadlines, forms, and resources. It explicitly does **not** auto-refresh. No year has been inferred for dates whose source omits a year. Most deadlines are marked expired. Any future auto-synchronization should:

1. Read column A–F and cell hyperlink metadata server-side.
2. Inherit the preceding nonblank stage name where A is blank.
3. Distinguish events (in person, no URL) from online submissions.
4. Preserve source-provided statuses without projecting old dates into a future semester.
5. Validate that destinations use expected HTTPS hosts; do not blindly redirect to malicious or malformed links.
6. Cache the resulting public deadline entries; do not expose private Sheets credentials to browsers.

If a new semester's deadline list overwrites the same sheet, keep a versioned snapshot by semester, rather than silently rewriting historical deadlines. Confirm a reliable semester identifier before making the sync automatic.
