import { EventEmitter } from 'events';
import {
  ReasoningRequest,
  ReasoningResponse,
  ReasoningResult,
  ReasoningPolicy,
} from '../../contracts/ireasoning_pipeline';
import { IRuntimeSelectionStrategy } from '../../contracts/iruntime_selection_strategy';
import { DefaultRuntimeSelectionStrategy } from './runtime_selection_strategy';
import { RuntimePluginSystemManager } from '../plugins/runtime_plugin_system_manager';
import { RuntimeSessionManager } from '../session/runtime_session_manager';
import { IEventStore } from '../../contracts/ievent_store';
import { SessionStreamOptions } from '../../contracts/iruntime_session';

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
    private sessionManager: RuntimeSessionManager,
    private eventStore?: IEventStore,
    selectionStrategy?: IRuntimeSelectionStrategy
  ) {
    super();
    this.selectionStrategy =
      selectionStrategy || new DefaultRuntimeSelectionStrategy(pluginSystemManager);
  }

  async requestReasoning(
    request: ReasoningRequest,
    streamOptions?: SessionStreamOptions
  ): Promise<ReasoningResult> {
    if (this.activeRequests.size >= this.defaultPolicy.maxConcurrentRequests) {
      const err = `Reasoning concurrency limit reached (${this.defaultPolicy.maxConcurrentRequests})`;
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

    const session = this.sessionManager.getOrCreateSessionForWorker(request.workerId);
    await plugin.attachSession(session);

    this.emitEvent('ReasoningStarted', request.requestId, {
      pluginId: plugin.metadata().id,
      sessionId: session.sessionId,
    });

    const startTime = Date.now();
    const timeoutMs = request.timeoutMs || this.defaultPolicy.maxTimeoutMs;

    try {
      if (request.streaming && streamOptions) {
        const streamRes = await plugin.stream(session.sessionId, request.goal, {
          ...streamOptions,
          timeoutMs,
        });

        const durationMs = Date.now() - startTime;
        this.activeRequests.delete(request.requestId);

        if (streamRes.cancelled) {
          this.emitEvent('ReasoningCancelled', request.requestId, { durationMs });
          return {
            success: false,
            error: 'Reasoning stream was cancelled',
          };
        }

        const response: ReasoningResponse = {
          requestId: request.requestId,
          responseText: streamRes.output,
          structuredOutput: { output: streamRes.output },
          executionMetadata: {
            pluginId: plugin.metadata().id,
            sessionId: session.sessionId,
            durationMs,
            tokenUsage: Math.ceil(streamRes.output.length / 4),
          },
          warnings: streamRes.errorOutput ? [streamRes.errorOutput] : [],
          errors: [],
        };

        this.emitEvent('ReasoningCompleted', request.requestId, {
          durationMs,
          pluginId: plugin.metadata().id,
        });
        return { success: true, response };
      } else {
        const execRes = await plugin.execute({
          title: request.goal,
          prompt: request.goal,
          context: request.context,
          sessionId: session.sessionId,
        });

        const durationMs = Date.now() - startTime;
        this.activeRequests.delete(request.requestId);

        const response: ReasoningResponse = {
          requestId: request.requestId,
          responseText: execRes.output || 'Reasoning completed',
          structuredOutput: execRes,
          executionMetadata: {
            pluginId: plugin.metadata().id,
            sessionId: session.sessionId,
            durationMs,
            tokenUsage: execRes.output ? Math.ceil(execRes.output.length / 4) : 100,
          },
          warnings: [],
          errors: execRes.success ? [] : [execRes.error || 'Execution error'],
        };

        this.emitEvent('ReasoningCompleted', request.requestId, {
          durationMs,
          pluginId: plugin.metadata().id,
        });
        return { success: true, response };
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.activeRequests.delete(request.requestId);

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
