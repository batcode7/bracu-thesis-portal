/** Entirely fictional figures for layout and interaction testing. */
export interface CompletionCount { students: number; groups: number }
export interface SemesterSummary {
  semester: string;
  students: number;
  groups: number;
  p1: CompletionCount;
  p2: CompletionCount;
  defense: CompletionCount;
}

export const semesterSummaries: SemesterSummary[] = [
  { semester: 'Spring 2025', students: 211, groups: 59, p1: { students: 143, groups: 38 }, p2: { students: 121, groups: 32 }, defense: { students: 95, groups: 25 } },
  { semester: 'Summer 2025', students: 207, groups: 57, p1: { students: 126, groups: 34 }, p2: { students: 132, groups: 36 }, defense: { students: 108, groups: 28 } },
  { semester: 'Fall 2025', students: 226, groups: 64, p1: { students: 158, groups: 42 }, p2: { students: 117, groups: 32 }, defense: { students: 102, groups: 27 } },
  { semester: 'Spring 2026', students: 230, groups: 65, p1: { students: 151, groups: 40 }, p2: { students: 144, groups: 39 }, defense: { students: 118, groups: 31 } },
  { semester: 'Summer 2026', students: 244, groups: 68, p1: { students: 162, groups: 43 }, p2: { students: 136, groups: 37 }, defense: { students: 111, groups: 29 } },
];

export type DemoMarks = { p1: number | null; p2: number | null; defense: number | null; supervisor: number | null; grade?: string };
export const demoMarksByStudent: Record<string, DemoMarks> = {
  '22101234': { p1: 4.5, p2: 8.5, defense: null, supervisor: null },
  '22104567': { p1: 4.5, p2: 8.0, defense: null, supervisor: null },
  '21201456': { p1: 4.0, p2: 8.5, defense: null, supervisor: null },
  '20301892': { p1: 4.75, p2: 9.0, defense: 26, supervisor: 49, grade: 'A' },
  '22301678': { p1: null, p2: null, defense: null, supervisor: null },
  '22201011': { p1: null, p2: null, defense: null, supervisor: null },
  '23201031': { p1: 4.25, p2: 8.0, defense: null, supervisor: null },
  '23201752': { p1: 4.5, p2: 8.0, defense: null, supervisor: null },
  '22301114': { p1: 4.0, p2: null, defense: null, supervisor: null },
  '22301323': { p1: 4.25, p2: null, defense: null, supervisor: null },
  '21301005': { p1: 5.0, p2: 9.0, defense: 27, supervisor: 50, grade: 'A' },
  '23301466': { p1: null, p2: null, defense: null, supervisor: null },
  '22301703': { p1: null, p2: null, defense: null, supervisor: null },
};
