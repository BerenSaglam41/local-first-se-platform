export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TaskStatus =
  | 'PENDING'
  | 'READY'
  | 'ASSIGNED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED';

export interface TaskDependency {
  taskId: string;
  dependsOnTaskId: string;
  dependencyType?: 'HARD' | 'SOFT';
}

export interface MissionTask {
  id: string;
  missionId: string;
  title: string;
  description: string;
  requiredCapability: string;
  priority: TaskPriority;
  status: TaskStatus;
  dependencies: string[];
  assignedDepartmentId?: string;
  assignedWorkerId?: string;
  estimatedComplexity: number;
}

export type AssignmentStrategy = 'RULE_BASED' | 'CAPABILITY_WORKLOAD' | 'BALANCED';

export interface AssignmentPolicy {
  strategy: AssignmentStrategy;
  maxWorkloadPerWorker: number;
}

export interface MissionExecutionPlan {
  planId: string;
  missionId: string;
  goal: string;
  tasks: MissionTask[];
  dependencies: TaskDependency[];
  executionBatches: string[][]; // Topological execution batches
  departmentAssignments: Record<string, string[]>; // departmentId -> taskIds
  workerAssignments: Record<string, string[]>; // workerId -> taskIds
  totalEstimatedComplexity: number;
  /** Shared workspace for every task in this mission. */
  workspacePath?: string;
  projectId?: string;
}
