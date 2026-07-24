export interface ReasoningContext {
  filePaths?: string[];
  symbolDefinitions?: string[];
  previousADRs?: string[];
  constraints?: string[];
}

export interface ReasoningRequest {
  requestId: string;
  missionId: string;
  workerId: string;
  goal: string;
  context?: ReasoningContext;
  priority?: 'P0' | 'P1' | 'P2';
  budgetTokens?: number;
  timeoutMs?: number;
  streaming?: boolean;
}

export interface ReasoningExecutionMetadata {
  pluginId: string;
  sessionId: string;
  durationMs: number;
  tokenUsage?: number;
}

export interface ReasoningResponse {
  requestId: string;
  responseText: string;
  structuredOutput?: Record<string, any>;
  executionMetadata: ReasoningExecutionMetadata;
  warnings: string[];
  errors: string[];
}

export interface ReasoningResult {
  success: boolean;
  response?: ReasoningResponse;
  error?: string;
}

export type ReasoningStrategy = 'SINGLE_PLUGIN' | 'FALLBACK_CHAIN' | 'PARALLEL_ENSEMBLE';

export interface ReasoningPolicy {
  maxTimeoutMs: number;
  maxConcurrentRequests: number;
  retryCount: number;
  backoffMs: number;
}
