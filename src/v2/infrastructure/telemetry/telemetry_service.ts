import * as os from 'os';
import { RegisteredWorker } from '../../application/runtime/worker_registry';

export interface DetailedTelemetrySnapshot {
  timestamp: string;
  uptimeSeconds: number;
  cpuPercent: number;
  memoryRssMb: number;
  heapUsedMb: number;
  activeWorkerCount: number;
  totalMissions: number;
  queueDepth: number;
  heartbeatsCount: number;
  workers: {
    id: string;
    name: string;
    role: string;
    pid: number;
    state: string;
    cpuPercent: number;
    memoryRssMb: number;
    restartCount: number;
    crashCount: number;
    heartbeatLatencyMs: number;
  }[];
}

export class TelemetryService {
  private startTime: number = Date.now();
  private heartbeats: number = 0;
  private totalMissions: number = 0;

  recordHeartbeat(): void {
    this.heartbeats++;
  }

  recordMission(): void {
    this.totalMissions++;
  }

  getSnapshot(activeWorkers: RegisteredWorker[] = [], queueDepth: number = 0): DetailedTelemetrySnapshot {
    const memory = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      cpuPercent: parseFloat((os.loadavg()[0] || 0.1).toFixed(2)),
      memoryRssMb: parseFloat((memory.rss / (1024 * 1024)).toFixed(2)),
      heapUsedMb: parseFloat((memory.heapUsed / (1024 * 1024)).toFixed(2)),
      activeWorkerCount: activeWorkers.length,
      totalMissions: this.totalMissions,
      queueDepth,
      heartbeatsCount: this.heartbeats,
      workers: activeWorkers.map((w) => ({
        id: w.metadata.id,
        name: w.metadata.name,
        role: w.metadata.role,
        pid: w.metrics.pid,
        state: w.state,
        cpuPercent: w.metrics.cpuPercent,
        memoryRssMb: w.metrics.memoryRssMb,
        restartCount: w.metrics.restartCount,
        crashCount: w.metrics.crashCount,
        heartbeatLatencyMs: w.metrics.heartbeatLatencyMs,
      })),
    };
  }
}
