import { GoalAnalyzer } from '../../src/v2/application/planning/goal_analyzer';
import { ArchitecturePlanner } from '../../src/v2/application/planning/architecture_planner';
import { DependencyAnalyzer } from '../../src/v2/application/planning/dependency_analyzer';
import { RiskAnalyzer } from '../../src/v2/application/planning/risk_analyzer';
import { ComplexityEstimator } from '../../src/v2/application/planning/complexity_estimator';
import { ExecutionStrategyPlanner } from '../../src/v2/application/planning/execution_strategy_planner';
import { PlanGenerator } from '../../src/v2/application/planning/plan_generator';
import { AutonomousPlanner } from '../../src/v2/application/planning/autonomous_planner';
import { PromptCache } from '../../src/v2/application/policy/prompt_cache';
import { ExecutionPolicyEngine } from '../../src/v2/application/policy/execution_policy_engine';
import { DepartmentOrchestrator } from '../../src/v2/application/organization/department_orchestrator';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { BusinessGoal, AnalyzedGoal, PlanningSource } from '../../src/v2/contracts/iplanning_engine';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 12 — Autonomous Planning & Reasoning Engine Suite', () => {
  const jwtGoal: BusinessGoal = {
    title: 'Implement JWT Authentication',
    description: 'Add JWT-based authentication with login, signup, token refresh, and role-based access control for the REST API',
  };

  const simpleGoal: BusinessGoal = {
    title: 'Add health check endpoint',
    description: 'Implement a simple API health check endpoint returning server status',
  };

  // ─── 1. Goal Analysis ──────────────────────────────────────────

  it('should analyze a business goal into structured objectives via rule engine', async () => {
    const analyzer = new GoalAnalyzer();
    const result = await analyzer.analyze(jwtGoal);

    expect(result.planningSource).toBe('RULE_ENGINE');
    expect(result.businessObjective).toBe('Implement JWT Authentication');
    expect(result.affectedModules).toContain('auth');
    expect(result.affectedModules).toContain('api');
    expect(result.affectedModules).toContain('security');
    expect(result.dependencies.length).toBeGreaterThan(0);
    expect(result.acceptanceCriteria.length).toBeGreaterThanOrEqual(3);
    expect(result.confidence).toBeGreaterThan(0);
  });

  // ─── 2. Goal Analysis — Cache Reuse ────────────────────────────

  it('should return CACHE source when identical goal is analyzed twice', async () => {
    const cache = new PromptCache();
    const analyzer = new GoalAnalyzer(cache);

    const first = await analyzer.analyze(jwtGoal);
    expect(first.planningSource).toBe('RULE_ENGINE');

    const second = await analyzer.analyze(jwtGoal);
    expect(second.planningSource).toBe('CACHE');
  });

  // ─── 3. Architecture Planning ──────────────────────────────────

  it('should generate architecture decisions with rule-based patterns', async () => {
    const analyzer = new GoalAnalyzer();
    const analyzed = await analyzer.analyze(jwtGoal);

    const planner = new ArchitecturePlanner();
    const decisions = await planner.plan(analyzed);

    expect(decisions.length).toBeGreaterThan(0);
    const authDecision = decisions.find(d => d.title.includes('auth'));
    expect(authDecision).toBeDefined();
    expect(authDecision!.pattern).toBe('Middleware + Token Service');
    expect(authDecision!.planningSource).toBe('RULE_ENGINE');
    expect(authDecision!.components.length).toBeGreaterThan(0);
  });

  // ─── 4. Architecture Planning — Cache Reuse ────────────────────

  it('should return CACHE source when same architecture is planned twice', async () => {
    const cache = new PromptCache();
    const analyzer = new GoalAnalyzer(cache);
    const analyzed = await analyzer.analyze(jwtGoal);

    const planner = new ArchitecturePlanner(cache);
    const first = await planner.plan(analyzed);
    expect(first[0].planningSource).toBe('RULE_ENGINE');

    const second = await planner.plan(analyzed);
    expect(second[0].planningSource).toBe('CACHE');
  });

  // ─── 5. Dependency Analysis ────────────────────────────────────

  it('should identify module ownership, cross-deps, and external libraries', async () => {
    const analyzer = new GoalAnalyzer();
    const analyzed = await analyzer.analyze(jwtGoal);
    const deps = new DependencyAnalyzer().analyze(analyzed);

    expect(deps.planningSource).toBe('RULE_ENGINE');
    expect(deps.entries.length).toBeGreaterThan(0);
    expect(deps.externalLibraries.length).toBeGreaterThan(0);
    const authEntry = deps.entries.find(e => e.module === 'auth');
    expect(authEntry).toBeDefined();
    expect(authEntry!.owner).toBe('Backend');
    expect(authEntry!.dependsOn.length).toBeGreaterThan(0);
  });

  // ─── 6. Risk Analysis ─────────────────────────────────────────

  it('should identify risks with severity, probability, and mitigation', async () => {
    const analyzer = new GoalAnalyzer();
    const analyzed = await analyzer.analyze(jwtGoal);
    const deps = new DependencyAnalyzer().analyze(analyzed);
    const risks = new RiskAnalyzer().analyze(analyzed, deps);

    expect(risks.planningSource).toBe('RULE_ENGINE');
    expect(risks.risks.length).toBeGreaterThan(0);
    expect(risks.overallRiskScore).toBeGreaterThan(0);

    const securityRisk = risks.risks.find(r => r.category === 'Security' && r.severity === 'CRITICAL');
    expect(securityRisk).toBeDefined();
    expect(securityRisk!.severity).toBe('CRITICAL');
    expect(securityRisk!.mitigation.length).toBeGreaterThan(0);
  });

  // ─── 7. Complexity Estimation ──────────────────────────────────

  it('should estimate complexity with confidence score and CostEstimator integration', async () => {
    const analyzer = new GoalAnalyzer();
    const analyzed = await analyzer.analyze(jwtGoal);
    const deps = new DependencyAnalyzer().analyze(analyzed);
    const risks = new RiskAnalyzer().analyze(analyzed, deps);
    const complexity = new ComplexityEstimator().estimate(analyzed, risks);

    expect(complexity.planningSource).toBe('RULE_ENGINE');
    expect(complexity.overallComplexity).toBeGreaterThan(0);
    expect(complexity.confidence).toBeGreaterThan(0);
    expect(complexity.confidence).toBeLessThanOrEqual(100);
    expect(complexity.estimatedWorkers).toBeGreaterThan(0);
    expect(complexity.estimatedRuntimeSec).toBeGreaterThan(0);
    expect(complexity.estimatedTokens).toBeGreaterThan(0);
    expect(complexity.implementationComplexity).toBeGreaterThan(0);
    expect(complexity.testingComplexity).toBeGreaterThan(0);
  });

  // ─── 8. Execution Strategy ─────────────────────────────────────

  it('should select worker policy and departments via policy engine', async () => {
    const policyEngine = new ExecutionPolicyEngine();
    policyEngine.setProfile('Performance');
    const deptOrch = new DepartmentOrchestrator();

    const analyzer = new GoalAnalyzer();
    const analyzed = await analyzer.analyze(jwtGoal);
    const deps = new DependencyAnalyzer().analyze(analyzed);
    const risks = new RiskAnalyzer().analyze(analyzed, deps);
    const complexity = new ComplexityEstimator().estimate(analyzed, risks);

    const strategy = new ExecutionStrategyPlanner(policyEngine, deptOrch).plan(complexity, analyzed.affectedModules);

    expect(strategy.planningSource).toBe('RULE_ENGINE');
    expect(strategy.departments.length).toBeGreaterThan(0);
    expect(strategy.departments).toContain('dept-backend');
    expect(['SINGLE', 'PAIR_PROGRAMMING', 'MULTI_AGENT', 'DEPARTMENT']).toContain(strategy.workerPolicy);
    expect(strategy.estimatedCostUSD).toBeGreaterThan(0);
  });

  // ─── 9. Plan Generation ────────────────────────────────────────

  it('should generate epics, features, and tasks with DAG dependencies', async () => {
    const analyzer = new GoalAnalyzer();
    const analyzed = await analyzer.analyze(jwtGoal);
    const strategy = { goalId: analyzed.goalId, workerPolicy: 'MULTI_AGENT' as const, departments: ['dept-backend'], estimatedCostUSD: 0.05, estimatedRuntimeSec: 60, estimatedTokens: 8000, planningSource: 'RULE_ENGINE' as PlanningSource };

    const { epics, features, tasks } = new PlanGenerator().generate(analyzed, strategy);

    expect(epics.length).toBeGreaterThanOrEqual(3); // arch + impl + test + review
    expect(features.length).toBeGreaterThan(0);
    expect(tasks.length).toBeGreaterThanOrEqual(4); // arch + modules + test + review

    // Architecture task has no dependencies (root)
    const archTask = tasks.find(t => t.id.includes('arch'));
    expect(archTask).toBeDefined();
    expect(archTask!.dependsOn).toEqual([]);

    // Implementation tasks depend on architecture
    const implTasks = tasks.filter(t => t.priority === 'P1' && !t.id.includes('test'));
    for (const t of implTasks) {
      expect(t.dependsOn).toContain(archTask!.id);
    }

    // Review task depends on test task
    const reviewTask = tasks.find(t => t.id.includes('review'));
    const testTask = tasks.find(t => t.id.includes('test'));
    expect(reviewTask).toBeDefined();
    expect(reviewTask!.dependsOn).toContain(testTask!.id);
  });

  // ─── 10. Full Pipeline ─────────────────────────────────────────

  it('should produce a complete MissionPlan from a business goal with planningSource', async () => {
    const policyEngine = new ExecutionPolicyEngine();
    const deptOrch = new DepartmentOrchestrator();
    const planner = new AutonomousPlanner(undefined, undefined, policyEngine, deptOrch);

    const plan = await planner.planMission(jwtGoal);

    expect(plan.planId).toBeDefined();
    expect(plan.planningSource).toBe('RULE_ENGINE');
    expect(plan.confidence).toBeGreaterThan(0);
    expect(plan.analyzedGoal.affectedModules).toContain('auth');
    expect(plan.architectureDecisions.length).toBeGreaterThan(0);
    expect(plan.dependencyReport.entries.length).toBeGreaterThan(0);
    expect(plan.riskReport.risks.length).toBeGreaterThan(0);
    expect(plan.complexityReport.overallComplexity).toBeGreaterThan(0);
    expect(plan.executionStrategy.departments.length).toBeGreaterThan(0);
    expect(plan.epics.length).toBeGreaterThanOrEqual(3);
    expect(plan.tasks.length).toBeGreaterThanOrEqual(4);
    expect(plan.aiInvocations).toEqual([]); // no AI invoked for well-recognized goal
  });

  // ─── 11. Knowledge Reuse — Second Plan Uses Cache ──────────────

  it('should return CACHE source when identical goal is planned a second time', async () => {
    const policyEngine = new ExecutionPolicyEngine();
    const planner = new AutonomousPlanner(undefined, undefined, policyEngine);

    const first = await planner.planMission(simpleGoal);
    expect(first.planningSource).toBe('RULE_ENGINE');

    const second = await planner.planMission(simpleGoal);
    // Goal analyzer returns CACHE, architecture returns CACHE
    // Some components remain RULE_ENGINE → overall becomes RULE_ENGINE or mixed
    // but the goal analysis itself should be cached
    expect(second.analyzedGoal.planningSource).toBe('CACHE');
  });

  // ─── 12. AI Fallback Decision Gate ─────────────────────────────

  it('should flag AI invocation when confidence is below threshold', async () => {
    const policyEngine = new ExecutionPolicyEngine();
    const planner = new AutonomousPlanner(undefined, undefined, policyEngine, undefined, {
      aiConfidenceThreshold: 99, // artificially high to trigger AI gate
      enableAIFallback: true,
      maxAIInvocationsPerPlan: 3,
    });

    const plan = await planner.planMission(simpleGoal);

    // Should have flagged an AI invocation (but not actually invoked)
    expect(plan.aiInvocations.length).toBeGreaterThan(0);
    expect(plan.aiInvocations[0].stage).toBe('ComplexityEstimation');
    expect(plan.aiInvocations[0].tokenCost).toBe(0); // not invoked
    expect(plan.aiInvocations[0].reason).toContain('below threshold');
  });

  // ─── 13. Domain Event Emission ─────────────────────────────────

  it('should emit all 10 specified planning domain events', async () => {
    const policyEngine = new ExecutionPolicyEngine();
    const planner = new AutonomousPlanner(undefined, undefined, policyEngine);
    const events: string[] = [];

    planner.on('PlanningStarted', () => events.push('PlanningStarted'));
    planner.on('GoalAnalyzed', () => events.push('GoalAnalyzed'));
    planner.on('ArchitecturePlanned', () => events.push('ArchitecturePlanned'));
    planner.on('DependenciesAnalyzed', () => events.push('DependenciesAnalyzed'));
    planner.on('RiskAnalysisCompleted', () => events.push('RiskAnalysisCompleted'));
    planner.on('ComplexityEstimated', () => events.push('ComplexityEstimated'));
    planner.on('ExecutionStrategySelected', () => events.push('ExecutionStrategySelected'));
    planner.on('MissionPlanned', () => events.push('MissionPlanned'));
    planner.on('PlanningKnowledgeStored', () => events.push('PlanningKnowledgeStored'));
    planner.on('PlanningCompleted', () => events.push('PlanningCompleted'));

    await planner.planMission(jwtGoal);

    expect(events).toEqual([
      'PlanningStarted',
      'GoalAnalyzed',
      'ArchitecturePlanned',
      'DependenciesAnalyzed',
      'RiskAnalysisCompleted',
      'ComplexityEstimated',
      'ExecutionStrategySelected',
      'MissionPlanned',
      'PlanningKnowledgeStored',
      'PlanningCompleted',
    ]);
  });

  // ─── 14. CLI Subcommands ───────────────────────────────────────

  it('should execute CLI plan subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');
    await cli.planMission('Add JWT Auth', 'Implement JWT authentication with login and signup');
    await cli.planAnalyze('Add health check', 'Implement API health endpoint');
    await cli.planArchitecture('Add database migration', 'Create schema migration for users table with SQL');
    await cli.planRisks('Refactor auth middleware', 'Rewrite authentication middleware for security improvements');
    await cli.planStrategy('Add caching layer', 'Add Redis-based caching for API responses');
    await cli.shutdown();
  });
});
