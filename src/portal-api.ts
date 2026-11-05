import { evaluations, groups, semesterSources, students, type Evaluation, type SemesterSource, type Student, type ThesisGroup, visibleEvaluation } from './data';

export interface StudentDashboard {
  student: Student;
  group: ThesisGroup;
  evaluations: Evaluation[];
}
export interface SupervisorDashboard {
  supervisorEmail: string;
  students: Array<Student & { progress?: { p1: boolean; p2: boolean; defense: boolean } }>;
  groups: ThesisGroup[];
}
export interface PortalApi {
  studentDashboard(): Promise<StudentDashboard>;
  supervisorDashboard(): Promise<SupervisorDashboard>;
  semesterRegistry(): Promise<SemesterSource[]>;
}

// The real implementation must obtain the user's identity from a backend-verified
// Google session, never from a student ID or role supplied by the browser.
// Every backend endpoint must enforce its own student/group/administrator scope.
export const demoApi: PortalApi = {
  async studentDashboard() {
    return { student: students[0], group: groups[0], evaluations: evaluations.map(visibleEvaluation) };
  },
  async supervisorDashboard() {
    return { supervisorEmail: 'demo.supervisor@example.com', students, groups };
  },
  async semesterRegistry() {
    return semesterSources;
  },
};
