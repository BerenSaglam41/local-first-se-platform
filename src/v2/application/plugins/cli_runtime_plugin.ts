import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import {
  IRuntimePlugin,
  RuntimePluginManifest,
  RuntimeCapability,
  RuntimeValidationResult,
  RuntimePluginHealth,
  RuntimeConfiguration,
} from '../../contracts/iruntime_plugin_system';
import { IEventStore } from '../../contracts/ievent_store';
import { CliDetector, CliDetectionResult } from './cli_detector';
import { CliProcessSpawner, runCliProcess, defaultCliProcessSpawner, killProcessGroup } from './cli_process_executor';

const DEFAULT_EXECUTION_TIMEOUT_MS = 180000;

export interface CliPromptArgsOptions {
  conversationSessionId?: string;
  resumeConversation?: boolean;
}

export interface CliRuntimePluginConfig {
  /** Manifest id, e.g. 'plugin-codex-cli'. Must match the id workers are assigned to. */
  id: string;
  name: string;
  /** Executable name looked up on $PATH, e.g. 'codex'. */
  command: string;
  /** Env var that can override the executable path, e.g. 'CODEX_PATH'. */
  envVarName?: string;
  versionArgs?: string[];
  /**
   * Builds the CLI args for a given prompt. Defaults to `-p <prompt>` (the convention verified
   * against the real `claude` CLI). Flag conventions for other CLIs vary and cannot be verified
   * here without the binary installed — override per provider once its real flags are known.
   */
  buildArgs?: (prompt: string, opts: CliPromptArgsOptions) => string[];
  capabilities?: RuntimeCapability[];
}

const DEFAULT_CAPABILITIES: RuntimeCapability[] = ['Reasoning', 'Cancellation', 'ToolExecution', 'FileAccess'];

/**
 * Generic, real CLI-backed runtime plugin. One class, many providers: Codex, Gemini,
 * Antigravity, OpenAI, Ollama, or any future CLI just supply a CliRuntimePluginConfig instead of
 * a bespoke plugin class. Detection is always real (CliDetector); execution always really spawns
 * the configured executable and returns its real stdout/stderr/exit code, or an honest failure
 * when the CLI isn't installed. Never fabricates success.
 *
 * Executes at most one request per worker at a time — activeChildProcesses is keyed by workerId,
 * which is safe because WorkerStore/ReasoningCoordinator guarantee a worker never has two
 * concurrent executions (see ADR-0005). There is no session attach/detach and no streaming.
 */
export class CliRuntimePlugin extends EventEmitter implements IRuntimePlugin {
  private activeChildProcesses = new Map<string, ChildProcess>();
  private detector: CliDetector;
  private detectionResult: CliDetectionResult = { available: false };
  private isInitialized = false;
  private spawner: CliProcessSpawner;
  private manifest: RuntimePluginManifest;

  constructor(
    private config: CliRuntimePluginConfig,
    private eventStore?: IEventStore,
    spawner: CliProcessSpawner = defaultCliProcessSpawner,
    detector?: CliDetector
  ) {
    super();
    this.spawner = spawner;
    this.detector = detector || new CliDetector(config.command, config.envVarName, config.versionArgs);
    this.manifest = {
      id: config.id,
      name: config.name,
      version: '1.0.0',
      capabilities: config.capabilities || DEFAULT_CAPABILITIES,
      minKernelVersion: '2.0.0',
      maxKernelVersion: '2.9.9',
      healthCheckSupport: true,
      cancellationSupport: true,
    };
  }

  async initialize(config?: RuntimeConfiguration): Promise<void> {
    const customPath = config?.options?.executablePath || (this.config.envVarName ? config?.environment?.[this.config.envVarName] : undefined);
    this.detectionResult = this.detector.detect(customPath);
    this.isInitialized = true;

    if (!this.detectionResult.available) {
      this.emitEvent('RuntimePluginUnavailable', this.manifest.id, {
        reason: this.detectionResult.error || 'Executable missing',
      });
    }
  }

  async validate(): Promise<RuntimeValidationResult> {
    const warnings: string[] = [];
    if (!this.detectionResult.available) {
      warnings.push(`${this.config.command} CLI not found in system PATH (${this.detectionResult.error})`);
    }
    return { valid: true, errors: [], warnings };
  }

  async execute(taskPayload: Record<string, any>): Promise<Record<string, any>> {
    const prompt = taskPayload.prompt || taskPayload.title || `${this.config.name} Execution Task`;
    const workerId = taskPayload.workerId || 'unknown-worker';
    const timeoutMs = typeof taskPayload.timeoutMs === 'number' ? taskPayload.timeoutMs : DEFAULT_EXECUTION_TIMEOUT_MS;
    const onOutputChunk: ((stream: 'stdout' | 'stderr', chunk: string) => void) | undefined = taskPayload.onOutputChunk;

    this.emitEvent('RuntimeExecutionStarted', this.manifest.id, { workerId, prompt });

    if (!this.detectionResult.available) {
      const error = `${this.config.name} is unavailable: ${this.detectionResult.error || 'executable not detected'}`;
      this.emitEvent('RuntimeExecutionFailed', this.manifest.id, { workerId, prompt, reason: error });
      return { success: false, pluginId: this.manifest.id, prompt, output: '', error, timestamp: new Date().toISOString() };
    }

    const executablePath = this.detectionResult.executablePath || this.config.command;
    const buildArgs = this.config.buildArgs || ((p: string) => ['-p', p]);
    const args = buildArgs(prompt, {
      conversationSessionId: taskPayload.conversationSessionId,
      resumeConversation: !!taskPayload.resumeConversation,
    });

    try {
      const result = await runCliProcess(this.spawner, executablePath, args, timeoutMs, onOutputChunk, (child) =>
        this.activeChildProcesses.set(workerId, child)
      );
      this.activeChildProcesses.delete(workerId);

      this.emitEvent(result.success ? 'RuntimeExecutionCompleted' : 'RuntimeExecutionFailed', this.manifest.id, {
        workerId,
        prompt,
        success: result.success,
        exitCode: result.exitCode,
      });

      return {
        success: result.success,
        pluginId: this.manifest.id,
        prompt,
        output: result.output,
        error: result.success ? undefined : result.errorOutput || `${this.config.command} exited with code ${result.exitCode}`,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      this.activeChildProcesses.delete(workerId);
      const error = err.message || `${this.config.command} execution failed`;
      this.emitEvent('RuntimeExecutionFailed', this.manifest.id, { workerId, prompt, reason: error });
      return { success: false, pluginId: this.manifest.id, prompt, output: '', error, timestamp: new Date().toISOString() };
    }
  }

  async cancel(workerId: string): Promise<boolean> {
    const child = this.activeChildProcesses.get(workerId);
    if (!child) return false;
    killProcessGroup(child, 'SIGKILL');
    this.activeChildProcesses.delete(workerId);
    this.emitEvent('RuntimeExecutionCancelled', this.manifest.id, { workerId });
    return true;
  }

  async heartbeat(): Promise<RuntimePluginHealth> {
    const status = !this.isInitialized ? 'Unavailable' : this.detectionResult.available ? 'Healthy' : 'Degraded';
    return {
      status,
      metrics: {
        cliAvailable: this.detectionResult.available,
        executablePath: this.detectionResult.executablePath || 'none',
        version: this.detectionResult.version || 'unknown',
        activeExecutionsCount: this.activeChildProcesses.size,
      },
      lastCheck: new Date().toISOString(),
    };
  }

  async shutdown(): Promise<void> {
    for (const child of this.activeChildProcesses.values()) {
      killProcessGroup(child, 'SIGKILL');
    }
    this.activeChildProcesses.clear();
    this.isInitialized = false;
  }

  capabilities(): RuntimeCapability[] {
    return this.manifest.capabilities;
  }

  metadata(): RuntimePluginManifest {
    return this.manifest;
  }

  getDetectionResult(): CliDetectionResult {
    return this.detectionResult;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: this.manifest.name,
      payload: { pluginId: this.manifest.id, ...payload },
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
