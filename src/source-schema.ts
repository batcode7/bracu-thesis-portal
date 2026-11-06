/**
 * Verified against the live Summer 2026 semester manager and two evaluator
 * workbooks per phase. This is structural metadata only; it contains no
 * private spreadsheet IDs, access tokens, or student records.
 *
 * Do not use this client module as an authorization mechanism. The live
 * server verifies the user and scopes every academic response by role.
 */
export const VERIFIED_MASTER_COLUMNS = [
  { tab: 'All student info', lookup: 'Email (E)', fields: 'Student ID (B), name (C), thesis ID (D)' },
  { tab: 'Group info', lookup: 'Thesis ID (B)', fields: 'Type (C), current level (D), supervisors (E–H), title (I), abstract (J)' },
  { tab: 'Marks', lookup: 'Student ID (B)', fields: 'P1 (H), P2 (I), defense parts (J–L), supervisor (M)' },
] as const;

export const VERIFIED_COMMENT_COLUMNS = [
  { phase: 'P1', source: 'P1_Panel → evaluator MarkSheet', group: 'C', member: 'F (email)', score: 'J', comment: 'K', startsAt: 4 },
  { phase: 'P2', source: 'P2_Panel → evaluator MarkSheet', group: 'C', member: 'H (email)', score: 'M', comment: 'N', startsAt: 5 },
  { phase: 'Defense', source: 'FT_Panel → evaluator Marksheet', group: 'E', member: 'G (student ID)', score: 'N', comment: 'O', startsAt: 6 },
] as const;

export const SOURCE_LOOKUP_RULES = [
  'Find a signed-in student by their verified BRAC Google email, never a user-entered student ID.',
  'Use their thesis ID to read Group info → Level for current status.',
  'Resolve the relevant phase and semester independently; retain links to every previous semester.',
  'Find the evaluator workbook link in that semester’s panel tab (column I), then read its marks and remarks.',
  'A blank group ID on a member row inherits the last nonblank group ID above it.',
  'Show verified students their own existing master marks and matching indexed comments independently; zero is a valid mark, not missing data.',
] as const;
