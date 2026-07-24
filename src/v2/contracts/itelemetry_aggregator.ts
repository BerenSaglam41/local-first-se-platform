import { VerificationResult } from './iverification_pipeline';
import { DomainEvent } from './ievent_store';

export interface TelemetryTaskNode {
  id: string;
  title: string;
  description: string;
  requiredCapability: string;
  priority: string;
  status: string;
  dependencies: string[];
}

export interface TelemetryRuntimeProviderInfo {
  id: string;
  name: string;
  version: string;
  installed: boolean;
  active: boolean;
}

export interface TelemetryWorkerInfo {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  status: 'IDLE' | 'BUSY' | 'EXECUTING' | 'REASONING';
  currentTaskId?: string;
  currentTaskTitle?: string;
  runtimeProvider: string;
  durationMs: number;
}

export interface TelemetryAiSessionInfo {
  sessionId: string;
  workerId: string;
  workerName: string;
  providerName: string;
  prompt: string;
  streamingOutput: string[];
  finalResponse?: string;
  toolCalls?: Array<{ toolName: string; durationMs: number; status: string }>;
  durationMs: number;
  tokenUsage?: number;
  workspacePath: string;
  status: 'IDLE' | 'STREAMING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
}

export interface TelemetrySnapshot {
  timestamp: string;
  projectId?: string;
  businessGoal?: string;
  projectStatus: 'IDLE' | 'PLANNING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  currentStage: string;
  progressPercent: number;
  estimatedCompletionMinutes: number;

  runtimeProviders: TelemetryRuntimeProviderInfo[];
  activeRuntimeProviderId: string;

  tasks: TelemetryTaskNode[];
  workers: TelemetryWorkerInfo[];
  aiSessions: TelemetryAiSessionInfo[];
  verification?: VerificationResult;
  recentEvents: DomainEvent[];
  systemConsoleLogs: Array<{ id: string; timestamp: string; level: string; message: string }>;

  metrics: {
    kernelStatus: 'ONLINE' | 'OFFLINE';
    totalWorkersCount: number;
    runningTasksCount: number;
    queuedTasksCount: number;
    memoryUsageMB: number;
    cpuLoadPercent: number;
  };
}

export interface ITelemetryAggregator {
  getSnapshot(): TelemetrySnapshot;
  setActiveRuntimeProvider(providerId: string): void;
  recordEvent(event: DomainEvent): void;
  logMessage(level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string): void;
}
