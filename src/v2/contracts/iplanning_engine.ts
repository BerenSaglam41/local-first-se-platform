import { CapabilityType } from './iplugin_framework';

// ─── Planning Source ─────────────────────────────────────────────────
// Records HOW a planning decision was made.
// Cache and Rule Engine cost 0 tokens.
// AI_REASONING is threshold-gated and recorded.
// HYBRID = rule base + targeted AI augmentation.

export type PlanningSource = 'CACHE' | 'RULE_ENGINE' | 'AI_REASONING' | 'HYBRID';

// ─── Planning Configuration ─────────────────────────────────────────

export interface PlanningConfig {
  /** Confidence percentage below which AI fallback is considered (0-100). Default: 40 */
  aiConfidenceThreshold: number;
  /** Whether AI fallback is enabled at all. Default: true */
  enableAIFallback: boolean;
  /** Maximum AI invocations allowed per planning run. Default: 3 */
  maxAIInvocationsPerPlan: number;
}

export const DEFAULT_PLANNING_CONFIG: PlanningConfig = {
  aiConfidenceThreshold: 40,
  enableAIFallback: true,
  maxAIInvocationsPerPlan: 3,
};

// ─── Business Goal (CEO Input) ──────────────────────────────────────

export interface BusinessGoal {
  title: string;
  description: string;
  constraints?: string[];
}

// ─── Goal Analysis Output ───────────────────────────────────────────

export interface AnalyzedGoal {
  goalId: string;
  businessObjective: string;
  affectedModules: string[];
  dependencies: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  planningSource: PlanningSource;
  confidence: number;
}

// ─── Architecture Decision ──────────────────────────────────────────

export interface ArchitectureDecision {
  id: string;
  title: string;
  pattern: string;
  rationale: string;
  components: string[];
  extensionPoints: string[];
  reuseOpportunities: string[];
  legacyConstraints: string[];
  planningSource: PlanningSource;
}

// ─── Dependency Report ──────────────────────────────────────────────

export interface DependencyEntry {
  module: string;
  owner: string;
  dependsOn: string[];
  external: boolean;
}

export interface DependencyReport {
  goalId: string;
  entries: DependencyEntry[];
  externalLibraries: string[];
  couplingRisks: string[];
  circularRisks: string[];
  planningSource: PlanningSource;
}

// ─── Risk Analysis ──────────────────────────────────────────────────

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskEntry {
  id: string;
  category: string;
  description: string;
  severity: RiskSeverity;
  probability: number;
  mitigation: string;
}

export interface RiskReport {
  goalId: string;
  risks: RiskEntry[];
  overallRiskScore: number;
  planningSource: PlanningSource;
}

// ─── Complexity Report ──────────────────────────────────────────────

export interface ComplexityReport {
  goalId: string;
  implementationComplexity: number;
  testingComplexity: number;
  reviewComplexity: number;
  verificationComplexity: number;
  deploymentComplexity: number;
  overallComplexity: number;
  estimatedWorkers: number;
  estimatedRuntimeSec: number;
  estimatedTokens: number;
  confidence: number;
  planningSource: PlanningSource;
}

// ─── Execution Strategy ─────────────────────────────────────────────

export interface ExecutionStrategy {
  goalId: string;
  workerPolicy: 'SINGLE' | 'PAIR_PROGRAMMING' | 'MULTI_AGENT' | 'DEPARTMENT';
  departments: string[];
  estimatedCostUSD: number;
  estimatedRuntimeSec: number;
  estimatedTokens: number;
  planningSource: PlanningSource;
}

// ─── Plan Units ─────────────────────────────────────────────────────

export interface PlanEpic {
  id: string;
  title: string;
  description: string;
}

export interface PlanFeature {
  id: string;
  epicId: string;
  title: string;
  description: string;
}

export interface PlanTask {
  id: string;
  featureId: string;
  title: string;
  objective: string;
  targetFiles: string[];
  requiredCapabilities: CapabilityType[];
  departmentId: string;
  dependsOn: string[];
  priority: 'P0' | 'P1' | 'P2';
}

// ─── AI Invocation Record ───────────────────────────────────────────

export interface PlanningAIInvocation {
  stage: string;
  reason: string;
  confidence: number;
  tokenCost: number;
  decision: string;
}

// ─── Mission Plan (Final Output) ────────────────────────────────────

export interface MissionPlan {
  planId: string;
  goal: BusinessGoal;
  analyzedGoal: AnalyzedGoal;
  architectureDecisions: ArchitectureDecision[];
  dependencyReport: DependencyReport;
  riskReport: RiskReport;
  complexityReport: ComplexityReport;
  executionStrategy: ExecutionStrategy;
  epics: PlanEpic[];
  features: PlanFeature[];
  tasks: PlanTask[];
  planningSource: PlanningSource;
  aiInvocations: PlanningAIInvocation[];
  confidence: number;
  createdAt: string;
}
