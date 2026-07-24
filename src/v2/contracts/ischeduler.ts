export interface ScheduledTask {
  id: string;
  missionId: string;
  title: string;
  objective: string;
  targetFiles: string[];
  ownerEmployeeId?: string;
  priority: 'P0' | 'P1' | 'P2';
  dependsOnTaskIds: string[];
  status: 'BACKLOG' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
}

export interface QueueMetrics {
  totalPending: number;
  totalRunning: number;
  totalCompleted: number;
  totalFailed: number;
}

export interface IScheduler {
  enqueueTask(task: ScheduledTask): Promise<void>;
  getNextTaskForWorker(employeeId: string, capabilities: string[]): Promise<ScheduledTask | null>;
  markTaskComplete(taskId: string, resultData: Record<string, any>): Promise<void>;
  markTaskFailed(taskId: string, error: string): Promise<void>;
  getQueueMetrics(): QueueMetrics;
}
