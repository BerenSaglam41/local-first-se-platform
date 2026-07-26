import { IWorkerDispatcher } from '../../contracts/iworker_dispatcher';
import { WorkerExecutionRequest, WorkerExecutionResult } from '../../contracts/iautonomous_worker';
import { WorkerExecutionEngine } from '../worker/worker_execution_engine';
import { WorkerRuntime } from '../worker/worker_runtime';

export class DefaultWorkerDispatcher implements IWorkerDispatcher {
  private runtimes = new Map<string, WorkerRuntime>();

  constructor(private workerExecutionEngine: WorkerExecutionEngine) {}

  async dispatchWorkerTask(request: WorkerExecutionRequest): Promise<WorkerExecutionResult> {
    const runtime = this.getRuntime(request.workerId);
    return runtime.enqueue(request);
  }

  getRuntime(workerId: string): WorkerRuntime {
    let runtime = this.runtimes.get(workerId);
    if (!runtime) {
      runtime = new WorkerRuntime(workerId, (request) => this.workerExecutionEngine.executeTask(request));
      this.runtimes.set(workerId, runtime);
    }
    return runtime;
  }

  listRuntimes(): WorkerRuntime[] {
    return Array.from(this.runtimes.values());
  }
}
