import { Kernel } from '../kernel/kernel';

export class SeOsCli {
  private kernel = new Kernel();

  async boot(configPath: string = './company.json'): Promise<void> {
    console.log(`[SE-OS Kernel v2.0] Booting company workforce from ${configPath}...`);
    await this.kernel.boot(configPath);
    const workers = this.kernel.getSupervisor().listWorkers();
    console.log(`✔ Kernel booted successfully.`);
    console.log(`✔ Active Employees (${workers.length}):`);
    for (const w of workers) {
      console.log(`  - [PID ${w.pid}] ${w.name} (${w.role}) - Status: ${w.status} - Pane: ${w.tmuxPaneIndex}`);
    }
  }

  async status(): Promise<void> {
    if (!this.kernel.isReady()) {
      console.log(`[SE-OS Kernel] System is OFFLINE.`);
      return;
    }
    const workers = this.kernel.getSupervisor().listWorkers();
    const metrics = this.kernel.getTelemetry().getSnapshot(workers.length, 0);
    console.log(`====================================================`);
    console.log(` SE-OS v2.0 COMPANY STATUS`);
    console.log(`====================================================`);
    console.log(` Status:               ONLINE`);
    console.log(` Uptime:               ${metrics.uptimeSeconds}s`);
    console.log(` Active Workers:       ${metrics.activeWorkerCount}`);
    console.log(` System RAM:           ${metrics.memoryRssMb} MB`);
    console.log(` CPU Load:             ${metrics.cpuPercent}%`);
    console.log(` Total Heartbeats:     ${metrics.heartbeatsCount}`);
    console.log(`====================================================`);
  }

  async workers(): Promise<void> {
    const list = this.kernel.getSupervisor().listWorkers();
    console.log(`WORKFORCE ROSTER (${list.length}):`);
    for (const w of list) {
      console.log(`  ID: ${w.id} | Name: ${w.name} | Role: ${w.role} | Department: ${w.department} | Status: ${w.status}`);
    }
  }

  async shutdown(): Promise<void> {
    console.log(`[SE-OS Kernel] Initiating workforce shutdown...`);
    await this.kernel.shutdown();
    console.log(`✔ Company workforce shutdown complete.`);
  }
}
