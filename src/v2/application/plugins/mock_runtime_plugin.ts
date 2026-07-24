import {
  IRuntimePlugin,
  RuntimePluginManifest,
  RuntimeCapability,
  RuntimeValidationResult,
  RuntimePluginHealth,
  RuntimeConfiguration,
} from '../../contracts/iruntime_plugin_system';
import { IRuntimeSession, SessionStreamOptions, SessionStreamResult } from '../../contracts/iruntime_session';

export class MockRuntimePlugin implements IRuntimePlugin {
  private attachedSessions = new Map<string, IRuntimeSession>();
  private isInitialized = false;

  private manifest: RuntimePluginManifest = {
    id: 'mock-runtime-plugin',
    name: 'Mock Reference Runtime Plugin',
    version: '1.0.0',
    supportedTransports: ['PTY', 'STDIO'],
    capabilities: ['Reasoning', 'Streaming', 'Cancellation', 'InteractiveSession', 'ToolExecution', 'FileAccess'],
    minKernelVersion: '2.0.0',
    maxKernelVersion: '2.9.9',
    healthCheckSupport: true,
    streamingSupport: true,
    cancellationSupport: true,
  };

  async initialize(config?: RuntimeConfiguration): Promise<void> {
    this.isInitialized = true;
  }

  async validate(): Promise<RuntimeValidationResult> {
    return {
      valid: true,
      errors: [],
      warnings: [],
    };
  }

  async attachSession(session: IRuntimeSession): Promise<boolean> {
    if (!this.isInitialized) return false;
    this.attachedSessions.set(session.sessionId, session);
    return true;
  }

  async detachSession(sessionId: string): Promise<boolean> {
    return this.attachedSessions.delete(sessionId);
  }

  async execute(taskPayload: Record<string, any>): Promise<Record<string, any>> {
    return {
      success: true,
      output: `Executed mock task: ${taskPayload.title || 'Task'}`,
      timestamp: new Date().toISOString(),
    };
  }

  async cancel(sessionId: string): Promise<boolean> {
    const session = this.attachedSessions.get(sessionId);
    if (session) {
      session.cancelStream();
      return true;
    }
    return false;
  }

  async stream(sessionId: string, input: string, options?: SessionStreamOptions): Promise<SessionStreamResult> {
    const session = this.attachedSessions.get(sessionId);
    if (!session) {
      return {
        completed: false,
        cancelled: false,
        output: '',
        errorOutput: `No session attached with ID ${sessionId}`,
        durationMs: 0,
      };
    }
    return session.executeStream(input, options);
  }

  async heartbeat(): Promise<RuntimePluginHealth> {
    return {
      status: this.isInitialized ? 'Healthy' : 'Unavailable',
      metrics: {
        attachedSessionsCount: this.attachedSessions.size,
      },
      lastCheck: new Date().toISOString(),
    };
  }

  async shutdown(): Promise<void> {
    this.attachedSessions.clear();
    this.isInitialized = false;
  }

  capabilities(): RuntimeCapability[] {
    return this.manifest.capabilities;
  }

  metadata(): RuntimePluginManifest {
    return this.manifest;
  }
}
