import { WorkerExecutionRequest, WorkerExecutionResult } from '../../contracts/iautonomous_worker';

export type WorkerTaskExecutor = (request: WorkerExecutionRequest) => Promise<WorkerExecutionResult>;

/**
 * Runtime boundary for one engineer. A runtime owns the serialized conversation lane for a
 * worker, so provider sessions, profile directories, and workspace mutations cannot be crossed
 * by concurrent prompts. It is deliberately independent of any vendor CLI.
 */
export class WorkerRuntime {
  private tail: Promise<WorkerExecutionResult> = Promise.resolve({ success: true });
  private queued = 0;
  private active = false;

  constructor(readonly workerId: string, private executor: WorkerTaskExecutor) {}

  enqueue(request: WorkerExecutionRequest): Promise<WorkerExecutionResult> {
    this.queued++;
    const run = this.tail
      .catch(() => ({ success: false, error: 'Previous worker execution failed' }))
      .then(async () => {
        this.queued--;
        this.active = true;
        try {
          return await this.executor(request);
        } finally {
          this.active = false;
        }
      });
    this.tail = run;
    return run;
  }

  isBusy(): boolean {
    return this.active || this.queued > 0;
  }

  queueDepth(): number {
    return this.queued;
  }
}
