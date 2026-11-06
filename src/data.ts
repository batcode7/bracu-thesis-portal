export type Role = 'student' | 'supervisor' | 'admin' | 'prime_admin';
export type Phase = 'P1' | 'P2' | 'Defense' | 'Supervisor';
export type Publication = 'published' | 'pending';
export type GroupStage = 'Pre-Thesis 1' | 'Pre-Thesis 2' | 'Final Thesis' | 'Completed' | 'Deferred';

export interface Student {
  id: string;
  name: string;
  email: string;
  thesisId: string;
}
export interface ThesisGroup {
  id: string;
  title: string;
  abstract?: string;
  type: 'Thesis' | 'Project' | 'Internship';
  stage: GroupStage;
  primarySupervisor: string;
  /** Official initial/shortcode when known; synthetic values in this demo. */
  primarySupervisorInitial: string;
  secondarySupervisor?: string;
  secondarySupervisorInitial?: string;
  coSupervisor1?: string;
  coSupervisor2?: string;
  members: string[];
}
export interface Evaluation {
  id: string;
  studentId: string;
  phase: Phase;
  semester: string;
  score: number | null;
  maxScore: number;
  comment: string | null;
  evaluator: string;
  publication: Publication;
}
export interface SemesterSource {
  semester: string;
  status: 'Schema verified' | 'Source needed';
  description: string;
  phases: Array<'P1' | 'P2' | 'Defense'>;
}

/** Fictional records for UI development; never use these as real academic data. */
export const students: Student[] = [
  { id: '22101234', name: 'Ariana Rahman', email: 'demo.student@example.com', thesisId: 'T2530123' },
  { id: '22104567', name: 'Nafis Ahmed', email: 'nafis@example.com', thesisId: 'T2530123' },
  { id: '21201456', name: 'Samia Islam', email: 'samia@example.com', thesisId: 'P2430184' },
  { id: '20301892', name: 'Rafid Hasan', email: 'rafid@example.com', thesisId: 'T2330108' },
  { id: '22301678', name: 'Mahin Chowdhury', email: 'mahin@example.com', thesisId: 'T2610176' },
  { id: '22201011', name: 'Tasmia Noor', email: 'tasmia@example.com', thesisId: 'T2610176' },
  { id: '23201031', name: 'Orin Tabassum', email: 'orin@example.com', thesisId: 'T2510091' },
  { id: '23201752', name: 'Ridwan Alam', email: 'ridwan@example.com', thesisId: 'T2510091' },
  { id: '22301114', name: 'Farhan Islam', email: 'farhan@example.com', thesisId: 'P2510142' },
  { id: '22301323', name: 'Nabila Sultana', email: 'nabila@example.com', thesisId: 'P2510142' },
  { id: '21301005', name: 'Samiul Karim', email: 'samiul@example.com', thesisId: 'T2410138' },
  { id: '23301466', name: 'Afsana Kabir', email: 'afsana@example.com', thesisId: 'T2620202' },
  { id: '22301703', name: 'Tawhid Hossain', email: 'tawhid@example.com', thesisId: 'I26201305' },
];
export const groups: ThesisGroup[] = [
  { id: 'T2530123', title: 'Privacy-Preserving Data Analytics in Distributed Systems', type: 'Thesis', stage: 'Final Thesis', primarySupervisor: 'Dr. Ayesha Karim', primarySupervisorInitial: 'AK', secondarySupervisor: 'Dr. Asif Rahman', secondarySupervisorInitial: 'AR', members: ['22101234', '22104567'] },
  { id: 'P2430184', title: 'Intelligent Healthcare Monitoring', type: 'Project', stage: 'Pre-Thesis 2', primarySupervisor: 'Dr. Ayesha Karim', primarySupervisorInitial: 'AK', members: ['21201456'] },
  { id: 'T2330108', title: 'Secure Edge Computing', type: 'Thesis', stage: 'Completed', primarySupervisor: 'Dr. Ayesha Karim', primarySupervisorInitial: 'AK', members: ['20301892'] },
  { id: 'T2610176', title: 'Efficient Image Recognition Systems', type: 'Thesis', stage: 'Pre-Thesis 1', primarySupervisor: 'Dr. Ayesha Karim', primarySupervisorInitial: 'AK', members: ['22301678', '22201011'] },
  { id: 'T2510091', title: 'Resource-Aware Natural Language Processing', type: 'Thesis', stage: 'Final Thesis', primarySupervisor: 'Dr. Sameer Nabil', primarySupervisorInitial: 'SN', members: ['23201031', '23201752'] },
  { id: 'P2510142', title: 'Smart Campus Energy Monitoring', type: 'Project', stage: 'Pre-Thesis 2', primarySupervisor: 'Ms. Nadia Hossain', primarySupervisorInitial: 'NH', members: ['22301114', '22301323'] },
  { id: 'T2410138', title: 'Explainable Network Intrusion Detection', type: 'Thesis', stage: 'Completed', primarySupervisor: 'Dr. Asif Rahman', primarySupervisorInitial: 'AR', members: ['21301005'] },
  { id: 'T2620202', title: 'Robust Federated Model Aggregation', type: 'Thesis', stage: 'Pre-Thesis 1', primarySupervisor: 'Ms. Nadia Hossain', primarySupervisorInitial: 'NH', members: ['23301466'] },
  { id: 'I26201305', title: 'Applied Software Engineering in Enterprise Systems', type: 'Internship', stage: 'Pre-Thesis 1', primarySupervisor: 'Mr. Mahir Islam', primarySupervisorInitial: 'MI', members: ['22301703'] },
];
export const evaluations: Evaluation[] = [
  { id: 'ev1', studentId: '22101234', phase: 'P1', semester: 'Spring 2025', score: 4.5, maxScore: 5, comment: 'The research problem is clearly defined. Expand the literature review with more recent studies and clarify the motivation for the proposed approach.', evaluator: 'P1 Evaluation Panel', publication: 'published' },
  { id: 'ev2', studentId: '22101234', phase: 'P2', semester: 'Summer 2026', score: 8.5, maxScore: 10, comment: 'The methodology is promising. Include stronger experimental validation, explain the dataset selection, and refine the evaluation metrics.', evaluator: 'P2 Evaluation Panel', publication: 'published' },
  { id: 'ev3', studentId: '22101234', phase: 'Defense', semester: 'Fall 2026', score: null, maxScore: 30, comment: null, evaluator: 'Final Defense Panel', publication: 'pending' },
  { id: 'ev4', studentId: '22101234', phase: 'Supervisor', semester: 'Fall 2026', score: null, maxScore: 55, comment: null, evaluator: 'Primary Supervisor', publication: 'pending' },
];
export const semesterSources: SemesterSource[] = [
  { semester: 'Spring 2025', status: 'Source needed', description: 'Historical panel manager link not supplied', phases: ['P1'] },
  { semester: 'Summer 2026', status: 'Schema verified', description: 'Panel manager + evaluator sheets inspected', phases: ['P1', 'P2', 'Defense'] },
  { semester: 'Fall 2026', status: 'Source needed', description: 'Future defense source not yet registered', phases: ['Defense'] },
];
export const PHASE_NAMES: Record<Phase, string> = { P1: 'Pre-Thesis 1', P2: 'Pre-Thesis 2', Defense: 'Final Defense', Supervisor: 'Supervisor Evaluation' };

export function visibleEvaluation(item: Evaluation): Evaluation {
  // Academic marks and indexed comments are independent fields. A verified
  // student can see either as soon as that field exists in their own record.
  return item;
}
