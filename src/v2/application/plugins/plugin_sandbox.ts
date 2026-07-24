import { IRuntimePlugin, PluginHealthStatus, WorkerSpawnConfig, IWorkerHandle } from '../../contracts/iplugin_framework';

export class PluginSandbox {
  constructor(private plugin: IRuntimePlugin) {}

  async safeInitialize(): Promise<boolean> {
    try {
      await this.plugin.initialize();
      return true;
    } catch (err: any) {
      console.warn(`[PluginSandbox] Error initializing plugin ${this.plugin.metadata().id}: ${err.message}`);
      return false;
    }
  }

  async safeShutdown(): Promise<boolean> {
    try {
      await this.plugin.shutdown();
      return true;
    } catch (err: any) {
      console.warn(`[PluginSandbox] Error shutting down plugin ${this.plugin.metadata().id}: ${err.message}`);
      return false;
    }
  }

  async safeSpawnWorker(config: WorkerSpawnConfig): Promise<IWorkerHandle | null> {
    try {
      return await this.plugin.spawnWorker(config);
    } catch (err: any) {
      console.warn(`[PluginSandbox] Error spawning worker in plugin ${this.plugin.metadata().id}: ${err.message}`);
      return null;
    }
  }

  async safeExecute(taskPayload: Record<string, any>): Promise<Record<string, any> | null> {
    try {
      return await this.plugin.execute(taskPayload);
    } catch (err: any) {
      console.warn(`[PluginSandbox] Error executing task in plugin ${this.plugin.metadata().id}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async safeHealth(): Promise<PluginHealthStatus> {
    try {
      return await this.plugin.health();
    } catch (err: any) {
      return { status: 'UNHEALTHY', metrics: { error: err.message } };
    }
  }
}
