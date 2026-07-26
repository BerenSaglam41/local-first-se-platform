export type MissionExecutionStatus =
  | 'IDLE'
  | 'EXECUTING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface MissionExecutionPolicy {
  maxParallelWorkers: number;
  maxTaskRetries: number;
  timeoutMs: number;
  autoRetryOnFailure: boolean;
  workspacePath?: string;
  projectId?: string;
  contextPackage?: Record<string, any>;
  cliProfilePath?: string;
}

export interface MissionExecutionState {
  missionId: string;
  planId: string;
  status: MissionExecutionStatus;
  completedTaskIds: string[];
  failedTaskIds: string[];
  runningTaskIds: string[];
  pendingTaskIds: string[];
  startTime: string;
  endTime?: string;
}

export interface MissionExecutionResult {
  success: boolean;
  state: MissionExecutionState;
  reports: Record<string, any>; // taskId -> ExecutionReport
  error?: string;
}
