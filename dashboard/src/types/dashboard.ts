export type TaskExecutionStatus = 'PENDING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'BLOCKED';

export interface DashboardTaskNode {
  id: string;
  missionId: string;
  title: string;
  description: string;
  requiredCapability: string;
  priority: 'P0' | 'P1' | 'P2' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: TaskExecutionStatus;
  dependencies: string[];
  assignedDepartmentId?: string;
  assignedWorkerId?: string;
  estimatedComplexity: number;
}

export interface DashboardWorker {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  departmentName: string;
  status: 'IDLE' | 'BUSY' | 'EXECUTING' | 'REASONING';
  currentTaskId?: string;
  currentTaskTitle?: string;
  runtimeProvider: string;
  currentWorkspace: string;
  durationMs: number;
}

export interface DashboardToolCall {
  toolName: string;
  arguments: Record<string, any>;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED';
}

export interface DashboardAiSession {
  sessionId: string;
  workerId: string;
  workerName: string;
  providerName: string;
  prompt: string;
  streamingOutput: string[];
  finalResponse?: string;
  toolCalls?: DashboardToolCall[];
  durationMs: number;
  tokenUsage?: number;
  workspacePath: string;
  status: 'IDLE' | 'STREAMING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
}

export interface DashboardDomainEvent {
  eventId: string;
  aggregateId: string;
  eventType: string;
  timestamp: string;
  actorId: string;
  payload: any;
}

export interface GitFileChange {
  path: string;
  status: 'CREATED' | 'MODIFIED' | 'DELETED';
  additions: number;
  deletions: number;
  fileSizeBytes: number;
  diffSnippet?: string;
}

export interface DashboardVerificationStep {
  name: string;
  category: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export interface DashboardVerificationStatus {
  status: 'PASSED' | 'FAILED' | 'RUNNING' | 'IDLE';
  qualityScore: number; // 0 - 100
  passedStepsCount: number;
  totalStepsCount: number;
  steps: DashboardVerificationStep[];
  errors: string[];
}

export interface SystemTerminalLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}

export interface DashboardState {
  projectId: string;
  businessGoal: string;
  projectStatus: 'IDLE' | 'PLANNING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  currentStage: string;
  estimatedCompletionMinutes: number;
  progressPercent: number;
  tasks: DashboardTaskNode[];
  workers: DashboardWorker[];
  aiSessions: DashboardAiSession[];
  eventStream: DashboardDomainEvent[];
  fileChanges: GitFileChange[];
  verification: DashboardVerificationStatus;
  systemConsoleLogs: SystemTerminalLog[];
  systemHealth: {
    kernelStatus: 'ONLINE' | 'OFFLINE';
    runtimeProvider: string;
    totalWorkersCount: number;
    runningTasksCount: number;
    queuedTasksCount: number;
    memoryUsageMB: number;
    cpuLoadPercent: number;
  };
}
