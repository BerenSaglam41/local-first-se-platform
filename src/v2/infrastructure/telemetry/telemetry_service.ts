import * as os from 'os';
import { Worker } from '../../domain/employees/worker';

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
    restartCount: number;
    crashCount: number;
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

  getSnapshot(activeWorkers: Worker[] = [], queueDepth: number = 0): DetailedTelemetrySnapshot {
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
        id: w.id,
        name: w.name,
        role: w.role,
        pid: w.process.pid,
        state: w.processState,
        restartCount: w.process.restartCount,
        crashCount: w.process.crashCount,
      })),
    };
  }
}
