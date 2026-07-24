export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'ERROR';
export type PatchStatus = 'applied' | 'failed' | 'skipped' | 'none';
export type ValidationStatus = 'passed' | 'failed' | 'skipped';
export type VerificationStatus = 'passed' | 'failed' | 'skipped';

/**
 * Canonical status literals for SubTask lifecycle.
 * Always use UPPERCASE. Never use lowercase alternatives.
 */
export type SubTaskStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

/**
 * How a target file was selected by the TaskPlanner.
 * Used for observability and debugging.
 */
export type TargetSelectionBasis =
  | 'EXPLICIT_PATH'       // User explicitly named the file path in the prompt
  | 'SEMANTIC_INTENT'     // Inferred from semantic intent (e.g. "create Calculator class" → src/calculator.ts)
  | 'EXISTING_SOURCE'     // Best match from existing workspace source files
  | 'FALLBACK';           // Last-resort default (src/main.ts or equivalent)

export interface SubTask {
  id: string;
  targetFile: string;
  objective: string;
  dependencies: string[];
  validationCriteria: string;
  status?: SubTaskStatus;
  /** Human-readable explanation of why this file was selected as the target. */
  selectionReason?: string;
  /** Machine-readable basis for target selection. */
  selectionBasis?: TargetSelectionBasis;
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

/**
 * Per-sub-task lifecycle result. Recorded by TaskExecutionService for every
 * planned sub-task that was dispatched (regardless of success/failure).
 */
export interface SubTaskResult {
  subTaskId: string;
  targetFile: string;
  objective: string;
  status: SubTaskStatus;
  startTime: number;
  endTime: number;
  durationMs: number;
  retryCount: number;
  providerResponseLength: number;
  parserConfidence: number;
  verificationPassed: boolean;
  gitCommitHash?: string;
  error?: string;
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
  /** Results for every dispatched sub-task in order. */
  subTaskResults: SubTaskResult[];
  /** Total sub-tasks planned (0 for single-task execution). */
  totalSubTasks: number;
  /** Number of sub-tasks that reached SUCCESS. */
  completedSubTasks: number;
  /** Number of sub-tasks that reached FAILED. */
  failedSubTasks: number;
  /** Number of sub-tasks that were SKIPPED (after a failure). */
  skippedSubTasks: number;
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
