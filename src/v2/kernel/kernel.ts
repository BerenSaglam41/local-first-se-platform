import { IKernel } from '../contracts/ikernel';
import { ICompanyBus } from '../contracts/icompany_bus';
import { ISharedMemory } from '../contracts/ishared_memory';
import { IScheduler } from '../contracts/ischeduler';
import { IPluginRegistry } from '../contracts/iplugin_registry';
import { IEventStore } from '../contracts/ievent_store';
import { DIContainer } from '../infrastructure/di/di_container';
import { SqliteEventStore } from '../infrastructure/storage/sqlite_event_store';
import { SqliteSharedMemory } from '../infrastructure/storage/sqlite_shared_memory';
import { InMemoryCompanyBus } from '../application/company-bus/in_memory_company_bus';
import { SchedulerSkeleton } from '../application/scheduler/scheduler_skeleton';
import { PluginRegistry } from '../application/plugins/plugin_registry';
import { LocalProcessSupervisor } from '../application/runtime/local_process_supervisor';
import { TelemetryService } from '../infrastructure/telemetry/telemetry_service';
import { RuntimePluginManager } from '../application/plugins/runtime_plugin_manager';
import { MissionEngine } from '../application/missions/mission_engine';
import { ContextCompiler } from '../application/context-compiler/context_compiler';
import { WorkspaceEngine } from '../application/workspace/workspace_engine';
import * as fs from 'fs';

export class Kernel implements IKernel {
  private container = new DIContainer();
  private isBooted = false;

  async boot(configPath: string): Promise<void> {
    if (this.isBooted) return;

    const dbPath = './se_company.db';
    const eventStore = new SqliteEventStore(dbPath);
    await eventStore.connect();

    const sharedMemory = new SqliteSharedMemory(dbPath);
    await sharedMemory.connect();

    const companyBus = new InMemoryCompanyBus();
    const scheduler = new SchedulerSkeleton();
    const pluginRegistry = new PluginRegistry();
    const pluginManager = new RuntimePluginManager();
    const supervisor = new LocalProcessSupervisor(eventStore);
    const telemetry = new TelemetryService();
    const missionEngine = new MissionEngine(eventStore, pluginManager.getCapabilityRegistry());
    const contextCompiler = new ContextCompiler(sharedMemory, eventStore);
    const workspaceEngine = new WorkspaceEngine('./.se_workspaces', eventStore);

    supervisor.startSupervision();

    this.container.registerSingleton<IEventStore>('IEventStore', eventStore);
    this.container.registerSingleton<ISharedMemory>('ISharedMemory', sharedMemory);
    this.container.registerSingleton<ICompanyBus>('ICompanyBus', companyBus);
    this.container.registerSingleton<IScheduler>('IScheduler', scheduler);
    this.container.registerSingleton<IPluginRegistry>('IPluginRegistry', pluginRegistry);
    this.container.registerSingleton<RuntimePluginManager>('RuntimePluginManager', pluginManager);
    this.container.registerSingleton<LocalProcessSupervisor>('LocalProcessSupervisor', supervisor);
    this.container.registerSingleton<TelemetryService>('TelemetryService', telemetry);
    this.container.registerSingleton<MissionEngine>('MissionEngine', missionEngine);
    this.container.registerSingleton<ContextCompiler>('ContextCompiler', contextCompiler);
    this.container.registerSingleton<WorkspaceEngine>('WorkspaceEngine', workspaceEngine);

    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.employees && Array.isArray(parsed.employees)) {
          for (const emp of parsed.employees) {
            supervisor.spawnWorker({
              id: emp.id || `emp-${emp.name}`,
              name: emp.name,
              role: emp.role,
              department: emp.department || 'Engineering',
              executable: process.execPath,
              args: ['-e', 'setInterval(() => {}, 1000)'],
              tmuxPaneIndex: emp.tmuxPaneIndex || 1,
            });
          }
        }
      } catch (err) {
        this.loadDefaultWorkforce(supervisor);
      }
    } else {
      this.loadDefaultWorkforce(supervisor);
    }

    this.isBooted = true;
  }

  private loadDefaultWorkforce(supervisor: LocalProcessSupervisor): void {
    supervisor.spawnWorker({ id: 'emp-alice', name: 'Alice', role: 'Lead Architect', department: 'Architecture', executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], tmuxPaneIndex: 1 });
    supervisor.spawnWorker({ id: 'emp-bob', name: 'Bob', role: 'Backend Engineer', department: 'Backend Engineering', executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], tmuxPaneIndex: 2 });
    supervisor.spawnWorker({ id: 'emp-charlie', name: 'Charlie', role: 'QA Engineer', department: 'Quality Assurance', executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], tmuxPaneIndex: 3 });
  }

  async shutdown(signal?: string): Promise<void> {
    if (!this.isBooted) return;

    const supervisor = this.container.resolve<LocalProcessSupervisor>('LocalProcessSupervisor');
    supervisor.stopSupervision();
    for (const w of supervisor.getRegistry().list()) {
      supervisor.stopWorker(w.metadata.id);
    }

    const eventStore = this.container.resolve<SqliteEventStore>('IEventStore');
    await eventStore.close();

    const sharedMemory = this.container.resolve<SqliteSharedMemory>('ISharedMemory');
    await sharedMemory.close();

    this.isBooted = false;
  }

  getSharedMemory(): ISharedMemory {
    return this.container.resolve<ISharedMemory>('ISharedMemory');
  }

  getCompanyBus(): ICompanyBus {
    return this.container.resolve<ICompanyBus>('ICompanyBus');
  }

  getScheduler(): IScheduler {
    return this.container.resolve<IScheduler>('IScheduler');
  }

  getPluginRegistry(): IPluginRegistry {
    return this.container.resolve<IPluginRegistry>('IPluginRegistry');
  }

  getEventStore(): IEventStore {
    return this.container.resolve<IEventStore>('IEventStore');
  }

  getSupervisor(): LocalProcessSupervisor {
    return this.container.resolve<LocalProcessSupervisor>('LocalProcessSupervisor');
  }

  getPluginManager(): RuntimePluginManager {
    return this.container.resolve<RuntimePluginManager>('RuntimePluginManager');
  }

  getMissionEngine(): MissionEngine {
    return this.container.resolve<MissionEngine>('MissionEngine');
  }

  getContextCompiler(): ContextCompiler {
    return this.container.resolve<ContextCompiler>('ContextCompiler');
  }

  getWorkspaceEngine(): WorkspaceEngine {
    return this.container.resolve<WorkspaceEngine>('WorkspaceEngine');
  }

  getTelemetry(): TelemetryService {
    return this.container.resolve<TelemetryService>('TelemetryService');
  }

  isReady(): boolean {
    return this.isBooted;
  }
}
