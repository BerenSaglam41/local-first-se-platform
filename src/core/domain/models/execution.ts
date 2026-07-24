export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'ERROR';
export type PatchStatus = 'applied' | 'failed' | 'skipped' | 'none';
export type ValidationStatus = 'passed' | 'failed' | 'skipped';
export type VerificationStatus = 'passed' | 'failed' | 'skipped';

export interface SubTask {
  id: string;
  targetFile: string;
  objective: string;
  dependencies: string[];
  validationCriteria: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
}

export interface TaskPlan {
  taskId: string;
  originalPrompt: string;
  subTasks: SubTask[];
}

export interface ExecutionSpecification {
  id: string;
  taskId: string;
  objective: string;
  allowedTargetFiles: string[];
  forbiddenFiles: string[];
  expectedFormat: string;
  verificationExpectations: string[];
}

export interface EngineeringTask {
  id: string;
  description: string;
  entryFile: string;
  workspaceFiles: string[];
  workspaceRoot?: string;
  verificationCommands?: string[];
  plan?: TaskPlan;
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
  modifiedFiles: string[];
  filesSkipped: string[];
  parserWarnings: string[];
  patchStatus: PatchStatus;
  validationStatus: ValidationStatus;
  validationErrors: string[];
  validationWarnings: string[];
  parserConfidence: number;
  verificationStatus: VerificationStatus;
  verificationSteps: string[];
  verificationLogs: string;
  buildPassed: boolean;
  testsPassed: boolean;
  verificationDuration: number;
  retryCount: number;
  retryHistory: string[];
  finalVerificationResult: string;
  finalProviderResponse: string;
}

export interface StageProgress {
  stage: string;
  status: 'started' | 'completed' | 'failed';
  durationMs?: number;
  metrics?: Record<string, any>;
  error?: string;
  exceptionStack?: string;
  recoveryAction?: string;
}

export type StageProgressCallback = (progress: StageProgress) => void;


