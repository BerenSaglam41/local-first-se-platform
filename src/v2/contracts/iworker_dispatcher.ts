import { WorkerExecutionRequest, WorkerExecutionResult } from './iautonomous_worker';

export interface IWorkerDispatcher {
  /**
   * Dispatches a worker execution request to the appropriate execution backend.
   */
  dispatchWorkerTask(request: WorkerExecutionRequest): Promise<WorkerExecutionResult>;
}
