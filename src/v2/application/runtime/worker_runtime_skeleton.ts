import { ExecutionCycleResult, IWorkerRuntime, ProcessMetrics } from '../../contracts/iworker_runtime';
import { ScheduledTask } from '../../contracts/ischeduler';

export class WorkerRuntimeSkeleton implements IWorkerRuntime {
  employeeId: string;
  pid: number = 0;
  state: 'UNSPAWNED' | 'SPAWNING' | 'RUNNING' | 'CRASHED' | 'DRAINING' = 'UNSPAWNED';

  constructor(employeeId: string) {
    this.employeeId = employeeId;
  }

  async spawn(): Promise<void> {
    this.state = 'RUNNING';
    this.pid = Math.floor(Math.random() * 9000) + 1000;
  }

  async executeTaskCycle(task: ScheduledTask, contextSlice: Record<string, any>): Promise<ExecutionCycleResult> {
    return {
      taskId: task.id,
      success: true,
      modifiedFiles: task.targetFiles,
      output: `Executed subtask ${task.id} for employee ${this.employeeId}`,
      durationMs: 10,
    };
  }

  async stop(signal?: string): Promise<void> {
    this.state = 'UNSPAWNED';
    this.pid = 0;
  }

  getMetrics(): ProcessMetrics {
    return {
      pid: this.pid,
      cpuPercent: 0.1,
      memoryMb: 45,
      uptimeSeconds: 120,
      tokensConsumed: 1500,
    };
  }
}
