import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { spawnSync } from 'child_process';
import {
  IRuntimePlugin,
  RuntimePluginManifest,
  RuntimeCapability,
  RuntimeValidationResult,
  RuntimePluginHealth,
  RuntimeConfiguration,
  RuntimeAuthenticationStatus,
} from '../../../contracts/iruntime_plugin_system';
import { IEventStore } from '../../../contracts/ievent_store';
import { ClaudeCliDetector, ClaudeCliDetectionResult } from './claude_cli_detector';
import { CliProcessSpawner, runCliProcess, defaultCliProcessSpawner, killProcessGroup } from '../cli_process_executor';

/** Injectable so callers (and tests) can replace the real OS process spawn with a fake one. */
export type ClaudeProcessSpawner = CliProcessSpawner;

// See ReasoningCoordinator/MissionExecutionOrchestrator (M29.1 Fix #3): real measured Claude Code CLI
// latency for a complex prompt was ~125s. This plugin-level default only applies when a caller
// invokes execute() directly without going through ReasoningCoordinator (which now always passes
// its own, equally-realistic timeoutMs explicitly).
const DEFAULT_EXECUTION_TIMEOUT_MS = 240000;

/**
 * Executes at most one request per worker at a time — activeChildProcesses is keyed by workerId,
 * which is safe because WorkerStore/ReasoningCoordinator guarantee a worker never has two
 * concurrent executions (see ADR-0005). There is no session attach/detach and no streaming: real
 * multi-turn continuity uses the verified --session-id/--resume flags directly via
 * conversationSessionId/resumeConversation on the execute() payload.
 */
export class ClaudeCodeRuntimePlugin extends EventEmitter implements IRuntimePlugin {
  private activeChildProcesses = new Map<string, ChildProcess>();
  private detector: ClaudeCliDetector;
  private detectionResult: ClaudeCliDetectionResult = { available: false };
  private isInitialized = false;
  private spawner: ClaudeProcessSpawner;
  private authenticationCache?: { status: RuntimeAuthenticationStatus; detail?: string; checkedAt: number };

  private manifest: RuntimePluginManifest = {
    id: 'plugin-claude-code',
    name: 'Claude Code CLI Runtime Plugin',
    version: '1.0.0',
    capabilities: ['Reasoning', 'Cancellation', 'ToolExecution', 'FileAccess'],
    minKernelVersion: '2.0.0',
    maxKernelVersion: '2.9.9',
    healthCheckSupport: true,
    cancellationSupport: true,
  };

  constructor(
    private eventStore?: IEventStore,
    spawner: ClaudeProcessSpawner = defaultCliProcessSpawner,
    detector: ClaudeCliDetector = new ClaudeCliDetector()
  ) {
    super();
    this.spawner = spawner;
    this.detector = detector;
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

  async execute(taskPayload: Record<string, any>): Promise<Record<string, any>> {
    const prompt = taskPayload.prompt || taskPayload.title || 'Claude Execution Task';
    const workerId = taskPayload.workerId || 'unknown-worker';
    const timeoutMs =
      typeof taskPayload.timeoutMs === 'number' ? taskPayload.timeoutMs : DEFAULT_EXECUTION_TIMEOUT_MS;
    const onOutputChunk: ((stream: 'stdout' | 'stderr', chunk: string) => void) | undefined =
      taskPayload.onOutputChunk;

    // Real multi-turn memory: the actual claude CLI supports --session-id/--resume even in
    // non-interactive --print mode (verified: `claude --help`).
    const conversationSessionId: string | undefined = taskPayload.conversationSessionId;
    const isResume: boolean = !!taskPayload.resumeConversation;

    this.emitEvent('RuntimeExecutionStarted', this.manifest.id, { workerId, prompt });

    if (!this.detectionResult.available) {
      const error = `Claude Code CLI is unavailable: ${this.detectionResult.error || 'executable not detected'}`;
      this.emitEvent('RuntimeExecutionFailed', this.manifest.id, { workerId, prompt, reason: error });
      return {
        success: false,
        pluginId: this.manifest.id,
        prompt,
        output: '',
        error,
        timestamp: new Date().toISOString(),
      };
    }

    const executablePath = this.detectionResult.executablePath || 'claude';
    const args = ['-p', prompt];
    if (conversationSessionId) {
      args.push(isResume ? '--resume' : '--session-id', conversationSessionId);
    }

    try {
      const result = await runCliProcess(this.spawner, executablePath, args, timeoutMs, onOutputChunk, (child) =>
        this.activeChildProcesses.set(workerId, child)
      , { cwd: taskPayload.workspacePath });
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
        error: result.success ? undefined : result.errorOutput || `Claude CLI exited with code ${result.exitCode}`,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        conversationSessionId,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      this.activeChildProcesses.delete(workerId);
      const error = err.message || 'Claude CLI execution failed';
      this.emitEvent('RuntimeExecutionFailed', this.manifest.id, { workerId, prompt, reason: error });
      return {
        success: false,
        pluginId: this.manifest.id,
        prompt,
        output: '',
        error,
        timestamp: new Date().toISOString(),
      };
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
    const isHealthy = this.isInitialized;
    const status = isHealthy ? (this.detectionResult.available ? 'Healthy' : 'Degraded') : 'Unavailable';

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

  getDetectionResult(): ClaudeCliDetectionResult {
    return this.detectionResult;
  }

  authenticationStatus(): { status: RuntimeAuthenticationStatus; detail?: string } {
    if (!this.detectionResult.available) return { status: 'NOT_AUTHENTICATED', detail: 'CLI not installed' };
    const now = Date.now();
    if (this.authenticationCache && now - this.authenticationCache.checkedAt < 10000) return this.authenticationCache;
    try {
      const result = spawnSync(this.detectionResult.executablePath || 'claude', ['auth', 'status'], {
        encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const output = `${result.stdout || ''}\n${result.stderr || ''}`;
      let loggedIn = false;
      try { loggedIn = !!JSON.parse(result.stdout || '{}').loggedIn; } catch { loggedIn = /logged\s*in|authenticated|signed\s*in/i.test(output); }
      this.authenticationCache = {
        status: result.error ? 'UNKNOWN' : loggedIn ? 'AUTHENTICATED' : 'NOT_AUTHENTICATED',
        detail: output.trim().split('\n')[0]?.slice(0, 160), checkedAt: now,
      };
      return this.authenticationCache;
    } catch (error: any) {
      this.authenticationCache = { status: 'UNKNOWN', detail: error?.message || 'Could not inspect Claude login state', checkedAt: now };
      return this.authenticationCache;
    }
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
