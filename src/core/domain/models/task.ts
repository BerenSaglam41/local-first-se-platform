export type TaskStatus = 'PENDING' | 'READY' | 'RUNNING' | 'APPROVAL_REQUIRED' | 'COMPLETED' | 'FAILED' | 'REJECTED';

export interface Task {
  id: string;
  projectId: string;
  workflowId: string;
  title: string;
  description: string;
  assignedAgentId?: string;
  status: TaskStatus;
  dependencies: string[]; // Task IDs that must be completed first
  createdAt: Date;
  updatedAt: Date;
}
