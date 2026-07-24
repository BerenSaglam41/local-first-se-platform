import { LocalProcessSupervisor } from '../runtime/local_process_supervisor';
import { WorkerStore } from './worker_store';

export interface WorkerLifecyclePolicyOptions {
  /** A worker crashing more than this many times within `windowMs` is quarantined instead of
   * restarted again — see ADR-0008. Bounds the blast radius of a permanently, repeatedly broken
   * worker (bad config, missing dependency) that would otherwise restart-loop forever. */
  maxCrashesInWindow: number;
  windowMs: number;
  /** Exponential backoff before each restart attempt: min(backoffBaseMs * 2^(attempt-1), backoffMaxMs). */
  backoffBaseMs: number;
  backoffMaxMs: number;
  logger?: (message: string) => void;
}

export const DEFAULT_WORKER_LIFECYCLE_POLICY_OPTIONS: WorkerLifecyclePolicyOptions = {
  maxCrashesInWindow: 5,
  windowMs: 5 * 60 * 1000,
  backoffBaseMs: 1000,
  backoffMaxMs: 30 * 1000,
};

/**
 * Real self-healing for crashed workers (see ADR-0008). Before this existed,
 * LocalProcessSupervisor correctly detected a crash (processState = 'CRASHED', a real
 * WorkerFailed event) but nothing ever acted on it — a crashed worker stayed dead until a human
 * ran `worker-restart`. This subscribes to that already-real event and restarts the worker with
 * bounded exponential backoff, escalating to a visible, honest QUARANTINED state (not a silent
 * infinite restart loop) after too many crashes in too short a window.
 *
 * Deliberately does NOT fire on an intentional stop/kill: LocalProcessSupervisor only emits
 * WorkerFailed when the child process exits on its own with a real non-zero exit code — a
 * supervisor-initiated stop/kill terminates by signal (exit code null), which never emits
 * WorkerFailed in the first place. No special-casing is needed here to distinguish the two.
 */
export class WorkerLifecyclePolicy {
  private crashTimestamps = new Map<string, number[]>();
  private quarantined = new Set<string>();
  private readonly options: WorkerLifecyclePolicyOptions;

  constructor(
    private supervisor: LocalProcessSupervisor,
    private workerStore: WorkerStore,
    options: Partial<WorkerLifecyclePolicyOptions> = {}
  ) {
    this.options = { ...DEFAULT_WORKER_LIFECYCLE_POLICY_OPTIONS, ...options };
    this.supervisor.on('WorkerFailed', this.handleWorkerFailed);
  }

  private readonly handleWorkerFailed = (evt: { aggregateId: string }): void => {
    void this.onWorkerFailed(evt.aggregateId);
  };

  private async onWorkerFailed(workerId: string): Promise<void> {
    if (this.quarantined.has(workerId)) {
      // Already quarantined — a quarantined worker only comes back via an explicit, human-issued
      // restart (which clears quarantine, see clearQuarantine()), never automatically.
      return;
    }

    const now = Date.now();
    const recent = (this.crashTimestamps.get(workerId) || []).filter((t) => now - t < this.options.windowMs);
    recent.push(now);
    this.crashTimestamps.set(workerId, recent);

    if (recent.length > this.options.maxCrashesInWindow) {
      this.quarantined.add(workerId);
      const worker = this.workerStore.get(workerId);
      if (worker) worker.processState = 'QUARANTINED';
      this.log(
        `Worker '${workerId}' crashed ${recent.length} times within ${this.options.windowMs}ms — QUARANTINED, auto-restart stopped.`
      );
      return;
    }

    const attempt = recent.length;
    const backoffMs = Math.min(this.options.backoffBaseMs * Math.pow(2, attempt - 1), this.options.backoffMaxMs);
    this.log(`Worker '${workerId}' crashed (attempt ${attempt}) — restarting in ${backoffMs}ms.`);

    await sleep(backoffMs);

    // The worker may have been permanently removed (a real human ran workerStop) during the
    // backoff window — a stale restart of a worker id nobody wants back would be wrong.
    if (!this.workerStore.get(workerId)) {
      this.log(`Worker '${workerId}' no longer exists — skipping scheduled restart.`);
      return;
    }

    this.supervisor.restartWorker(workerId);
  }

  isQuarantined(workerId: string): boolean {
    return this.quarantined.has(workerId);
  }

  getCrashCount(workerId: string): number {
    const now = Date.now();
    return (this.crashTimestamps.get(workerId) || []).filter((t) => now - t < this.options.windowMs).length;
  }

  /** Explicit, human-initiated recovery from quarantine — e.g. after fixing the real underlying
   * cause. Never called automatically; auto-clearing quarantine would defeat its entire purpose. */
  clearQuarantine(workerId: string): void {
    this.quarantined.delete(workerId);
    this.crashTimestamps.delete(workerId);
  }

  listQuarantined(): string[] {
    return Array.from(this.quarantined);
  }

  private log(message: string): void {
    if (this.options.logger) this.options.logger(message);
    else console.log(`[WorkerLifecyclePolicy] ${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
