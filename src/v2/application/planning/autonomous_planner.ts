import { EventEmitter } from 'events';
import {
  BusinessGoal,
  MissionPlan,
  PlanningSource,
  PlanningConfig,
  PlanningAIInvocation,
  DEFAULT_PLANNING_CONFIG,
} from '../../contracts/iplanning_engine';
import { IEventStore } from '../../contracts/ievent_store';
import { ISharedMemory } from '../../contracts/ishared_memory';
import { GoalAnalyzer } from './goal_analyzer';
import { ArchitecturePlanner } from './architecture_planner';
import { DependencyAnalyzer } from './dependency_analyzer';
import { RiskAnalyzer } from './risk_analyzer';
import { ComplexityEstimator } from './complexity_estimator';
import { ExecutionStrategyPlanner } from './execution_strategy_planner';
import { PlanGenerator } from './plan_generator';
import { ExecutionPolicyEngine } from '../policy/execution_policy_engine';
import { DepartmentOrchestrator } from '../organization/department_orchestrator';
import { PromptCache } from '../policy/prompt_cache';

export class AutonomousPlanner extends EventEmitter {
  private goalAnalyzer: GoalAnalyzer;
  private architecturePlanner: ArchitecturePlanner;
  private dependencyAnalyzer = new DependencyAnalyzer();
  private riskAnalyzer = new RiskAnalyzer();
  private complexityEstimator = new ComplexityEstimator();
  private executionStrategyPlanner: ExecutionStrategyPlanner;
  private planGenerator = new PlanGenerator();

  private plans = new Map<string, MissionPlan>();
  private config: PlanningConfig;

  constructor(
    private eventStore?: IEventStore,
    private sharedMemory?: ISharedMemory,
    private policyEngine?: ExecutionPolicyEngine,
    private departmentOrchestrator?: DepartmentOrchestrator,
    config?: PlanningConfig,
  ) {
    super();
    this.config = config ?? DEFAULT_PLANNING_CONFIG;

    const promptCache = policyEngine?.getPromptCache();

    this.goalAnalyzer = new GoalAnalyzer(promptCache, sharedMemory, this.config);
    this.architecturePlanner = new ArchitecturePlanner(promptCache, sharedMemory);
    this.executionStrategyPlanner = new ExecutionStrategyPlanner(policyEngine, departmentOrchestrator);
  }

  // ─── Main pipeline entry point ─────────────────────────────────

  async planMission(goal: BusinessGoal): Promise<MissionPlan> {
    const planId = `plan-${Date.now()}`;
    const aiInvocations: PlanningAIInvocation[] = [];

    this.emitEvent('PlanningStarted', planId, { goal: goal.title });

    // 1. Goal Analysis
    const analyzedGoal = await this.goalAnalyzer.analyze(goal);
    this.emitEvent('GoalAnalyzed', planId, {
      source: analyzedGoal.planningSource,
      modules: analyzedGoal.affectedModules,
      confidence: analyzedGoal.confidence,
    });

    // 2. Architecture Planning
    const architectureDecisions = await this.architecturePlanner.plan(analyzedGoal);
    this.emitEvent('ArchitecturePlanned', planId, {
      source: architectureDecisions[0]?.planningSource ?? 'RULE_ENGINE',
      decisionCount: architectureDecisions.length,
    });

    // 3. Dependency Analysis
    const dependencyReport = this.dependencyAnalyzer.analyze(analyzedGoal);
    this.emitEvent('DependenciesAnalyzed', planId, {
      source: dependencyReport.planningSource,
      moduleCount: dependencyReport.entries.length,
      couplingRisks: dependencyReport.couplingRisks.length,
    });

    // 4. Risk Analysis
    const riskReport = this.riskAnalyzer.analyze(analyzedGoal, dependencyReport);
    this.emitEvent('RiskAnalysisCompleted', planId, {
      source: riskReport.planningSource,
      riskCount: riskReport.risks.length,
      overallRiskScore: riskReport.overallRiskScore,
    });

    // 5. Complexity Estimation
    const complexityReport = this.complexityEstimator.estimate(analyzedGoal, riskReport);
    this.emitEvent('ComplexityEstimated', planId, {
      source: complexityReport.planningSource,
      overallComplexity: complexityReport.overallComplexity,
      confidence: complexityReport.confidence,
    });

    // ─── AI fallback decision gate ────────────────────────────────
    // If confidence is below threshold, record the decision but do NOT
    // invoke AI. HOW reasoning executes is outside scope of this milestone.
    if (complexityReport.confidence < this.config.aiConfidenceThreshold && this.config.enableAIFallback) {
      const invocation: PlanningAIInvocation = {
        stage: 'ComplexityEstimation',
        reason: `Confidence ${complexityReport.confidence}% is below threshold ${this.config.aiConfidenceThreshold}%`,
        confidence: complexityReport.confidence,
        tokenCost: 0, // AI not invoked in this milestone
        decision: 'AI reasoning deferred — runtime session management not yet available',
      };
      aiInvocations.push(invocation);
      this.emitEvent('PlanningAIInvocation', planId, invocation);
    }

    // 6. Execution Strategy
    const executionStrategy = this.executionStrategyPlanner.plan(complexityReport, analyzedGoal.affectedModules);
    this.emitEvent('ExecutionStrategySelected', planId, {
      source: executionStrategy.planningSource,
      workerPolicy: executionStrategy.workerPolicy,
      departments: executionStrategy.departments,
    });

    // 7. Task Generation
    const { epics, features, tasks } = this.planGenerator.generate(analyzedGoal, executionStrategy);
    this.emitEvent('MissionPlanned', planId, {
      epicCount: epics.length,
      featureCount: features.length,
      taskCount: tasks.length,
    });

    // 8. Determine overall planning source
    const planningSource = this.resolveOverallSource(
      analyzedGoal.planningSource,
      architectureDecisions[0]?.planningSource ?? 'RULE_ENGINE',
      dependencyReport.planningSource,
      riskReport.planningSource,
      complexityReport.planningSource,
      executionStrategy.planningSource,
      aiInvocations.length,
    );

    // 9. Persist planning knowledge
    if (this.sharedMemory) {
      await this.sharedMemory.writeADR({
        id: `adr-plan-${planId}`,
        title: `Planning Decision: ${goal.title}`,
        author: 'AutonomousPlanner',
        status: 'ACCEPTED',
        content: JSON.stringify({
          planId,
          goal: goal.title,
          planningSource,
          confidence: complexityReport.confidence,
          taskCount: tasks.length,
        }),
        timestamp: new Date().toISOString(),
      });
    }
    this.emitEvent('PlanningKnowledgeStored', planId, { planningSource });

    // 10. Assemble Mission Plan
    const missionPlan: MissionPlan = {
      planId,
      goal,
      analyzedGoal,
      architectureDecisions,
      dependencyReport,
      riskReport,
      complexityReport,
      executionStrategy,
      epics,
      features,
      tasks,
      planningSource,
      aiInvocations,
      confidence: complexityReport.confidence,
      createdAt: new Date().toISOString(),
    };

    this.plans.set(planId, missionPlan);

    this.emitEvent('PlanningCompleted', planId, {
      planningSource,
      confidence: missionPlan.confidence,
      epicCount: epics.length,
      taskCount: tasks.length,
      aiInvocations: aiInvocations.length,
    });

    return missionPlan;
  }

  // ─── Individual pipeline stages (for CLI) ──────────────────────

  async analyzeGoal(goal: BusinessGoal) {
    return this.goalAnalyzer.analyze(goal);
  }

  async planArchitecture(goal: BusinessGoal) {
    const analyzed = await this.goalAnalyzer.analyze(goal);
    return this.architecturePlanner.plan(analyzed);
  }

  async analyzeRisks(goal: BusinessGoal) {
    const analyzed = await this.goalAnalyzer.analyze(goal);
    const deps = this.dependencyAnalyzer.analyze(analyzed);
    return this.riskAnalyzer.analyze(analyzed, deps);
  }

  async planStrategy(goal: BusinessGoal) {
    const analyzed = await this.goalAnalyzer.analyze(goal);
    const deps = this.dependencyAnalyzer.analyze(analyzed);
    const risks = this.riskAnalyzer.analyze(analyzed, deps);
    const complexity = this.complexityEstimator.estimate(analyzed, risks);
    return this.executionStrategyPlanner.plan(complexity, analyzed.affectedModules);
  }

  getPlan(planId: string): MissionPlan | undefined {
    return this.plans.get(planId);
  }

  listPlans(): MissionPlan[] {
    return Array.from(this.plans.values());
  }

  // ─── Internal helpers ──────────────────────────────────────────

  private resolveOverallSource(...sources: (PlanningSource | number)[]): PlanningSource {
    const strSources = sources.filter(s => typeof s === 'string') as PlanningSource[];
    const aiCount = sources.find(s => typeof s === 'number') as number | undefined ?? 0;

    if (aiCount > 0) {
      return strSources.every(s => s === 'AI_REASONING') ? 'AI_REASONING' : 'HYBRID';
    }
    if (strSources.every(s => s === 'CACHE')) return 'CACHE';
    return 'RULE_ENGINE';
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'AutonomousPlanner',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
