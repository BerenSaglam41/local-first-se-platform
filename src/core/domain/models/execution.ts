export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'ERROR';
export type PatchStatus = 'applied' | 'failed' | 'skipped' | 'none';
export type ValidationStatus = 'passed' | 'failed' | 'skipped';
export type VerificationStatus = 'passed' | 'failed' | 'skipped';

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
}
