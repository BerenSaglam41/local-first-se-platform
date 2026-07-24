import { Kernel } from '../kernel/kernel';

export class SeOsCli {
  private kernel = new Kernel();
  private attachedPlugins = new Map<string, string>();

  async boot(configPath: string = './company.json'): Promise<void> {
    console.log(`[SE-OS Kernel v2.0] Booting local workforce processes from ${configPath}...`);
    await this.kernel.boot(configPath);
    const workers = this.kernel.getSupervisor().getRegistry().list();
    console.log(`✔ Kernel booted successfully.`);
    console.log(`✔ Active Employees (${workers.length}):`);
    for (const w of workers) {
      console.log(`  - [PID ${w.metrics.pid}] ${w.metadata.name} (${w.metadata.role}) - Status: ${w.state} - Pane: ${w.metadata.tmuxPaneIndex}`);
    }
  }

  async status(): Promise<void> {
    if (!this.kernel.isReady()) {
      console.log(`[SE-OS Kernel] System is OFFLINE.`);
      return;
    }
    const workers = this.kernel.getSupervisor().getRegistry().list();
    const metrics = this.kernel.getTelemetry().getSnapshot(workers, 0);
    console.log(`====================================================`);
    console.log(` SE-OS v2.0 LOCAL RUNTIME STATUS`);
    console.log(`====================================================`);
    console.log(` Status:               ONLINE`);
    console.log(` Uptime:               ${metrics.uptimeSeconds}s`);
    console.log(` Active Workers:       ${metrics.activeWorkerCount}`);
    console.log(` Memory (RSS):         ${metrics.memoryRssMb} MB`);
    console.log(` Memory (Heap):        ${metrics.heapUsedMb} MB`);
    console.log(` CPU Load:             ${metrics.cpuPercent}%`);
    console.log(` Total Heartbeats:     ${metrics.heartbeatsCount}`);
    console.log(`====================================================`);
  }

  async ps(): Promise<void> {
    if (!this.kernel.isReady()) {
      console.log(`[SE-OS Kernel] System is OFFLINE.`);
      return;
    }
    const list = this.kernel.getSupervisor().getRegistry().list();
    console.log(`PROCESS TABLE (${list.length} processes):`);
    console.log(`PID\t\tID\t\tNAME\t\tROLE\t\t\tSTATE\t\tRESTARTS`);
    console.log(`----------------------------------------------------------------------------------------`);
    for (const w of list) {
      console.log(`${w.metrics.pid}\t\t${w.metadata.id}\t${w.metadata.name}\t\t${w.metadata.role}\t\t${w.state}\t\t${w.metrics.restartCount}`);
    }
  }

  async workers(): Promise<void> {
    await this.ps();
  }

  async pluginsList(): Promise<void> {
    const manager = this.kernel.getPluginManager();
    const plugins = manager ? manager.listPlugins() : [];
    console.log(`LOADED RUNTIME PLUGINS (${plugins.length}):`);
    for (const p of plugins) {
      console.log(`  - [${p.id}] ${p.name} v${p.version} (Capabilities: ${p.capabilities.join(', ')})`);
    }
  }

  async pluginsHealth(): Promise<void> {
    const manager = this.kernel.getPluginManager();
    const health = manager ? await manager.healthCheckAll() : {};
    console.log(`RUNTIME PLUGIN HEALTH:`);
    console.log(JSON.stringify(health, null, 2));
  }

  async workerAttach(workerId: string, pluginId: string): Promise<void> {
    this.attachedPlugins.set(workerId, pluginId);
    console.log(`✔ Attached plugin '${pluginId}' to worker '${workerId}'`);
  }

  async workerDetach(workerId: string): Promise<void> {
    this.attachedPlugins.delete(workerId);
    console.log(`✔ Detached plugin from worker '${workerId}'`);
  }

  async missionCreate(title: string, goal: string): Promise<void> {
    const m = this.kernel.getMissionEngine().createMission(title, goal);
    console.log(`✔ Created Mission '${m.id}': ${m.title}`);
  }

  async missionStart(id: string): Promise<void> {
    const ok = this.kernel.getMissionEngine().startMission(id);
    console.log(ok ? `✔ Mission ${id} started.` : `✖ Failed to start mission ${id}`);
  }

  async missionPause(id: string): Promise<void> {
    const ok = this.kernel.getMissionEngine().pauseMission(id);
    console.log(ok ? `✔ Mission ${id} paused.` : `✖ Failed to pause mission ${id}`);
  }

  async missionResume(id: string): Promise<void> {
    const ok = this.kernel.getMissionEngine().resumeMission(id);
    console.log(ok ? `✔ Mission ${id} resumed.` : `✖ Failed to resume mission ${id}`);
  }

  async missionStatus(id?: string): Promise<void> {
    if (id) {
      const m = this.kernel.getMissionEngine().getMission(id);
      console.log(m ? JSON.stringify(m, null, 2) : `✖ Mission ${id} not found`);
    } else {
      const list = this.kernel.getMissionEngine().listMissions();
      console.log(`ALL MISSIONS (${list.length}):`);
      for (const m of list) {
        console.log(`  - [${m.id}] ${m.title} (Status: ${m.status})`);
      }
    }
  }

  async missionGraph(id: string): Promise<void> {
    const graph = this.kernel.getMissionEngine().getTaskGraph(id);
    if (!graph) {
      console.log(`✖ Mission graph for ${id} not found.`);
      return;
    }
    console.log(`TASK GRAPH FOR MISSION ${id}:`);
    for (const t of graph.getAllTasks()) {
      console.log(`  Task ${t.id} [${t.status}] Priority:${t.priority} -> DependsOn: [${t.dependsOnTaskIds.join(', ')}]`);
    }
  }

  async tasks(): Promise<void> {
    const list = this.kernel.getMissionEngine().listMissions();
    console.log(`TASK ENGINE BOARD:`);
    for (const m of list) {
      const graph = this.kernel.getMissionEngine().getTaskGraph(m.id);
      if (graph) {
        for (const t of graph.getAllTasks()) {
          console.log(`  - [${t.id}] ${t.title} | Status: ${t.status} | Capabilities: ${t.requiredCapabilities.join(', ')}`);
        }
      }
    }
  }

  async workerStart(id: string): Promise<void> {
    const w = this.kernel.getSupervisor().spawnWorker({
      id,
      name: id,
      role: 'Worker',
      department: 'Engineering',
      executable: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      tmuxPaneIndex: 4,
    });
    console.log(`✔ Worker ${id} spawned with PID ${w.metrics.pid}`);
  }

  async workerStop(id: string): Promise<void> {
    const success = this.kernel.getSupervisor().stopWorker(id);
    console.log(success ? `✔ Worker ${id} stopped.` : `✖ Failed to stop worker ${id}`);
  }

  async workerRestart(id: string): Promise<void> {
    const res = this.kernel.getSupervisor().restartWorker(id);
    console.log(res ? `✔ Worker ${id} restarted with new PID ${res.metrics.pid}` : `✖ Failed to restart worker ${id}`);
  }

  async workerKill(id: string): Promise<void> {
    const success = this.kernel.getSupervisor().killWorker(id);
    console.log(success ? `✔ Worker ${id} killed with SIGKILL.` : `✖ Failed to kill worker ${id}`);
  }

  async telemetry(): Promise<void> {
    const snapshot = this.kernel.getTelemetry().getSnapshot(
      this.kernel.getSupervisor().getRegistry().list(),
      0
    );
    console.log(JSON.stringify(snapshot, null, 2));
  }

  async shutdown(): Promise<void> {
    console.log(`[SE-OS Kernel] Initiating workforce shutdown...`);
    await this.kernel.shutdown();
    console.log(`✔ Company workforce shutdown complete.`);
  }
}
