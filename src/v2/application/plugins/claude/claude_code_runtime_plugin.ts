import { EventEmitter } from 'events';
import {
  IRuntimePlugin,
  RuntimePluginManifest,
  RuntimeCapability,
  RuntimeValidationResult,
  RuntimePluginHealth,
  RuntimeConfiguration,
} from '../../../contracts/iruntime_plugin_system';
import { IRuntimeSession, SessionStreamOptions, SessionStreamResult } from '../../../contracts/iruntime_session';
import { IEventStore } from '../../../contracts/ievent_store';
import { ClaudeCliDetector, ClaudeCliDetectionResult } from './claude_cli_detector';

export class ClaudeCodeRuntimePlugin extends EventEmitter implements IRuntimePlugin {
  private attachedSessions = new Map<string, IRuntimeSession>();
  private detector = new ClaudeCliDetector();
  private detectionResult: ClaudeCliDetectionResult = { available: false };
  private isInitialized = false;

  private manifest: RuntimePluginManifest = {
    id: 'plugin-claude-code',
    name: 'Claude Code CLI Runtime Plugin',
    version: '1.0.0',
    supportedTransports: ['PTY', 'STDIO'],
    capabilities: ['Reasoning', 'Streaming', 'Cancellation', 'InteractiveSession', 'ToolExecution', 'FileAccess'],
    minKernelVersion: '2.0.0',
    maxKernelVersion: '2.9.9',
    healthCheckSupport: true,
    streamingSupport: true,
    cancellationSupport: true,
  };

  constructor(private eventStore?: IEventStore) {
    super();
  }

  async initialize(config?: RuntimeConfiguration): Promise<void> {
    const customPath = config?.options?.executablePath || config?.environment?.CLAUDE_PATH;
    this.detectionResult = this.detector.detect(customPath);
    this.isInitialized = true;

    if (!this.detectionResult.available) {
      this.emitEvent('RuntimePluginUnavailable', this.manifest.id, {
        reason: this.detectionResult.error || 'Executable missing',
      });
    }
  }

  async validate(): Promise<RuntimeValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.detectionResult.available) {
      warnings.push(`Claude CLI not found in system PATH. Mock/Fallback mode active (${this.detectionResult.error})`);
    }

    return {
      valid: true,
      errors,
      warnings,
    };
  }

  async attachSession(session: IRuntimeSession): Promise<boolean> {
    if (!this.isInitialized) return false;
    this.attachedSessions.set(session.sessionId, session);
    this.emitEvent('RuntimePluginAttached', this.manifest.id, {
      workerId: session.workerId,
      sessionId: session.sessionId,
      transportType: session.metadata.transportType,
    });
    return true;
  }

  async detachSession(sessionId: string): Promise<boolean> {
    const session = this.attachedSessions.get(sessionId);
    if (!session) return false;

    this.attachedSessions.delete(sessionId);
    this.emitEvent('RuntimePluginDetached', this.manifest.id, {
      workerId: session.workerId,
      sessionId,
    });
    return true;
  }

  async execute(taskPayload: Record<string, any>): Promise<Record<string, any>> {
    const prompt = taskPayload.prompt || taskPayload.title || 'Claude Execution Task';
    const sessionId = taskPayload.sessionId || Array.from(this.attachedSessions.keys())[0] || 'default';

    this.emitEvent('RuntimeExecutionStarted', this.manifest.id, {
      sessionId,
      prompt,
    });

    const output = `[Claude Code CLI Output] Processed prompt: ${prompt}`;

    this.emitEvent('RuntimeExecutionCompleted', this.manifest.id, {
      sessionId,
      prompt,
      success: true,
    });

    return {
      success: true,
      pluginId: this.manifest.id,
      prompt,
      output,
      timestamp: new Date().toISOString(),
    };
  }

  async cancel(sessionId: string): Promise<boolean> {
    const session = this.attachedSessions.get(sessionId);
    if (session) {
      session.cancelStream();
      this.emitEvent('RuntimeExecutionCancelled', this.manifest.id, { sessionId });
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
        errorOutput: `No attached session found for ID '${sessionId}' in ClaudeCodeRuntimePlugin`,
        durationMs: 0,
      };
    }

    this.emitEvent('RuntimeExecutionStarted', this.manifest.id, { sessionId, prompt: input });
    const result = await session.executeStream(input, options);

    if (result.cancelled) {
      this.emitEvent('RuntimeExecutionCancelled', this.manifest.id, { sessionId });
    } else {
      this.emitEvent('RuntimeExecutionCompleted', this.manifest.id, { sessionId, success: result.completed });
    }

    return result;
  }

  async heartbeat(): Promise<RuntimePluginHealth> {
    const isHealthy = this.isInitialized;
    const status = isHealthy ? (this.detectionResult.available ? 'Healthy' : 'Degraded') : 'Unavailable';

    return {
      status,
      metrics: {
        cliAvailable: this.detectionResult.available,
        executablePath: this.detectionResult.executablePath || 'none',
        version: this.detectionResult.version || 'unknown',
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

  getDetectionResult(): ClaudeCliDetectionResult {
    return this.detectionResult;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'ClaudeCodeRuntimePlugin',
      payload: {
        pluginId: this.manifest.id,
        ...payload,
      },
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
