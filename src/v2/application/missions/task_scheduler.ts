import { IWorkerDispatcher } from '../../contracts/iworker_dispatcher';
import { MissionTask } from '../../contracts/imission_decomposition';
import { WorkerExecutionRequest, WorkerExecutionResult } from '../../contracts/iautonomous_worker';
import { MissionExecutionPolicy } from '../../contracts/imission_execution_orchestrator';

export class TaskScheduler {
  constructor(private dispatcher: IWorkerDispatcher) {}

  async scheduleTask(
    task: MissionTask,
    missionId: string,
    policy: MissionExecutionPolicy
  ): Promise<WorkerExecutionResult> {
    const request: WorkerExecutionRequest = {
      executionId: `exec-${task.id}-${Date.now()}`,
      taskId: task.id,
      missionId,
      workerId: task.assignedWorkerId || 'emp-bob',
      departmentId: task.assignedDepartmentId || 'dept-backend',
      goal: task.description || task.title,
      policy: {
        maxDurationMs: policy.timeoutMs,
      },
    };

    task.status = 'RUNNING';
    return await this.dispatcher.dispatchWorkerTask(request);
  }
}
