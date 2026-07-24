export type ExecutionProfileName = 'Economy' | 'Balanced' | 'Performance' | 'Custom';

export type WorkerPolicyMode = 'SINGLE' | 'PAIR_PROGRAMMING' | 'MULTI_AGENT' | 'DEPARTMENT';

export type BudgetScope = 'MISSION' | 'TASK' | 'WORKER' | 'CONTEXT';

export type CacheInvalidationReason = 'FILE_CHANGE' | 'ADR_CHANGE' | 'MISSION_CHANGE' | 'MANUAL';

export interface ExecutionProfile {
  name: ExecutionProfileName;
  maxWorkers: number;
  maxContextSizeTokens: number;
  maxTokenBudget: number;
  reviewDepth: 'LIGHT' | 'STANDARD' | 'RIGOROUS';
  maxRetries: number;
  allowParallelExecution: boolean;
  workerPolicy: WorkerPolicyMode;
}

export interface EstimatedCostReport {
  missionId: string;
  promptTokens: number;
  completionTokens: number;
  estimatedRuntimeSec: number;
  expectedWorkerCount: number;
  estimatedCostUSD: number;
  expectedProviderCostUSD: number;
  expectedReviewCostUSD: number;
  expectedVerificationCostUSD: number;
  cacheSavingsUSD: number;
}

export interface BudgetEntry {
  scope: BudgetScope;
  scopeId: string;
  hardLimit: number;
  softLimit: number;
  currentUsage: number;
  warningThresholdPercent: number;
}

export interface BudgetConsumeResult {
  exceeded: boolean;
  warning: boolean;
  reduced: boolean;
  remaining: number;
  reductionAmount: number;
}

export interface MissionCostReport {
  missionId: string;
  estimatedTokens: number;
  actualTokens: number;
  estimatedCostUSD: number;
  actualCostUSD: number;
  cacheSavingsUSD: number;
  contextSavingsTokens: number;
  executionSavingsUSD: number;
  workerUtilizationPercent: number;
}
