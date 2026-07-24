import * as path from 'path';
import { LocalProcessSupervisor } from '../../../src/v2/application/runtime/local_process_supervisor';
import { WorkerStore } from '../../../src/v2/application/worker/worker_store';
import { WorkerLifecyclePolicy } from '../../../src/v2/application/worker/worker_lifecycle_policy';

async function waitFor(predicate: () => boolean, timeoutMs = 3000, intervalMs = 10): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor() timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

const dummyScript = path.join(__dirname, '../../../src/v2/application/runtime/dummy_worker.js');

/** Fires the exact same event shape LocalProcessSupervisor's real emitEvent() constructs for a
 * genuine WorkerFailed — used to drive a real worker through several crashes deterministically,
 * without depending on the supervised placeholder process itself repeatedly crashing (real
 * production workers' placeholder processes never do; only this synthetic scenario would). */
function emitWorkerFailed(supervisor: LocalProcessSupervisor, workerId: string): void {
  supervisor.emit('WorkerFailed', {
    eventId: `evt-test-${Date.now()}-${Math.random()}`,
    aggregateId: workerId,
    eventType: 'WorkerFailed',
    version: 1,
    timestamp: new Date().toISOString(),
    actorId: 'LocalProcessSupervisor',
    payload: { code: 1, signal: null },
  });
}

describe('SE-OS v2.0 Milestone 29 Workstream A — WorkerLifecyclePolicy', () => {
  let workerStore: WorkerStore;
  let supervisor: LocalProcessSupervisor;
  let policy: WorkerLifecyclePolicy;

  beforeEach(() => {
    workerStore = new WorkerStore();
    supervisor = new LocalProcessSupervisor(workerStore);
  });

  afterEach(() => {
    supervisor.stopSupervision();
  });

  it('should automatically restart a worker whose real process crashed', async () => {
    policy = new WorkerLifecyclePolicy(supervisor, workerStore, {
      maxCrashesInWindow: 5,
      windowMs: 60_000,
      backoffBaseMs: 10,
      backoffMaxMs: 50,
    });

    supervisor.spawnWorker({
      id: 'emp-crash-1',
      name: 'CrashTest',
      role: 'Tester',
      department: 'QA',
      executable: process.execPath,
      args: ['-e', 'process.exit(1)'], // a real process that genuinely crashes immediately
    });

    await waitFor(() => (workerStore.get('emp-crash-1')?.process.restartCount ?? 0) >= 1);

    const worker = workerStore.get('emp-crash-1');
    expect(worker).toBeDefined();
    expect(worker!.process.restartCount).toBe(1);
    expect(policy.isQuarantined('emp-crash-1')).toBe(false);

    supervisor.stopWorker('emp-crash-1');
  }, 10000);

  it('should quarantine a worker that crashes more than the configured threshold within the window', async () => {
    policy = new WorkerLifecyclePolicy(supervisor, workerStore, {
      maxCrashesInWindow: 2,
      windowMs: 60_000,
      backoffBaseMs: 5,
      backoffMaxMs: 20,
    });

    supervisor.spawnWorker({
      id: 'emp-crash-loop',
      name: 'CrashLoopTest',
      role: 'Tester',
      department: 'QA',
      executable: process.execPath,
      args: [dummyScript],
    });

    // 2 crashes are allowed (each triggers a real restart); the 3rd tips it over
    // maxCrashesInWindow (2) and must quarantine instead of restarting again.
    emitWorkerFailed(supervisor, 'emp-crash-loop');
    await waitFor(() => policy.getCrashCount('emp-crash-loop') === 1);
    await waitFor(() => (workerStore.get('emp-crash-loop')?.process.restartCount ?? 0) === 1);

    emitWorkerFailed(supervisor, 'emp-crash-loop');
    await waitFor(() => policy.getCrashCount('emp-crash-loop') === 2);
    await waitFor(() => (workerStore.get('emp-crash-loop')?.process.restartCount ?? 0) === 2);

    emitWorkerFailed(supervisor, 'emp-crash-loop');
    await waitFor(() => policy.isQuarantined('emp-crash-loop'));

    expect(policy.isQuarantined('emp-crash-loop')).toBe(true);
    expect(policy.getCrashCount('emp-crash-loop')).toBe(3);
    expect(workerStore.get('emp-crash-loop')?.processState).toBe('QUARANTINED');

    // Quarantine must actually stop auto-restart — the worker stays in the store, dead, honestly
    // visible, rather than being silently restarted a 3rd time.
    const restartCountAtQuarantine = workerStore.get('emp-crash-loop')!.process.restartCount;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(workerStore.get('emp-crash-loop')!.process.restartCount).toBe(restartCountAtQuarantine);

    // A quarantined worker ignores further failure events entirely — no crash-count growth either.
    emitWorkerFailed(supervisor, 'emp-crash-loop');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(policy.getCrashCount('emp-crash-loop')).toBe(3);
  }, 10000);

  it('clearQuarantine() should allow a human-initiated recovery to restart auto-healing again', async () => {
    policy = new WorkerLifecyclePolicy(supervisor, workerStore, {
      maxCrashesInWindow: 1,
      windowMs: 60_000,
      backoffBaseMs: 5,
      backoffMaxMs: 20,
    });

    supervisor.spawnWorker({
      id: 'emp-clear-quarantine',
      name: 'ClearQuarantineTest',
      role: 'Tester',
      department: 'QA',
      executable: process.execPath,
      args: [dummyScript],
    });

    emitWorkerFailed(supervisor, 'emp-clear-quarantine');
    await waitFor(() => (workerStore.get('emp-clear-quarantine')?.process.restartCount ?? 0) === 1);
    emitWorkerFailed(supervisor, 'emp-clear-quarantine');
    await waitFor(() => policy.isQuarantined('emp-clear-quarantine'));

    expect(policy.isQuarantined('emp-clear-quarantine')).toBe(true);

    policy.clearQuarantine('emp-clear-quarantine');
    expect(policy.isQuarantined('emp-clear-quarantine')).toBe(false);
    expect(policy.getCrashCount('emp-clear-quarantine')).toBe(0);
  }, 10000);

  it('should NOT trigger a restart when a worker is intentionally killed', async () => {
    policy = new WorkerLifecyclePolicy(supervisor, workerStore, {
      maxCrashesInWindow: 5,
      windowMs: 60_000,
      backoffBaseMs: 10,
      backoffMaxMs: 50,
    });

    supervisor.spawnWorker({
      id: 'emp-intentional-kill',
      name: 'IntentionalKillTest',
      role: 'Tester',
      department: 'QA',
      executable: process.execPath,
      args: [dummyScript],
    });

    supervisor.killWorker('emp-intentional-kill');

    // Give any (incorrect) auto-restart a real chance to fire before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(workerStore.get('emp-intentional-kill')).toBeUndefined();
    expect(policy.getCrashCount('emp-intentional-kill')).toBe(0);
  });

  it('should NOT trigger a restart when a worker is intentionally stopped', async () => {
    policy = new WorkerLifecyclePolicy(supervisor, workerStore, {
      maxCrashesInWindow: 5,
      windowMs: 60_000,
      backoffBaseMs: 10,
      backoffMaxMs: 50,
    });

    supervisor.spawnWorker({
      id: 'emp-intentional-stop',
      name: 'IntentionalStopTest',
      role: 'Tester',
      department: 'QA',
      executable: process.execPath,
      args: [dummyScript],
    });

    supervisor.stopWorker('emp-intentional-stop');

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(workerStore.get('emp-intentional-stop')).toBeUndefined();
    expect(policy.getCrashCount('emp-intentional-stop')).toBe(0);
  });
});
