export type ProjectExecutionStatus =
  | 'IDLE'
  | 'PLANNING'
  | 'EXECUTING_MISSIONS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ProjectExecutionContext {
  projectId: string;
  goal: string;
  context?: Record<string, any>;
}

export interface ProjectExecutionState {
  projectId: string;
  goal: string;
  status: ProjectExecutionStatus;
  missionPlan?: any;
  executionPlans: Record<string, any>;
  executionResults: Record<string, any>;
  startTime: string;
  endTime?: string;
}

export interface ProjectExecutionResult {
  success: boolean;
  state: ProjectExecutionState;
  summary: string;
  reports: Record<string, any>;
  error?: string;
}
