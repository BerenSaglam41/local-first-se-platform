import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { WorkerRegistry, WorkerMetadata, RegisteredWorker } from './worker_registry';
import { PtyEngine } from '../../infrastructure/pty/pty_engine';
import { IEventStore } from '../../contracts/ievent_store';

export class LocalProcessSupervisor extends EventEmitter {
  private registry = new WorkerRegistry();
  private childProcesses = new Map<string, ChildProcess>();
  private ptyEngines = new Map<string, PtyEngine>();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(private eventStore?: IEventStore) {
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

  spawnWorker(metadata: WorkerMetadata): RegisteredWorker {
    const worker = this.registry.register(metadata);

    const executable = metadata.executable || process.execPath;
    const args = metadata.args || ['-e', 'setInterval(() => {}, 1000)'];

    const child = spawn(executable, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    const pid = child.pid || 0;
    this.registry.updatePid(metadata.id, pid);
    this.registry.updateState(metadata.id, 'IDLE');
    this.childProcesses.set(metadata.id, child);

    const pty = new PtyEngine(child);
    this.ptyEngines.set(metadata.id, pty);

    this.emitEvent('WorkerSpawned', metadata.id, { pid, executable, args });
    this.emitEvent('WorkerStarted', metadata.id, { pid });

    child.on('exit', (code, signal) => {
      this.registry.updateState(metadata.id, 'STOPPED');
      this.emitEvent('WorkerExited', metadata.id, { code, signal });

      if (code !== 0 && code !== null) {
        this.registry.incrementCrash(metadata.id);
        this.emitEvent('WorkerFailed', metadata.id, { code, signal });
      }
    });

    return worker;
  }

  stopWorker(id: string): boolean {
    const child = this.childProcesses.get(id);
    const pty = this.ptyEngines.get(id);
    if (pty) pty.close();
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
    this.registry.updateState(id, 'STOPPED');
    this.childProcesses.delete(id);
    this.ptyEngines.delete(id);
    this.emitEvent('WorkerStopped', id, {});
    return this.registry.unregister(id);
  }

  killWorker(id: string): boolean {
    const child = this.childProcesses.get(id);
    if (child && !child.killed) {
      child.kill('SIGKILL');
    }
    this.registry.updateState(id, 'STOPPED');
    this.emitEvent('WorkerKilled', id, {});
    return this.stopWorker(id);
  }

  restartWorker(id: string): RegisteredWorker | null {
    const worker = this.registry.get(id);
    if (!worker) return null;

    const oldRestartCount = worker.metrics.restartCount + 1;
    const oldCrashCount = worker.metrics.crashCount;
    const metadata = { ...worker.metadata };

    this.stopWorker(id);
    const newWorker = this.spawnWorker(metadata);
    newWorker.metrics.restartCount = oldRestartCount;
    newWorker.metrics.crashCount = oldCrashCount;

    this.emitEvent('WorkerRestarted', id, { restartCount: oldRestartCount });
    return newWorker;
  }


  pauseWorker(id: string): boolean {
    const child = this.childProcesses.get(id);
    if (child && !child.killed) {
      child.kill('SIGSTOP');
      this.registry.updateState(id, 'PAUSED');
      this.emitEvent('WorkerPaused', id, {});
      return true;
    }
    return false;
  }

  resumeWorker(id: string): boolean {
    const child = this.childProcesses.get(id);
    if (child) {
      child.kill('SIGCONT');
      this.registry.updateState(id, 'IDLE');
      this.emitEvent('WorkerResumed', id, {});
      return true;
    }
    return false;
  }

  getRegistry(): WorkerRegistry {
    return this.registry;
  }

  getPtyEngine(id: string): PtyEngine | undefined {
    return this.ptyEngines.get(id);
  }

  recordHeartbeat(id: string): void {
    this.registry.recordHeartbeat(id);
    this.emitEvent('WorkerHeartbeat', id, { timestamp: Date.now() });
  }

  private runHeartbeatCheck(): void {
    for (const worker of this.registry.list()) {
      if (worker.state !== 'STOPPED' && worker.state !== 'PAUSED') {
        this.registry.recordHeartbeat(worker.metadata.id);
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
      actorId: 'ProcessSupervisor',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
