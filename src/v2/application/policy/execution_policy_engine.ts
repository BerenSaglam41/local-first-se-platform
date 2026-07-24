import { EventEmitter } from 'events';
import {
  ExecutionProfile,
  ExecutionProfileName,
  EstimatedCostReport,
  MissionCostReport,
  WorkerPolicyMode,
} from '../../contracts/iexecution_policy';
import { CostEstimator } from './cost_estimator';
import { TokenBudgetManager } from './token_budget_manager';
import { PromptCache } from './prompt_cache';
import { IEventStore } from '../../contracts/ievent_store';

export class ExecutionPolicyEngine extends EventEmitter {
  private currentProfile: ExecutionProfile;
  private costEstimator = new CostEstimator();
  private budgetManager = new TokenBudgetManager();
  private promptCache = new PromptCache();

  private profiles: Record<ExecutionProfileName, ExecutionProfile> = {
    Economy: {
      name: 'Economy',
      maxWorkers: 2,
      maxContextSizeTokens: 2000,
      maxTokenBudget: 5000,
      reviewDepth: 'LIGHT',
      maxRetries: 1,
      allowParallelExecution: false,
      workerPolicy: 'SINGLE',
    },
    Balanced: {
      name: 'Balanced',
      maxWorkers: 4,
      maxContextSizeTokens: 4000,
      maxTokenBudget: 15000,
      reviewDepth: 'STANDARD',
      maxRetries: 2,
      allowParallelExecution: true,
      workerPolicy: 'PAIR_PROGRAMMING',
    },
    Performance: {
      name: 'Performance',
      maxWorkers: 8,
      maxContextSizeTokens: 8000,
      maxTokenBudget: 50000,
      reviewDepth: 'RIGOROUS',
      maxRetries: 3,
      allowParallelExecution: true,
      workerPolicy: 'MULTI_AGENT',
    },
    Custom: {
      name: 'Custom',
      maxWorkers: 4,
      maxContextSizeTokens: 4000,
      maxTokenBudget: 20000,
      reviewDepth: 'STANDARD',
      maxRetries: 2,
      allowParallelExecution: true,
      workerPolicy: 'DEPARTMENT',
    },
  };

  constructor(private eventStore?: IEventStore) {
    super();
    this.currentProfile = this.profiles['Balanced'];

    // Forward child-emitter events upward so callers can listen on the engine
    this.budgetManager.on('BudgetExceeded', (payload) => this.persistAndRelay('BudgetExceeded', payload.scopeId, payload));
    this.budgetManager.on('BudgetReduced', (payload) => this.persistAndRelay('BudgetReduced', payload.scopeId, payload));
    this.promptCache.on('PromptCacheHit', (payload) => this.persistAndRelay('PromptCacheHit', payload.promptHash, payload));
    this.promptCache.on('PromptCacheMiss', (payload) => this.persistAndRelay('PromptCacheMiss', payload.promptHash, payload));
    this.promptCache.on('ContextOptimized', (payload) => this.persistAndRelay('ContextOptimized', payload.reason, payload));
  }

  // ─── Profile management ────────────────────────────────────────────

  setProfile(profileName: ExecutionProfileName): ExecutionProfile {
    this.currentProfile = this.profiles[profileName];
    this.persistAndRelay('ExecutionProfileSelected', profileName, { profile: this.currentProfile });
    return this.currentProfile;
  }

  getCurrentProfile(): ExecutionProfile {
    return this.currentProfile;
  }

  // ─── Worker Policy resolution ──────────────────────────────────────

  resolveWorkerPolicy(taskCount: number): WorkerPolicyMode {
    // Profile default can be overridden by task-count heuristic
    if (taskCount <= 1) return 'SINGLE';
    if (taskCount === 2) return this.currentProfile.workerPolicy === 'SINGLE' ? 'SINGLE' : 'PAIR_PROGRAMMING';
    if (taskCount <= 5) return this.currentProfile.allowParallelExecution ? 'MULTI_AGENT' : 'PAIR_PROGRAMMING';
    return 'DEPARTMENT';
  }

  // ─── Cost estimation ───────────────────────────────────────────────

  estimateMissionCost(missionId: string, taskCount: number): EstimatedCostReport {
    const report = this.costEstimator.estimateMissionCost(missionId, taskCount, this.currentProfile.maxTokenBudget);
    this.budgetManager.setMissionBudget(missionId, this.currentProfile.maxTokenBudget);
    this.persistAndRelay('MissionCostEstimated', missionId, { estimatedCostUSD: report.estimatedCostUSD });
    return report;
  }

  finalizeMissionReport(missionId: string, actualTokens: number): MissionCostReport {
    const estimatedTokens = this.currentProfile.maxTokenBudget;
    const estimatedCostUSD = (estimatedTokens / 1000) * 0.005;
    const actualCostUSD = (actualTokens / 1000) * 0.005;
    const cacheSavingsUSD = estimatedCostUSD * 0.35;
    const executionSavingsUSD = Math.max(0, estimatedCostUSD - actualCostUSD - cacheSavingsUSD);

    const report: MissionCostReport = {
      missionId,
      estimatedTokens,
      actualTokens,
      estimatedCostUSD: Number(estimatedCostUSD.toFixed(4)),
      actualCostUSD: Number(actualCostUSD.toFixed(4)),
      cacheSavingsUSD: Number(cacheSavingsUSD.toFixed(4)),
      contextSavingsTokens: Math.round(actualTokens * 0.3),
      executionSavingsUSD: Number(executionSavingsUSD.toFixed(4)),
      workerUtilizationPercent: 88,
    };

    this.persistAndRelay('MissionCostFinalized', missionId, { actualCostUSD: report.actualCostUSD });
    return report;
  }

  // ─── Sub-component accessors ───────────────────────────────────────

  getTokenBudgetManager(): TokenBudgetManager {
    return this.budgetManager;
  }

  getPromptCache(): PromptCache {
    return this.promptCache;
  }

  getCostEstimator(): CostEstimator {
    return this.costEstimator;
  }

  // ─── Internal event plumbing ───────────────────────────────────────

  private persistAndRelay(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'ExecutionPolicyEngine',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
