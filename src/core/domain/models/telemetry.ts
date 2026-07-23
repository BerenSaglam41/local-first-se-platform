export interface ExecutionRecord {
  id: string; // Trace / Correlation ID
  projectId: string;
  workflowId: string;
  taskId: string;
  agentId: string;
  providerId: string;
  status: string;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  retryCount: number;
}

export interface TokenMetrics {
  id: string;
  executionId: string; // Foreign key to ExecutionRecord
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  realInputTokens?: number;
  realOutputTokens?: number;
  estimatedCost: number;
}

export interface ResourceMetrics {
  id: string;
  executionId: string; // Foreign key to ExecutionRecord
  cpuUsagePercent: number;
  ramUsageBytes: number;
  filesReadCount: number;
  filesWrittenCount: number;
  toolCallsCount: number;
  contextSizeTokens: number;
}

export interface TelemetryData {
  execution: ExecutionRecord;
  tokens: TokenMetrics;
  resources: ResourceMetrics;
}
