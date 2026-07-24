export type WorkerHealthState =
  | 'HEALTHY'
  | 'BUSY'
  | 'IDLE'
  | 'CRASHED'
  | 'RESTARTING'
  | 'PAUSED'
  | 'STOPPED';

export interface WorkerMetadata {
  id: string;
  name: string;
  role: string;
  department: string;
  executable?: string;
  args?: string[];
  tmuxPaneIndex?: number;
}


export interface WorkerRuntimeMetrics {
  pid: number;
  cpuPercent: number;
  memoryRssMb: number;
  memoryHeapMb: number;
  uptimeSeconds: number;
  restartCount: number;
  crashCount: number;
  heartbeatLatencyMs: number;
  lastHeartbeat: number;
  startTime: number;
}

export interface RegisteredWorker {
  metadata: WorkerMetadata;
  state: WorkerHealthState;
  metrics: WorkerRuntimeMetrics;
}

export class WorkerRegistry {
  private workers = new Map<string, RegisteredWorker>();

  register(metadata: WorkerMetadata, pid: number = 0): RegisteredWorker {
    const worker: RegisteredWorker = {
      metadata,
      state: 'IDLE',
      metrics: {
        pid,
        cpuPercent: 0,
        memoryRssMb: 0,
        memoryHeapMb: 0,
        uptimeSeconds: 0,
        restartCount: 0,
        crashCount: 0,
        heartbeatLatencyMs: 0,
        lastHeartbeat: Date.now(),
        startTime: Date.now(),
      },
    };
    this.workers.set(metadata.id, worker);
    return worker;
  }

  unregister(id: string): boolean {
    return this.workers.delete(id);
  }

  get(id: string): RegisteredWorker | undefined {
    return this.workers.get(id);
  }

  list(): RegisteredWorker[] {
    return Array.from(this.workers.values());
  }

  updateState(id: string, state: WorkerHealthState): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.state = state;
    }
  }

  updatePid(id: string, pid: number): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.metrics.pid = pid;
      worker.metrics.startTime = Date.now();
    }
  }

  recordHeartbeat(id: string): void {
    const worker = this.workers.get(id);
    if (worker) {
      const now = Date.now();
      worker.metrics.heartbeatLatencyMs = now - worker.metrics.lastHeartbeat;
      worker.metrics.lastHeartbeat = now;
      worker.metrics.uptimeSeconds = Math.floor((now - worker.metrics.startTime) / 1000);
    }
  }

  incrementRestart(id: string): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.metrics.restartCount++;
    }
  }

  incrementCrash(id: string): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.metrics.crashCount++;
      worker.state = 'CRASHED';
    }
  }
}
