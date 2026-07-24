import { IWorkerDispatcher } from '../../contracts/iworker_dispatcher';
import { WorkerExecutionRequest, WorkerExecutionResult } from '../../contracts/iautonomous_worker';
import { WorkerExecutionEngine } from '../worker/worker_execution_engine';

export class DefaultWorkerDispatcher implements IWorkerDispatcher {
  constructor(private workerExecutionEngine: WorkerExecutionEngine) {}

  async dispatchWorkerTask(request: WorkerExecutionRequest): Promise<WorkerExecutionResult> {
    return await this.workerExecutionEngine.executeTask(request);
  }
}
