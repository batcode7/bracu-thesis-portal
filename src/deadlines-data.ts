/**
 * Read-only snapshot of the 'Deadlines and Links' tab in the university-facing
 * 'Thesis Registration [Student View]' workbook, inspected 5 November 2026.
 * This does not auto-refresh. Dates are quoted as displayed (year absent).
 */
export type DeadlinePhase = 'General' | 'P1' | 'P2' | 'Defense' | 'Early Defense';
export interface DeadlineEntry {
  id: string;
  phase: DeadlinePhase;
  title: string;
  date: string;
  status: 'Expired' | 'Reference' | 'In person';
  action: string;
  url?: string;
}

export const deadlineEntries: DeadlineEntry[] = [
  { id: 'information-update', phase: 'General', title: 'Group information update / thesis defer notification', date: '21 September', status: 'Expired', action: 'Information update form', url: 'https://forms.gle/VBnjsueTGNAVnF3n8' },
  { id: 'special-application', phase: 'General', title: 'Special application / internship offer letter', date: 'As listed in source', status: 'Reference', action: 'Submission form', url: 'https://forms.gle/FLmyaCUWMf7cSVog6' },
  { id: 'p1-report', phase: 'P1', title: 'Pre-Thesis 1 report submission (soft copy)', date: 'Wednesday · 7 October', status: 'Expired', action: 'Report submission', url: 'https://forms.gle/nTidXAZbxGrEnEVWA' },
  { id: 'p2-report', phase: 'P2', title: 'Pre-Thesis 2 report submission (soft copy)', date: 'Friday · 2 October', status: 'Expired', action: 'Report submission', url: 'https://forms.gle/hFDYYhazEuvFgXkYA' },
  { id: 'p2-poster', phase: 'P2', title: 'Pre-Thesis 2 poster submission', date: 'Friday · 2 October', status: 'Expired', action: 'Poster submission', url: 'https://forms.gle/nDPixxwgSYBvadCy6' },
  { id: 'p2-presentation', phase: 'P2', title: 'Pre-Thesis 2 poster presentation', date: 'Friday · 9 October', status: 'In person', action: 'Offline' },
  { id: 'defense-draft', phase: 'Defense', title: 'Final Thesis initial draft (PDF)', date: 'Saturday · 26 September', status: 'Expired', action: 'Draft submission', url: 'https://forms.gle/JhK9VKcUfMze2rEA9' },
  { id: 'defense-slide', phase: 'Defense', title: 'Final Defense presentation slides', date: 'Tuesday · 29 September', status: 'Expired', action: 'Slide submission', url: 'https://forms.gle/DmpLpK5Vj1erj8ko6' },
  { id: 'defense-inperson', phase: 'Defense', title: 'Final Defense presentation', date: 'Saturday · 3 October', status: 'In person', action: 'Offline' },
  { id: 'defense-ieee', phase: 'Defense', title: 'IEEE-formatted thesis report (PDF)', date: 'Monday · 5 October', status: 'Expired', action: 'IEEE report submission', url: 'https://forms.gle/ZJVrkjQ2NYwwWWxs5' },
  { id: 'defense-final', phase: 'Defense', title: 'Final Thesis report (PDF)', date: 'Monday · 5 October', status: 'Expired', action: 'Final report submission', url: 'https://forms.gle/c6WRYFm7WeDsdXyN6' },
  { id: 'defense-hardcopy', phase: 'Defense', title: 'Hard-copy submission after email confirmation', date: 'Upon email confirmation', status: 'Reference', action: 'Submission form', url: 'https://forms.gle/X7NGXdSrkfA33fUT8' },
  { id: 'early-defense-draft', phase: 'Early Defense', title: 'Early Final Thesis initial draft (PDF)', date: 'Tuesday · 28 March', status: 'Expired', action: 'Draft submission', url: 'https://forms.gle/JhK9VKcUfMze2rEA9' },
  { id: 'early-defense-slide', phase: 'Early Defense', title: 'Early Final Thesis presentation slides', date: 'Wednesday · 29 March', status: 'Expired', action: 'Slide submission', url: 'https://forms.gle/DmpLpK5Vj1erj8ko6' },
];

export const resourceLinks = [
  { title: 'Thesis lifecycle', detail: 'Process flowchart', url: 'https://drive.google.com/file/d/1tMgIr8czAURIiF41qBydUZVhbinrrIzZ/view' },
  { title: 'Undergraduate thesis policy', detail: 'Student policy document', url: 'https://docs.google.com/document/d/1pAMjuQAxSEcLgkbvmx9qJGvK2BlPQhvXhgev8OeJTas/edit' },
  { title: 'Report and poster samples', detail: 'Reference folder', url: 'https://drive.google.com/drive/folders/17Vz4kBF_zH7NKX0fWd8n9aIcJtziBXtz' },
  { title: 'Pre-Thesis 1 seminar materials', detail: 'Reference folder', url: 'https://drive.google.com/drive/folders/1EiM1EKMIGK_Ps3J4wEX_JQatnX8ruNZM' },
];
