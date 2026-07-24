import { EventEmitter } from 'events';
import { TransportType } from './iruntime_transport';

export type SessionState =
  | 'Idle'
  | 'Starting'
  | 'Ready'
  | 'Busy'
  | 'Waiting'
  | 'Stopping'
  | 'Stopped'
  | 'Failed'
  | 'Recovering';

export type HealthState = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

export interface RuntimeHealthStatus {
  status: HealthState;
  cpuPercent: number;
  memoryMb: number;
  errorCount: number;
  uptimeSec: number;
  lastHeartbeat: string;
}

export interface SessionMetadata {
  sessionId: string;
  workerId: string;
  pluginId: string;
  transportType: TransportType;
  state: SessionState;
  createdAt: string;
  lastActivityAt: string;
  missionCount: number;
  healthStatus: RuntimeHealthStatus;
}

export interface SessionStreamOptions {
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  timeoutMs?: number;
  cancellationSignal?: AbortSignal;
}

export interface SessionStreamResult {
  completed: boolean;
  cancelled: boolean;
  output: string;
  errorOutput: string;
  exitCode?: number;
  durationMs: number;
}

export interface IRuntimeSession extends EventEmitter {
  readonly sessionId: string;
  readonly workerId: string;
  readonly pluginId: string;
  readonly metadata: SessionMetadata;

  getState(): SessionState;
  write(input: string): boolean;
  executeStream(input: string, options?: SessionStreamOptions): Promise<SessionStreamResult>;
  cancelStream(): void;
  pause(): boolean;
  resume(): boolean;
  close(): void;
  touchActivity(): void;
}
