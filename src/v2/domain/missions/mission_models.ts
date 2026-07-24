import { CapabilityType } from '../../contracts/iplugin_framework';

export type MissionStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'PAUSED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED'
  | 'ARCHIVED';

export type TaskStatus =
  | 'BACKLOG'
  | 'READY'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED';

export interface Mission {
  id: string;
  title: string;
  goal: string;
  status: MissionStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Epic {
  id: string;
  missionId: string;
  title: string;
  description: string;
}

export interface Feature {
  id: string;
  epicId: string;
  title: string;
  description: string;
}

export interface Task {
  id: string;
  missionId: string;
  featureId?: string;
  title: string;
  objective: string;
  targetFiles: string[];
  requiredCapabilities: CapabilityType[];
  priority: 'P0' | 'P1' | 'P2';
  status: TaskStatus;
  assignedWorkerId?: string;
  dependsOnTaskIds: string[];
  retryCount: number;
}

export interface SubTask {
  id: string;
  parentTaskId: string;
  title: string;
  targetFile: string;
  status: TaskStatus;
}

export interface TaskDependency {
  taskId: string;
  dependsOnTaskId: string;
}

export interface ExecutionBatch {
  batchNumber: number;
  taskIds: string[];
}
