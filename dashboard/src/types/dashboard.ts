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

export interface DashboardAiSession {
  sessionId: string;
  workerId: string;
  workerName: string;
  providerName: string;
  prompt: string;
  streamingOutput: string[];
  finalResponse?: string;
  durationMs: number;
  tokenUsage?: number;
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

export interface DashboardArtifact {
  artifactId: string;
  type: 'CREATED_FILE' | 'MODIFIED_FILE' | 'EXECUTION_LOG' | 'REASONING_SUMMARY';
  path: string;
  sizeBytes: number;
  createdAt: string;
  contentSnippet?: string;
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

export interface DashboardState {
  projectId: string;
  businessGoal: string;
  projectStatus: 'IDLE' | 'PLANNING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  progressPercent: number;
  tasks: DashboardTaskNode[];
  workers: DashboardWorker[];
  aiSessions: DashboardAiSession[];
  eventStream: DashboardDomainEvent[];
  artifacts: DashboardArtifact[];
  verification: DashboardVerificationStatus;
}
