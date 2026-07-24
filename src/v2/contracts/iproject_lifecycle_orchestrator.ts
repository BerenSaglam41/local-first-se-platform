export type ProjectExecutionStatus =
  | 'IDLE'
  | 'PLANNING'
  | 'EXECUTING_MISSIONS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ProjectExecutionContext {
  projectId: string;
  goal: string;
  context?: Record<string, any>;
}

export interface ProjectConversationTurn {
  turnId: string;
  goal: string;
  timestamp: string;
  summary: string;
}

export interface ProjectExecutionState {
  projectId: string;
  goal: string;
  status: ProjectExecutionStatus;
  missionPlan?: any;
  executionPlans: Record<string, any>;
  executionResults: Record<string, any>;
  startTime: string;
  endTime?: string;
  /** Persists across continueProject() calls — the ongoing engineering workspace this
   * conversation is building, never a fresh one per turn. */
  workspacePath?: string;
  /** Every turn this project has had, oldest first. A project that has only ever been created
   * once (never continued) still has exactly one entry here. */
  conversationHistory: ProjectConversationTurn[];
}

export interface ProjectExecutionResult {
  success: boolean;
  state: ProjectExecutionState;
  summary: string;
  reports: Record<string, any>;
  error?: string;
}
