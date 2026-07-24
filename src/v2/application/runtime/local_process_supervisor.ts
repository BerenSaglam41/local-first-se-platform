import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { WorkerStore } from '../worker/worker_store';
import { Worker } from '../../domain/employees/worker';
import { PtyEngine } from '../../infrastructure/pty/pty_engine';
import { IEventStore } from '../../contracts/ievent_store';

export interface WorkerMetadata {
  id: string;
  name: string;
  role: string;
  department: string;
  executable?: string;
  args?: string[];
  tmuxPaneIndex?: number;
}

/**
 * Owns the real OS process lifecycle for workers registered in WorkerStore — spawn/stop/kill/
 * restart/pause/resume. Does NOT keep its own registry: WorkerStore is the single source of truth
 * for worker identity and state (see ADR-0005); this class only ever mutates the Worker it's
 * given.
 */
export class LocalProcessSupervisor extends EventEmitter {
  private childProcesses = new Map<string, ChildProcess>();
  private ptyEngines = new Map<string, PtyEngine>();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(private workerStore: WorkerStore, private eventStore?: IEventStore) {
    super();
  }

  startSupervision(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => this.runHeartbeatCheck(), 1000);
  }

  stopSupervision(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  spawnWorker(metadata: WorkerMetadata): Worker {
    const worker = this.workerStore.register(metadata.id, metadata.name, metadata.role, metadata.department);

    const executable = metadata.executable || process.execPath;
    const args = metadata.args || ['-e', 'setInterval(() => {}, 1000)'];

    const child = spawn(executable, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    worker.process.pid = child.pid || 0;
    worker.process.startTime = Date.now();
    worker.process.lastHeartbeat = Date.now();
    worker.processState = 'IDLE';
    this.childProcesses.set(metadata.id, child);

    const pty = new PtyEngine(child);
    this.ptyEngines.set(metadata.id, pty);

    this.emitEvent('WorkerSpawned', metadata.id, { pid: worker.process.pid, executable, args });
    this.emitEvent('WorkerStarted', metadata.id, { pid: worker.process.pid });

    child.on('exit', (code, signal) => {
      worker.processState = 'STOPPED';
      this.emitEvent('WorkerExited', metadata.id, { code, signal });

      if (code !== 0 && code !== null) {
        worker.process.crashCount++;
        worker.processState = 'CRASHED';
        this.emitEvent('WorkerFailed', metadata.id, { code, signal });
      }
    });

    return worker;
  }

  /** Stops the real process and removes the worker entirely — WorkerStore.remove() is the one
   * cleanup call a removed worker requires; there is no second store left to forget. */
  stopWorker(id: string): boolean {
    const child = this.childProcesses.get(id);
    const pty = this.ptyEngines.get(id);
    if (pty) pty.close();
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
    this.childProcesses.delete(id);
    this.ptyEngines.delete(id);
    this.emitEvent('WorkerStopped', id, {});
    return this.workerStore.remove(id);
  }

  killWorker(id: string): boolean {
    const child = this.childProcesses.get(id);
    if (child && !child.killed) {
      child.kill('SIGKILL');
    }
    this.emitEvent('WorkerKilled', id, {});
    return this.stopWorker(id);
  }

  /** Restarts the real OS process while preserving the worker's business state (provider
   * assignment, token usage, task history) — a restart is the same employee coming back after a
   * hiccup, not a new hire. Only process-level counters reset the way a real process restart
   * would. */
  restartWorker(id: string): Worker | null {
    const worker = this.workerStore.get(id);
    if (!worker) return null;

    const oldRestartCount = worker.process.restartCount + 1;
    const oldCrashCount = worker.process.crashCount;
    const metadata: WorkerMetadata = { id: worker.id, name: worker.name, role: worker.role, department: worker.department };
    const preservedProviderId = worker.assignedProviderId;
    const preservedHistory = worker.history;
    const preservedTokenUsage = worker.tokenUsageTotal;

    this.stopWorker(id);
    const newWorker = this.spawnWorker(metadata);
    newWorker.process.restartCount = oldRestartCount;
    newWorker.process.crashCount = oldCrashCount;
    newWorker.assignedProviderId = preservedProviderId;
    newWorker.history = preservedHistory;
    newWorker.tokenUsageTotal = preservedTokenUsage;

    this.emitEvent('WorkerRestarted', id, { restartCount: oldRestartCount });
    return newWorker;
  }

  pauseWorker(id: string): boolean {
    const child = this.childProcesses.get(id);
    const worker = this.workerStore.get(id);
    if (child && !child.killed && worker) {
      child.kill('SIGSTOP');
      worker.processState = 'PAUSED';
      this.emitEvent('WorkerPaused', id, {});
      return true;
    }
    return false;
  }

  resumeWorker(id: string): boolean {
    const child = this.childProcesses.get(id);
    const worker = this.workerStore.get(id);
    if (child && worker) {
      child.kill('SIGCONT');
      worker.processState = 'IDLE';
      this.emitEvent('WorkerResumed', id, {});
      return true;
    }
    return false;
  }

  getPtyEngine(id: string): PtyEngine | undefined {
    return this.ptyEngines.get(id);
  }

  recordHeartbeat(id: string): void {
    const worker = this.workerStore.get(id);
    if (worker) {
      const now = Date.now();
      worker.process.lastHeartbeat = now;
    }
    this.emitEvent('WorkerHeartbeat', id, { timestamp: Date.now() });
  }

  private runHeartbeatCheck(): void {
    for (const worker of this.workerStore.list()) {
      if (worker.processState !== 'STOPPED' && worker.processState !== 'PAUSED') {
        this.recordHeartbeat(worker.id);
      }
    }
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'LocalProcessSupervisor',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
