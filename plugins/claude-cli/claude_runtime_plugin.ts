import {
  CapabilityType,
  IRuntimePlugin,
  IWorkerHandle,
  PluginHealthStatus,
  PluginManifest,
  WorkerSpawnConfig,
} from '../../src/v2/contracts/iplugin_framework';
import { ClaudeSession } from './claude_session';
import { ClaudeExecutor } from './claude_executor';
import * as fs from 'fs';
import * as path from 'path';

export class ClaudeRuntimePlugin implements IRuntimePlugin {
  private sessions = new Map<string, ClaudeSession>();
  private executor = new ClaudeExecutor();
  private manifestData: PluginManifest;

  constructor() {
    const manifestPath = path.join(__dirname, 'plugin.json');
    if (fs.existsSync(manifestPath)) {
      this.manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } else {
      this.manifestData = {
        id: 'plugin-claude-cli',
        name: 'Claude CLI Runtime Plugin',
        version: '1.0.0',
        minKernelVersion: '2.0.0',
        entryPoint: 'claude_runtime_plugin.ts',
        capabilities: ['CODE_GENERATION', 'ARCHITECTURE', 'CODE_REVIEW', 'DEBUGGING', 'TEST_GENERATION'],
        supportedPlatforms: ['darwin', 'linux', 'win32'],
      };
    }
  }

  metadata(): PluginManifest {
    return this.manifestData;
  }

  capabilities(): CapabilityType[] {
    return this.manifestData.capabilities;
  }

  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }

  async spawnWorker(config: WorkerSpawnConfig): Promise<IWorkerHandle> {
    const sessionId = `session-${config.workerId}`;
    const session = new ClaudeSession(sessionId, config.workerId);
    this.sessions.set(config.workerId, session);

    return {
      workerId: config.workerId,
      pid: session.getInfo().pid,
      status: 'IDLE',
    };
  }

  async stopWorker(workerId: string): Promise<boolean> {
    const session = this.sessions.get(workerId);
    if (session) {
      session.close();
      this.sessions.delete(workerId);
      return true;
    }
    return false;
  }

  async restartWorker(workerId: string): Promise<IWorkerHandle> {
    const session = this.sessions.get(workerId);
    let pid = 0;
    if (session) {
      pid = session.restart();
    } else {
      const handle = await this.spawnWorker({
        workerId,
        name: workerId,
        role: 'Worker',
        department: 'Engineering',
      });
      pid = handle.pid;
    }
    return {
      workerId,
      pid,
      status: 'IDLE',
    };
  }

  async execute(taskPayload: Record<string, any>): Promise<Record<string, any>> {
    const workerId = taskPayload.workerId || 'default-worker';
    let session = this.sessions.get(workerId);
    if (!session) {
      await this.spawnWorker({
        workerId,
        name: workerId,
        role: 'Worker',
        department: 'Engineering',
      });
      session = this.sessions.get(workerId)!;
    }

    const result = await this.executor.executeTask(session, taskPayload);
    return result;
  }

  async health(): Promise<PluginHealthStatus> {
    return {
      status: 'HEALTHY',
      metrics: {
        activeSessions: this.sessions.size,
        sessionIds: Array.from(this.sessions.keys()),
      },
    };
  }

  getSession(workerId: string): ClaudeSession | undefined {
    return this.sessions.get(workerId);
  }
}
