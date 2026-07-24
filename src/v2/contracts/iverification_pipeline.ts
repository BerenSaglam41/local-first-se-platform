import { VerificationStepResult, IVerificationStep } from './iverification_step';

export type VerificationStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PASSED'
  | 'FAILED'
  | 'SKIPPED';

export interface VerificationPolicy {
  requireBuild: boolean;
  requireTypeCheck: boolean;
  requireTests: boolean;
  requireLint: boolean;
  minQualityScore: number; // 0 - 100
  timeoutMs: number;
}

export interface VerificationContext {
  taskId: string;
  missionId?: string;
  projectId?: string;
  workspacePath: string;
  artifacts?: any[];
}

export interface VerificationPlan {
  planId: string;
  steps: IVerificationStep[];
}

export interface VerificationResult {
  success: boolean;
  status: VerificationStatus;
  taskId: string;
  workspacePath: string;
  stepResults: VerificationStepResult[];
  qualityScore: number; // 0 - 100
  errors: string[];
  warnings: string[];
  durationMs: number;
}
