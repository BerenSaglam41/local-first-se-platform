import { IWorkerDispatcher } from '../../contracts/iworker_dispatcher';
import { WorkerExecutionRequest, WorkerExecutionResult } from '../../contracts/iautonomous_worker';
import { WorkerExecutionEngine } from '../worker/worker_execution_engine';

export class DefaultWorkerDispatcher implements IWorkerDispatcher {
  /** One resumable CLI conversation must never receive two prompts at once. */
  private workerTails = new Map<string, Promise<WorkerExecutionResult>>();

  constructor(private workerExecutionEngine: WorkerExecutionEngine) {}

  async dispatchWorkerTask(request: WorkerExecutionRequest): Promise<WorkerExecutionResult> {
    const previous = this.workerTails.get(request.workerId) || Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => this.workerExecutionEngine.executeTask(request));
    this.workerTails.set(request.workerId, current);
    try {
      return await current;
    } finally {
      if (this.workerTails.get(request.workerId) === current) this.workerTails.delete(request.workerId);
    }
  }
}
