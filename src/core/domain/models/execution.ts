export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'ERROR';

export interface EngineeringTask {
  id: string;
  description: string;
  entryFile: string;
  workspaceFiles: string[];
}

export interface ExecutionRequest {
  task: EngineeringTask;
}

export interface ExecutionResult {
  taskId: string;
  status: ExecutionStatus;
  output: string;
  error?: string;
  durationMs: number;
}
