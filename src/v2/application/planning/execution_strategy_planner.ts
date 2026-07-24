import {
  ComplexityReport,
  ExecutionStrategy,
} from '../../contracts/iplanning_engine';
import { WorkerPolicyMode } from '../../contracts/iexecution_policy';
import { ExecutionPolicyEngine } from '../policy/execution_policy_engine';
import { DepartmentOrchestrator } from '../organization/department_orchestrator';

// ─── Module → Department mapping ────────────────────────────────────

const MODULE_DEPT: Record<string, string> = {
  auth:        'dept-backend',
  api:         'dept-backend',
  database:    'dept-backend',
  frontend:    'dept-frontend',
  testing:     'dept-qa',
  devops:      'dept-devops',
  security:    'dept-backend',
  config:      'dept-devops',
  middleware:  'dept-backend',
  documentation: 'dept-documentation',
  general:     'dept-backend',
};

export class ExecutionStrategyPlanner {
  constructor(
    private policyEngine?: ExecutionPolicyEngine,
    private departmentOrchestrator?: DepartmentOrchestrator,
  ) {}

  plan(complexityReport: ComplexityReport, affectedModules: string[]): ExecutionStrategy {
    // ─── Worker policy from Milestone 11 engine ───────────────────
    let workerPolicy: WorkerPolicyMode = 'SINGLE';
    if (this.policyEngine) {
      workerPolicy = this.policyEngine.resolveWorkerPolicy(complexityReport.estimatedWorkers) as WorkerPolicyMode;
    } else {
      // Fallback heuristic
      if (complexityReport.estimatedWorkers <= 1) workerPolicy = 'SINGLE';
      else if (complexityReport.estimatedWorkers === 2) workerPolicy = 'PAIR_PROGRAMMING';
      else if (complexityReport.estimatedWorkers <= 5) workerPolicy = 'MULTI_AGENT';
      else workerPolicy = 'DEPARTMENT';
    }

    // ─── Department allocation ────────────────────────────────────
    const deptSet = new Set<string>();
    for (const mod of affectedModules) {
      deptSet.add(MODULE_DEPT[mod] || 'dept-backend');
    }
    const departments = Array.from(deptSet);

    // ─── Cost estimation from policy engine ───────────────────────
    let estimatedCostUSD = complexityReport.estimatedTokens * 0.000005;
    let estimatedRuntimeSec = complexityReport.estimatedRuntimeSec;
    let estimatedTokens = complexityReport.estimatedTokens;

    if (this.policyEngine) {
      const profile = this.policyEngine.getCurrentProfile();
      estimatedTokens = Math.min(estimatedTokens, profile.maxTokenBudget);
      estimatedCostUSD = estimatedTokens * 0.000005;
    }

    return {
      goalId: complexityReport.goalId,
      workerPolicy,
      departments,
      estimatedCostUSD: Number(estimatedCostUSD.toFixed(4)),
      estimatedRuntimeSec,
      estimatedTokens,
      planningSource: 'RULE_ENGINE',
    };
  }
}
