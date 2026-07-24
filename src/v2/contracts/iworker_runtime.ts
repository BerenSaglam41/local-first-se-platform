import { ScheduledTask } from './ischeduler';

export interface ProcessMetrics {
  pid: number;
  cpuPercent: number;
  memoryMb: number;
  uptimeSeconds: number;
  tokensConsumed: number;
}

export interface ExecutionCycleResult {
  taskId: string;
  success: boolean;
  modifiedFiles: string[];
  output: string;
  error?: string;
  durationMs: number;
}

export interface IWorkerRuntime {
  employeeId: string;
  pid: number;
  state: 'UNSPAWNED' | 'SPAWNING' | 'RUNNING' | 'CRASHED' | 'DRAINING';
  spawn(): Promise<void>;
  executeTaskCycle(task: ScheduledTask, contextSlice: Record<string, any>): Promise<ExecutionCycleResult>;
  stop(signal?: string): Promise<void>;
  getMetrics(): ProcessMetrics;
}
