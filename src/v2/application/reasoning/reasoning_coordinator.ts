import { EventEmitter } from 'events';
import {
  ReasoningRequest,
  ReasoningResponse,
  ReasoningResult,
  ReasoningPolicy,
} from '../../contracts/ireasoning_pipeline';
import { IRuntimeSelectionStrategy } from '../../contracts/iruntime_selection_strategy';
import { WorkerAwareRuntimeSelectionStrategy } from './worker_aware_runtime_selection_strategy';
import { RuntimePluginSystemManager } from '../plugins/runtime_plugin_system_manager';
import { WorkerStore } from '../worker/worker_store';
import { IEventStore } from '../../contracts/ievent_store';
import { WorkerTerminalLog } from '../worker/worker_terminal_log';

/**
 * Executes real reasoning requests through whichever plugin is assigned to the request's worker.
 * At most one request per real, registered worker runs at a time — enforced by Worker.
 * beginExecution() itself (see ADR-0005), not just by callers being careful. Ad-hoc planning
 * reasoning (workerId not present in WorkerStore, e.g. AutonomousPlanner's 'emp-planner') passes
 * through ungated: it isn't "an employee executing a task," so the single-flight guarantee
 * doesn't apply to it.
 */
export class ReasoningCoordinator extends EventEmitter {
  private selectionStrategy: IRuntimeSelectionStrategy;
  private activeRequests = new Map<string, ReasoningRequest>();
  private defaultPolicy: ReasoningPolicy = {
    maxTimeoutMs: 60000,
    maxConcurrentRequests: 5,
    retryCount: 2,
    backoffMs: 500,
  };

  constructor(
    private pluginSystemManager: RuntimePluginSystemManager,
    private workerStore: WorkerStore,
    private eventStore?: IEventStore,
    selectionStrategy?: IRuntimeSelectionStrategy,
    private terminalLog?: WorkerTerminalLog
  ) {
    super();
    this.selectionStrategy = selectionStrategy || new WorkerAwareRuntimeSelectionStrategy(pluginSystemManager, workerStore);
  }

  /** Real cancellation: kills the worker's actual in-flight process via the owning plugin. */
  async cancelForWorker(workerId: string): Promise<boolean> {
    const worker = this.workerStore.get(workerId);
    const execution = worker?.activeExecution;
    if (!worker || !execution) return false;

    const plugin = this.pluginSystemManager.getPlugin(execution.pluginId);
    await plugin?.cancel(workerId);

    this.activeRequests.delete(execution.requestId);
    worker.completeExecution('INTERRUPTED', {
      durationMs: Date.now() - new Date(execution.startedAt).getTime(),
    });
    this.terminalLog?.writeLine(workerId, `\n[${new Date().toISOString()}] ^C interrupted by user`);
    this.emitEvent('ReasoningCancelled', execution.requestId, { workerId });
    return true;
  }

  getActiveExecutionForWorker(workerId: string) {
    return this.workerStore.get(workerId)?.activeExecution;
  }

  async requestReasoning(request: ReasoningRequest): Promise<ReasoningResult> {
    if (this.activeRequests.size >= this.defaultPolicy.maxConcurrentRequests) {
      const err = `Reasoning concurrency limit reached (${this.defaultPolicy.maxConcurrentRequests})`;
      this.emitEvent('ReasoningFailed', request.requestId, { reason: err });
      return { success: false, error: err };
    }

    const worker = this.workerStore.get(request.workerId);
    if (worker?.isBusy) {
      const err = `Worker '${request.workerId}' is already executing task '${worker.activeExecution!.taskId}' — cannot start a concurrent request.`;
      this.emitEvent('ReasoningFailed', request.requestId, { reason: err });
      return { success: false, error: err };
    }

    this.activeRequests.set(request.requestId, request);
    this.emitEvent('ReasoningRequested', request.requestId, {
      missionId: request.missionId,
      workerId: request.workerId,
      goal: request.goal,
    });

    const plugin = await this.selectionStrategy.selectPlugin('Reasoning', request);
    if (!plugin) {
      this.activeRequests.delete(request.requestId);
      const err = 'No active Runtime Plugin found with capability Reasoning';
      this.emitEvent('ReasoningFailed', request.requestId, { reason: err });
      return { success: false, error: err };
    }

    const startedAt = new Date().toISOString();
    if (worker) {
      worker.beginExecution({
        executionId: `exec-${request.requestId}`,
        requestId: request.requestId,
        taskId: request.taskId || request.requestId,
        goal: request.goal,
        pluginId: plugin.metadata().id,
        startedAt,
      });
    }

    this.emitEvent('ReasoningStarted', request.requestId, {
      pluginId: plugin.metadata().id,
      workerId: request.workerId,
    });
    // Not the real invoked command line — each provider builds its own CLI args (see
    // CliRuntimePluginConfig.buildArgs), which isn't threaded back out of the plugin today.
    this.terminalLog?.writeLine(
      request.workerId,
      `[${startedAt}] ${plugin.metadata().name} <- "${request.goal.slice(0, 160).replace(/\n/g, ' ')}"`
    );

    const startTime = Date.now();
    const timeoutMs = request.timeoutMs || this.defaultPolicy.maxTimeoutMs;

    try {
      const execRes = await plugin.execute({
        title: request.goal,
        prompt: request.goal,
        context: request.context,
        workerId: request.workerId,
        timeoutMs,
        conversationSessionId: request.context?.conversationSessionId,
        resumeConversation: request.context?.resumeConversation,
        onOutputChunk: (_stream: 'stdout' | 'stderr', chunk: string) =>
          this.terminalLog?.append(request.workerId, chunk),
      });

      const durationMs = Date.now() - startTime;
      this.activeRequests.delete(request.requestId);
      this.terminalLog?.writeLine(
        request.workerId,
        `\n[exit ${execRes.exitCode ?? (execRes.success ? 0 : 1)}] duration=${durationMs}ms`
      );

      const tokenUsage = execRes.output ? Math.ceil(execRes.output.length / 4) : 100;
      const response: ReasoningResponse = {
        requestId: request.requestId,
        responseText: execRes.output || 'Reasoning completed',
        structuredOutput: execRes,
        executionMetadata: {
          pluginId: plugin.metadata().id,
          workerId: request.workerId,
          durationMs,
          tokenUsage,
        },
        warnings: [],
        errors: execRes.success ? [] : [execRes.error || 'Execution error'],
      };

      worker?.completeExecution(execRes.success ? 'COMPLETED' : 'FAILED', { durationMs, tokenUsage });

      this.emitEvent(execRes.success ? 'ReasoningCompleted' : 'ReasoningFailed', request.requestId, {
        durationMs,
        pluginId: plugin.metadata().id,
        reason: execRes.success ? undefined : response.errors[0],
      });
      // Honest by construction: `success` here must mean the underlying provider genuinely
      // produced a usable result, matching what worker?.completeExecution() two lines above
      // already correctly determines — not merely "the request reached a plugin without
      // throwing." Previously this was unconditionally `true`, so a provider that failed (CLI
      // unavailable, timed out, non-zero exit) was still reported as a successful reasoning
      // result to every caller, silently turning a real failure into a fabricated success
      // further up the stack (see M29.1 Fix #1 / ADR-0009).
      return { success: execRes.success, response, error: execRes.success ? undefined : response.errors[0] };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.activeRequests.delete(request.requestId);
      worker?.completeExecution('FAILED', { durationMs });

      if (err.message && err.message.includes('timeout')) {
        this.emitEvent('ReasoningTimedOut', request.requestId, { timeoutMs, durationMs });
      } else {
        this.emitEvent('ReasoningFailed', request.requestId, { reason: err.message });
      }

      return {
        success: false,
        error: err.message || 'Unknown reasoning failure',
      };
    }
  }

  cancelReasoning(requestId: string): boolean {
    const req = this.activeRequests.get(requestId);
    if (req) {
      this.activeRequests.delete(requestId);
      this.emitEvent('ReasoningCancelled', requestId, {});
      return true;
    }
    return false;
  }

  setSelectionStrategy(strategy: IRuntimeSelectionStrategy): void {
    this.selectionStrategy = strategy;
  }

  getSelectionStrategy(): IRuntimeSelectionStrategy {
    return this.selectionStrategy;
  }

  getActiveRequestsCount(): number {
    return this.activeRequests.size;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'ReasoningCoordinator',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
