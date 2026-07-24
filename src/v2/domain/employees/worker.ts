import { DepartmentType } from '../organization/organization_models';

/**
 * Real, OS-process-level health of the worker's supervised process — mutated only by
 * LocalProcessSupervisor, which owns the actual spawn/kill/restart lifecycle.
 */
export type WorkerProcessState = 'STARTING' | 'IDLE' | 'BUSY' | 'PAUSED' | 'CRASHED' | 'STOPPED';

export interface WorkerProcessMetrics {
  pid: number;
  restartCount: number;
  crashCount: number;
  lastHeartbeat: number;
  startTime: number;
}

export type WorkerTaskOutcome = 'COMPLETED' | 'FAILED' | 'INTERRUPTED';

export interface WorkerTaskHistoryEntry {
  taskId: string;
  goal: string;
  outcome: WorkerTaskOutcome;
  timestamp: string;
  durationMs?: number;
  filesTouched?: string[];
}

/** The one thing a worker can be doing right now. A worker has at most one of these — see
 * beginExecution(). */
export interface WorkerActiveExecution {
  executionId: string;
  requestId: string;
  taskId: string;
  goal: string;
  pluginId: string;
  workspacePath?: string;
  startedAt: string;
}

const MAX_HISTORY_PER_WORKER = 25;

/**
 * The single source of truth for a worker: identity, real process health, assigned AI provider,
 * and — critically — at most one in-flight execution at a time. Previously this state was spread
 * across WorkerRegistry, WorkerActivityRegistry, WorkerProviderAssignmentStore, and a
 * DepartmentMember record with a load counter nothing ever decremented (see ADR-0005). A real
 * employee cannot work on two unrelated tasks simultaneously; beginExecution() enforces that
 * invariant here rather than leaving it to callers to coordinate correctly.
 */
export class Worker {
  readonly id: string;
  name: string;
  role: string;
  department: DepartmentType;

  processState: WorkerProcessState = 'STARTING';
  process: WorkerProcessMetrics = {
    pid: 0,
    restartCount: 0,
    crashCount: 0,
    lastHeartbeat: Date.now(),
    startTime: Date.now(),
  };

  assignedProviderId?: string;

  activeExecution?: WorkerActiveExecution;
  tokenUsageTotal = 0;
  history: WorkerTaskHistoryEntry[] = [];

  constructor(id: string, name: string, role: string, department: DepartmentType) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.department = department;
  }

  get isBusy(): boolean {
    return !!this.activeExecution;
  }

  beginExecution(execution: WorkerActiveExecution): void {
    if (this.activeExecution) {
      throw new Error(
        `Worker '${this.id}' is already executing task '${this.activeExecution.taskId}' — cannot start '${execution.taskId}' concurrently.`
      );
    }
    this.activeExecution = execution;
    this.processState = 'BUSY';
  }

  completeExecution(outcome: WorkerTaskOutcome, opts: { durationMs: number; filesTouched?: string[]; tokenUsage?: number }): void {
    const execution = this.activeExecution;
    if (!execution) return;

    this.activeExecution = undefined;
    this.processState = this.processState === 'BUSY' ? 'IDLE' : this.processState;
    this.tokenUsageTotal += opts.tokenUsage || 0;

    this.history.unshift({
      taskId: execution.taskId,
      goal: execution.goal,
      outcome,
      timestamp: new Date().toISOString(),
      durationMs: opts.durationMs,
      filesTouched: opts.filesTouched,
    });
    if (this.history.length > MAX_HISTORY_PER_WORKER) {
      this.history.length = MAX_HISTORY_PER_WORKER;
    }
  }
}
