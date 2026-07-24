import * as os from 'os';

export interface CompanyTelemetrySnapshot {
  timestamp: string;
  uptimeSeconds: number;
  cpuPercent: number;
  memoryRssMb: number;
  activeWorkerCount: number;
  totalMissions: number;
  queueDepth: number;
  heartbeatsCount: number;
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

  getSnapshot(activeWorkerCount: number, queueDepth: number): CompanyTelemetrySnapshot {
    const memory = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      cpuPercent: parseFloat((os.loadavg()[0] || 0.1).toFixed(2)),
      memoryRssMb: parseFloat((memory.rss / (1024 * 1024)).toFixed(2)),
      activeWorkerCount,
      totalMissions: this.totalMissions,
      queueDepth,
      heartbeatsCount: this.heartbeats,
    };
  }
}
