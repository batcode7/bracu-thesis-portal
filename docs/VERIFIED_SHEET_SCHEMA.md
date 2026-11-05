# Verified Google Sheets schema — 5 November 2026

This is a **schema inspection**, not a live data connection. The connected Google Drive account was used to inspect the real `Thesis Master` and `2026 Summer Thesis Panel Manager`, plus two representative faculty evaluator spreadsheets for each evaluation phase. No student records have been imported into the frontend.

## Permanent Thesis Master

| Tab | Key | Columns needed by the portal |
| --- | --- | --- |
| `All student info` | `E` student email | `B` student ID, `C` name, `D` thesis/group ID |
| `Group info` | `B` thesis/group ID | `C` type, `D` current level, `E:H` supervisor/co-supervisor names, `I` title |
| `Marks` | `B` student ID | `C` thesis ID, `H` P1 (5), `I` P2 (10), `J:L` final defense parts (30 total), `M` supervisor (55), `N` penalty, `O` total, `P` grade point, `Q` grade, `R` final check |

The first data row in these master tabs contains numeric artifacts/placeholder values and must not be assumed to be a real student record. Validate ID formats and skip invalid entries.

The master can be used for grades/status, but the `Level` field is the **current** stage, not a reliable historical record of which semester a student completed P1/P2/Defense. Do not infer comment semester from `Level` or from an unrelated `Semester` column.

## Summer 2026 manager → individual evaluator books

Each phase has its own panel tab. Column `I` of the panel tab contains evaluator-sheet URLs, one per judge. These are different Google spreadsheet files from the manager itself. In representative evaluator books:

| Phase | Manager panel tab | Evaluator tab | Start row | Group ID | Student key | Individual/total mark | Faculty remarks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | `P1_Panel` | `MarkSheet` | 4 | `C` | `F` email | `J` / 5 | `K` |
| P2 | `P2_Panel` | `MarkSheet` | 5 | `C` | `H` email | `M` / 10 | `N` |
| Defense | `FT_Panel` | `Marksheet` | 6 | `E` | `G` student ID | `N` / 30 | `O` |

**Important:** The capitalization `MarkSheet` versus `Marksheet` differs between these workbooks. Verify a sheet's actual tab title before reading it. Some per-evaluator comment cells are blank even where marks exist. The portal's publication rule must therefore hide scores until both release authorization and the required faculty feedback are present.

P1 remarks are often written once for a group, while P1 scores can appear on each student row. P2 may have individual scores and per-row remarks. The defense sheet lists individual marks by student ID. Blank group ID cells on subsequent member rows inherit the latest nonblank group ID above; **never** treat a blank group ID as a new group.

The manager's consolidated `P1_Marks` area currently contains errors such as `#REF!` and `#VALUE!`, so it cannot be the sole reliable source for the portal's comments. Several manager tabs are manually laid out or combine multiple tables side by side. Do not parse these as one uniform database table.

## Historical comment resolution

1. Authenticate a person using a Google-issued token, verified by the backend.
2. Resolve the student from the permanent master using the verified email, then use the student ID and thesis ID internally.
3. For each phase, locate the *recorded semester of that attempt*. Example: P1 in Spring 2025, P2 in Summer 2026, Defense in Fall 2026.
4. Find that semester in an **append-only registry** of panel managers; never overwrite an old semester's spreadsheet ID when registering a new semester.
5. Within the matching panel manager, follow the judge links for that phase, read evaluator sheets, join by student email or ID **and** thesis ID/phase/semester, and collect attributed comments.
6. Multiple evaluator comments should be preserved separately. The exact rule for a sufficient comment (at least one panel comment vs. each judge's comment) and the authority to release marks must be confirmed before enabling publication.
7. Store a normalized private result/snapshot so a student dashboard does not have to open dozens of sheets on each page load. Refresh by admin-controlled synchronization, recording source IDs, timestamps, and errors.

Suggested normalized key: `(student_id, thesis_id, phase, semester, attempt_id, evaluator_email)`. Include `approved_for_release`, `score`, `feedback`, and `last_synced_at`. Never use a displayed role switcher or a request-provided email as the basis for authorization.

## Known blockers to live launch

- No Google OAuth client configuration, server-side session validation, or backend web-app deployment is installed yet.
- Historical panel manager links for earlier/future semesters have not been registered.
- The supervisor names in `Group info` are strings; a verified faculty **email mapping** is needed before supervisor-only row access can be enforced.
- Final release/approval rule and multi-judge comment policy must be confirmed; a numeric score alone is not proof of publication.
- Do not make these workbooks public or put a Google Drive access token in client-side React code.
