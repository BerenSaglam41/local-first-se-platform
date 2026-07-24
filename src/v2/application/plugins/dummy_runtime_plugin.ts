import {
  CapabilityType,
  IRuntimePlugin,
  IWorkerHandle,
  PluginHealthStatus,
  PluginManifest,
  WorkerSpawnConfig,
} from '../../contracts/iplugin_framework';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export class DummyRuntimePlugin implements IRuntimePlugin {
  private activeWorkers = new Map<string, { handle: IWorkerHandle; process: ChildProcess }>();

  metadata(): PluginManifest {
    return {
      id: 'plugin-dummy-runtime',
      name: 'Reference Testing Runtime Engine',
      version: '2.0.0',
      minKernelVersion: '2.0.0',
      entryPoint: 'dummy_worker.js',
      capabilities: ['CODE_GENERATION', 'TEST_GENERATION', 'CODE_REVIEW', 'DOCUMENTATION'],
      supportedPlatforms: ['darwin', 'linux', 'win32'],
    };
  }

  capabilities(): CapabilityType[] {
    return this.metadata().capabilities;
  }

  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {
    for (const id of this.activeWorkers.keys()) {
      await this.stopWorker(id);
    }
  }

  async spawnWorker(config: WorkerSpawnConfig): Promise<IWorkerHandle> {
    const dummyScript = path.join(__dirname, '../runtime/dummy_worker.js');
    const child = spawn(process.execPath, [dummyScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const handle: IWorkerHandle = {
      workerId: config.workerId,
      pid: child.pid || Math.floor(Math.random() * 8000) + 1000,
      status: 'IDLE',
    };

    this.activeWorkers.set(config.workerId, { handle, process: child });
    return handle;
  }

  async stopWorker(workerId: string): Promise<boolean> {
    const item = this.activeWorkers.get(workerId);
    if (item) {
      if (!item.process.killed) {
        item.process.kill('SIGTERM');
      }
      this.activeWorkers.delete(workerId);
      return true;
    }
    return false;
  }

  async restartWorker(workerId: string): Promise<IWorkerHandle> {
    const item = this.activeWorkers.get(workerId);
    await this.stopWorker(workerId);
    return this.spawnWorker({
      workerId,
      name: workerId,
      role: 'Worker',
      department: 'Engineering',
    });
  }

  async execute(taskPayload: Record<string, any>): Promise<Record<string, any>> {
    return {
      success: true,
      taskId: taskPayload.taskId || 'dummy-task',
      output: `Executed payload through DummyRuntimePlugin: ${JSON.stringify(taskPayload)}`,
      durationMs: 5,
    };
  }

  async health(): Promise<PluginHealthStatus> {
    return {
      status: 'HEALTHY',
      metrics: {
        activeWorkers: this.activeWorkers.size,
      },
    };
  }
}
