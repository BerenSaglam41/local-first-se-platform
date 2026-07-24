export type ExecutionStatus =
  | 'PENDING'
  | 'PREPARING_CONTEXT'
  | 'REASONING'
  | 'PLANNING_MUTATIONS'
  | 'EXECUTING_MUTATIONS'
  | 'COLLECTING_ARTIFACTS'
  | 'COMPLETED'
  | 'FAILED';

export interface ExecutionPolicy {
  maxDurationMs?: number;
  allowFileCreation?: boolean;
  allowFileModification?: boolean;
  autoVerify?: boolean;
  budgetTokens?: number;
}

export interface WorkerExecutionRequest {
  executionId: string;
  taskId: string;
  missionId: string;
  workerId: string;
  departmentId?: string;
  goal: string;
  contextPackage?: Record<string, any>;
  policy?: ExecutionPolicy;
}

export interface FileMutationSpec {
  relativePath: string;
  content: string;
}

export interface ExecutionPlan {
  planId: string;
  taskId: string;
  workspacePath: string;
  filesToCreate: FileMutationSpec[];
  filesToModify: FileMutationSpec[];
  summary: string;
}

export type ArtifactType = 'CREATED_FILE' | 'MODIFIED_FILE' | 'EXECUTION_LOG' | 'REASONING_SUMMARY';

export interface ExecutionArtifact {
  artifactId: string;
  type: ArtifactType;
  path: string;
  content: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ExecutionReport {
  executionId: string;
  taskId: string;
  workerId: string;
  status: ExecutionStatus;
  summary: string;
  recommendations: string[];
  artifacts: ExecutionArtifact[];
  durationMs: number;
  filesCreated: string[];
  filesModified: string[];
  reasoningResponse?: any;
  /** The real isolated workspace this task actually ran in — lets downstream consumers (e.g.
   * ProjectLifecycleOrchestrator materializing final project output) correctly re-root each
   * artifact's absolute path into a relative one, instead of guessing from string patterns. */
  workspacePath?: string;
}

export interface WorkerExecutionResult {
  success: boolean;
  report?: ExecutionReport;
  error?: string;
}
