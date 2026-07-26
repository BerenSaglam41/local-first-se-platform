export interface ReasoningContext {
  /** Working directory passed to a CLI-backed provider. */
  workspacePath?: string;
  filePaths?: string[];
  symbolDefinitions?: string[];
  previousADRs?: string[];
  constraints?: string[];
  /** Plugins that support real multi-turn memory (verified: the actual claude CLI's
   * --session-id/--resume, even in non-interactive --print mode) use this for genuine model-
   * level continuity across a project's conversation turns, not just prompt-stuffed history. */
  conversationSessionId?: string;
  resumeConversation?: boolean;
  /** Environment inherited by the provider CLI for this worker's local account/profile. */
  environment?: Record<string, string>;
}

export interface ReasoningRequest {
  requestId: string;
  /** Real task id, when this request is on behalf of a specific mission task (as opposed to
   * ad-hoc planning reasoning, which has none). */
  taskId?: string;
  missionId: string;
  workerId: string;
  goal: string;
  context?: ReasoningContext;
  priority?: 'P0' | 'P1' | 'P2';
  budgetTokens?: number;
  timeoutMs?: number;
}

export interface ReasoningExecutionMetadata {
  pluginId: string;
  workerId: string;
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
