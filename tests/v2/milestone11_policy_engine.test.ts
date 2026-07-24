import { Kernel } from '../../src/v2/kernel/kernel';
import { ExecutionPolicyEngine } from '../../src/v2/application/policy/execution_policy_engine';
import { CostEstimator } from '../../src/v2/application/policy/cost_estimator';
import { TokenBudgetManager } from '../../src/v2/application/policy/token_budget_manager';
import { PromptCache } from '../../src/v2/application/policy/prompt_cache';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { createFakeClaudeSpawner, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 11 — Execution Policy Engine & Cost Optimization Suite', () => {
  const testDbPath = './se_company_m11_test.db';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  // ─── 1. Execution Profiles ────────────────────────────────────────

  it('should switch execution profiles and configure limits', () => {
    const engine = new ExecutionPolicyEngine();

    const econ = engine.setProfile('Economy');
    expect(econ.name).toBe('Economy');
    expect(econ.maxWorkers).toBe(2);
    expect(econ.maxContextSizeTokens).toBe(2000);
    expect(econ.maxTokenBudget).toBe(5000);
    expect(econ.reviewDepth).toBe('LIGHT');
    expect(econ.maxRetries).toBe(1);
    expect(econ.allowParallelExecution).toBe(false);
    expect(econ.workerPolicy).toBe('SINGLE');

    const perf = engine.setProfile('Performance');
    expect(perf.name).toBe('Performance');
    expect(perf.maxWorkers).toBe(8);
    expect(perf.reviewDepth).toBe('RIGOROUS');
    expect(perf.allowParallelExecution).toBe(true);
    expect(perf.workerPolicy).toBe('MULTI_AGENT');

    const custom = engine.setProfile('Custom');
    expect(custom.name).toBe('Custom');
    expect(custom.workerPolicy).toBe('DEPARTMENT');
  });

  // ─── 2. Cost Estimator ────────────────────────────────────────────

  it('should calculate estimated costs with provider, review, and verification breakdowns', () => {
    const estimator = new CostEstimator();
    const estimate = estimator.estimateMissionCost('mission-cost-01', 5, 15000);

    expect(estimate.missionId).toBe('mission-cost-01');
    expect(estimate.promptTokens).toBeGreaterThan(0);
    expect(estimate.completionTokens).toBeGreaterThan(0);
    expect(estimate.estimatedRuntimeSec).toBe(75); // 5 tasks × 15s
    expect(estimate.expectedWorkerCount).toBe(3);
    expect(estimate.expectedProviderCostUSD).toBeGreaterThan(0);
    expect(estimate.expectedReviewCostUSD).toBe(0.01); // 5 × 0.002
    expect(estimate.expectedVerificationCostUSD).toBe(0.005); // 5 × 0.001
    expect(estimate.cacheSavingsUSD).toBeGreaterThan(0);
    expect(estimate.estimatedCostUSD).toBeLessThan(
      estimate.expectedProviderCostUSD + estimate.expectedReviewCostUSD + estimate.expectedVerificationCostUSD
    );
  });

  // ─── 3. Token Budget Manager (multi-scope) ────────────────────────

  it('should enforce mission token budgets with hard limits', () => {
    const bm = new TokenBudgetManager();
    bm.setMissionBudget('m-01', 5000);

    const r1 = bm.consumeTokens('m-01', 2000);
    expect(r1.exceeded).toBe(false);
    expect(r1.remaining).toBe(3000);

    const r2 = bm.consumeTokens('m-01', 4000);
    expect(r2.exceeded).toBe(true);
    expect(r2.remaining).toBe(0);
  });

  it('should support task, worker, and context budget scopes', () => {
    const bm = new TokenBudgetManager();
    bm.setBudget('TASK', 'task-01', 3000);
    bm.setBudget('WORKER', 'emp-bob', 8000);
    bm.setBudget('CONTEXT', 'ctx-01', 1500);

    const t = bm.consumeTokens('task-01', 1000, 'TASK');
    expect(t.exceeded).toBe(false);
    expect(t.remaining).toBe(2000);

    const w = bm.consumeTokens('emp-bob', 7500, 'WORKER');
    expect(w.exceeded).toBe(false);

    const c = bm.consumeTokens('ctx-01', 2000, 'CONTEXT');
    expect(c.exceeded).toBe(true);
    expect(c.remaining).toBe(0);
  });

  it('should emit warnings at soft-limit threshold and auto-reduce', () => {
    const bm = new TokenBudgetManager();
    bm.setBudget('MISSION', 'm-soft', 10000, 7000, 70);

    const events: string[] = [];
    bm.on('BudgetReduced', () => events.push('BudgetReduced'));
    bm.on('BudgetExceeded', () => events.push('BudgetExceeded'));

    // Consume past soft limit (7000) but under hard (10000)
    const r1 = bm.consumeTokens('m-soft', 8000, 'MISSION');
    expect(r1.warning).toBe(true);
    expect(r1.reduced).toBe(true);
    expect(r1.reductionAmount).toBeGreaterThan(0);
    expect(events).toContain('BudgetReduced');

    // Exceed hard limit
    bm.consumeTokens('m-soft', 5000, 'MISSION');
    expect(events).toContain('BudgetExceeded');
  });

  // ─── 4. Prompt Cache ──────────────────────────────────────────────

  it('should cache prompts and support full invalidation', () => {
    const cache = new PromptCache();

    cache.set('hash-1', 'Response Content 1');
    expect(cache.get('hash-1')).toBe('Response Content 1');
    expect(cache.get('hash-miss')).toBeNull();

    cache.invalidate('MANUAL');
    expect(cache.size()).toBe(0);
    expect(cache.get('hash-1')).toBeNull();
  });

  it('should invalidate cache entries by tag when files/ADRs/missions change', () => {
    const cache = new PromptCache();

    cache.set('h1', 'resp1', ['file:src/main.ts']);
    cache.set('h2', 'resp2', ['file:src/main.ts', 'adr:adr-001']);
    cache.set('h3', 'resp3', ['mission:m-01']);
    expect(cache.size()).toBe(3);

    // Invalidate everything tagged with the changed file
    const removed = cache.invalidateByTag('file:src/main.ts', 'FILE_CHANGE');
    expect(removed).toBe(2);
    expect(cache.size()).toBe(1);
    expect(cache.get('h3')).toBe('resp3');

    // Invalidate mission-scoped entries
    cache.invalidateByTag('mission:m-01', 'MISSION_CHANGE');
    expect(cache.size()).toBe(0);
  });

  it('should emit PromptCacheHit and PromptCacheMiss events', () => {
    const cache = new PromptCache();
    const events: string[] = [];
    cache.on('PromptCacheHit', () => events.push('HIT'));
    cache.on('PromptCacheMiss', () => events.push('MISS'));

    cache.set('k1', 'v1');
    cache.get('k1');  // hit
    cache.get('k2');  // miss

    expect(events).toEqual(['HIT', 'MISS']);
  });

  // ─── 5. Worker Policy Resolution ──────────────────────────────────

  it('should resolve worker policy based on profile and task count', () => {
    const engine = new ExecutionPolicyEngine();
    engine.setProfile('Economy');

    expect(engine.resolveWorkerPolicy(1)).toBe('SINGLE');
    expect(engine.resolveWorkerPolicy(2)).toBe('SINGLE'); // Economy overrides to SINGLE

    engine.setProfile('Performance');
    expect(engine.resolveWorkerPolicy(2)).toBe('PAIR_PROGRAMMING');
    expect(engine.resolveWorkerPolicy(4)).toBe('MULTI_AGENT');
    expect(engine.resolveWorkerPolicy(10)).toBe('DEPARTMENT');
  });

  // ─── 6. Mission Cost Report ───────────────────────────────────────

  it('should finalize mission cost report with savings and utilization', () => {
    const engine = new ExecutionPolicyEngine();
    engine.setProfile('Balanced');
    engine.estimateMissionCost('m-report', 4); // sets budget

    const report = engine.finalizeMissionReport('m-report', 6500);
    expect(report.missionId).toBe('m-report');
    expect(report.estimatedTokens).toBe(15000);
    expect(report.actualTokens).toBe(6500);
    expect(report.estimatedCostUSD).toBeGreaterThan(0);
    expect(report.actualCostUSD).toBeGreaterThan(0);
    expect(report.actualCostUSD).toBeLessThan(report.estimatedCostUSD);
    expect(report.cacheSavingsUSD).toBeGreaterThan(0);
    expect(report.contextSavingsTokens).toBe(1950); // 6500 × 0.3
    expect(report.executionSavingsUSD).toBeGreaterThanOrEqual(0);
    expect(report.workerUtilizationPercent).toBe(88);
  });

  // ─── 7. Domain Event Emission ─────────────────────────────────────

  it('should emit ExecutionProfileSelected, MissionCostEstimated, and MissionCostFinalized events', () => {
    const engine = new ExecutionPolicyEngine();
    const events: string[] = [];

    engine.on('ExecutionProfileSelected', () => events.push('ExecutionProfileSelected'));
    engine.on('MissionCostEstimated', () => events.push('MissionCostEstimated'));
    engine.on('MissionCostFinalized', () => events.push('MissionCostFinalized'));

    engine.setProfile('Performance');
    engine.estimateMissionCost('m-evt', 3);
    engine.finalizeMissionReport('m-evt', 5000);

    expect(events).toEqual(['ExecutionProfileSelected', 'MissionCostEstimated', 'MissionCostFinalized']);
  });

  it('should forward BudgetExceeded and PromptCacheHit/Miss events from child managers', () => {
    const engine = new ExecutionPolicyEngine();
    const events: string[] = [];

    engine.on('BudgetExceeded', () => events.push('BudgetExceeded'));
    engine.on('PromptCacheHit', () => events.push('PromptCacheHit'));
    engine.on('PromptCacheMiss', () => events.push('PromptCacheMiss'));

    // Trigger budget exceeded
    engine.getTokenBudgetManager().setBudget('TASK', 't-99', 100);
    engine.getTokenBudgetManager().consumeTokens('t-99', 200, 'TASK');

    // Trigger cache miss then hit
    engine.getPromptCache().get('nonexistent');
    engine.getPromptCache().set('exists', 'val');
    engine.getPromptCache().get('exists');

    expect(events).toContain('BudgetExceeded');
    expect(events).toContain('PromptCacheMiss');
    expect(events).toContain('PromptCacheHit');
  });

  // ─── 8. CLI Integration ───────────────────────────────────────────

  it('should execute CLI policy subcommands cleanly', async () => {
    const cli = new SeOsCli(createSafeTestProviderOverrides());
    await cli.boot('./non_existent_config.json');
    await cli.policyProfile('Economy');
    await cli.policyEstimate('m-100', 3);
    await cli.policyBudget('m-100');
    await cli.policyReport('m-100', 4500);
    await cli.shutdown();
  });
});
