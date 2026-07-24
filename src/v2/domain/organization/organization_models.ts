export type DepartmentType =
  | 'Backend'
  | 'Frontend'
  | 'QA'
  | 'DevOps'
  | 'Architecture'
  | 'Documentation'
  | 'Research';

export interface DepartmentMember {
  workerId: string;
  name: string;
  role: string;
  isLead: boolean;
  activeTasksCount: number;
}

export interface Department {
  id: string;
  name: string;
  type: DepartmentType;
  leadId: string;
  members: DepartmentMember[];
  createdAt: string;
}

export interface DepartmentMetrics {
  departmentId: string;
  completedTasksCount: number;
  avgReviewTimeMs: number;
  failureRatePercent: number;
  workerUtilizationPercent: number;
  throughputPerDay: number;
  missionCompletionRatePercent: number;
}
