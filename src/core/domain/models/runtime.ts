export enum ExecutionState {
  CREATED = 'CREATED',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  STOPPING = 'STOPPING',
  FINISHED = 'FINISHED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT',
}

export interface ProcessMetrics {
  pid?: number;
  startTime: number; // timestamp
  endTime?: number;  // timestamp
  durationMs?: number;
  exitCode?: number | null;
  signal?: string | null;
  peakMemoryBytes?: number; // optional, platforms differ
}

export interface ExecutionOptions {
  executable: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ExecutionResult {
  state: ExecutionState;
  exitCode: number | null;
  signal: string | null;
  metrics: ProcessMetrics;
  error?: Error;
}
