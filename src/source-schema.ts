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
  { tab: 'Group info', lookup: 'Thesis ID (B)', fields: 'Type (C), current level (D), supervisors (E–H), title (I), abstract (J), P1 semester/comments (K/L), P2 (M/N), Defense (O/P)' },
  { tab: 'Marks', lookup: 'Student ID (B)', fields: 'P1 (H), P2 (I), defense parts (J–L), supervisor (M)' },
  { tab: 'Panel Manager Links', lookup: 'Semester (A)', fields: 'Panel manager spreadsheet URL (B), maintained in Thesis Master' },
] as const;

export const VERIFIED_COMMENT_COLUMNS = [
  { phase: 'P1', source: 'P1_Panel → evaluator MarkSheet', group: 'C', member: 'F (email)', score: 'J', comment: 'K', startsAt: 4 },
  { phase: 'P2', source: 'P2_Panel → evaluator MarkSheet', group: 'C', member: 'H (email)', score: 'M', comment: 'N', startsAt: 5 },
  { phase: 'Defense', source: 'FT_Panel → evaluator Marksheet', group: 'E', member: 'G (student ID)', score: 'N', comment: 'O', startsAt: 6 },
] as const;

export const SOURCE_LOOKUP_RULES = [
  'Find a signed-in student by their verified BRAC Google email, never a user-entered student ID.',
  'Use their thesis ID to read Group info → Level for current status.',
  'Read P1, P2, and Defense semesters and group-wide comments directly from Group info K:P by exact thesis ID.',
  'Read panel manager links from Thesis Master → Panel Manager Links; leave the portal registry read-only.',
  'Older evaluator workbooks may still be synchronized to a separate index for historical statistics only.',
  'Show verified students their own master marks and their group’s master comments independently; zero is a valid mark.',
] as const;
