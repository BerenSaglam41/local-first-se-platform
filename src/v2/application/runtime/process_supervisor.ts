import { EventEmitter } from 'events';

export interface EmployeeConfig {
  id: string;
  name: string;
  role: string;
  department: string;
  tmuxPaneIndex?: number;
}

export interface ManagedWorker {
  id: string;
  name: string;
  role: string;
  department: string;
  pid: number;
  status: 'BOOTING' | 'IDLE' | 'BUSY' | 'ERROR' | 'OFFLINE';
  tmuxPaneIndex: number;
  lastHeartbeat: number;
  consecutiveFailures: number;
}

export class ProcessSupervisor extends EventEmitter {
  private workers = new Map<string, ManagedWorker>();
  private heartbeatTimer?: NodeJS.Timeout;

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

  spawnWorker(config: EmployeeConfig): ManagedWorker {
    const worker: ManagedWorker = {
      id: config.id,
      name: config.name,
      role: config.role,
      department: config.department,
      pid: Math.floor(Math.random() * 8000) + 2000,
      status: 'IDLE',
      tmuxPaneIndex: config.tmuxPaneIndex || (this.workers.size + 1),
      lastHeartbeat: Date.now(),
      consecutiveFailures: 0,
    };

    this.workers.set(config.id, worker);
    this.emit('workerSpawned', worker);
    return worker;
  }

  stopWorker(id: string): boolean {
    const worker = this.workers.get(id);
    if (!worker) return false;

    worker.status = 'OFFLINE';
    this.emit('workerStopped', worker);
    this.workers.delete(id);
    return true;
  }

  restartWorker(id: string): ManagedWorker | null {
    const worker = this.workers.get(id);
    if (!worker) return null;

    worker.status = 'BOOTING';
    worker.pid = Math.floor(Math.random() * 8000) + 2000;
    worker.lastHeartbeat = Date.now();
    worker.status = 'IDLE';
    this.emit('workerRestarted', worker);
    return worker;
  }

  getWorker(id: string): ManagedWorker | undefined {
    return this.workers.get(id);
  }

  listWorkers(): ManagedWorker[] {
    return Array.from(this.workers.values());
  }

  recordWorkerHeartbeat(id: string): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.lastHeartbeat = Date.now();
    }
  }

  private runHeartbeatCheck(): void {
    const now = Date.now();
    for (const worker of this.workers.values()) {
      if (worker.status !== 'OFFLINE' && now - worker.lastHeartbeat > 10000) {
        worker.consecutiveFailures++;
        if (worker.consecutiveFailures >= 3) {
          worker.status = 'ERROR';
          this.emit('workerUnhealthy', worker);
          this.restartWorker(worker.id);
        }
      }
    }
  }
}
