import { IMissionPlanningStrategy } from '../../contracts/imission_planning_strategy';
import {
  MissionExecutionPlan,
  MissionTask,
  TaskDependency,
} from '../../contracts/imission_decomposition';
import { TeamSizeEstimator, TeamSizeTier } from '../planning/team_size_estimator';

interface TaskBlueprint {
  title: string;
  description: (goal: string) => string;
  requiredCapability: string;
  priority: MissionTask['priority'];
  estimatedComplexity: number;
  /** 1-based indices (into the full blueprint list) this task depends on. */
  dependsOn: number[];
  /** Subset of dependsOn that should be recorded as SOFT rather than HARD dependencies. */
  softDependsOn?: number[];
  /** 1-based batch (topological level) this task executes in. */
  batch: number;
}

// Tasks 1-6 are the original, unchanged default template — MEDIUM tier output is byte-identical
// to what this planner has always produced, so no goal that previously decomposed into exactly
// 6 tasks changes behavior. Tasks 7+ extend the plan for goals that say they're bigger in scope.
const BLUEPRINTS: TaskBlueprint[] = [
  {
    title: 'Design System Architecture',
    description: (goal) => `Design architecture, endpoints, and data contracts for goal: ${goal}`,
    requiredCapability: 'Architecture',
    priority: 'CRITICAL',
    estimatedComplexity: 3,
    dependsOn: [],
    batch: 1,
  },
  {
    title: 'Define Database Schema & Data Models',
    description: (goal) => `Create data schemas and database migration models for ${goal}`,
    requiredCapability: 'Backend',
    priority: 'HIGH',
    estimatedComplexity: 2,
    dependsOn: [1],
    batch: 2,
  },
  {
    title: 'Implement Express REST Server Endpoints',
    description: (goal) => `Implement core API routes, controllers, and service handlers for ${goal}`,
    requiredCapability: 'Backend',
    priority: 'HIGH',
    estimatedComplexity: 4,
    dependsOn: [1, 2],
    batch: 3,
  },
  {
    title: 'Implement Authentication & Authorization Middleware',
    description: (goal) => `Add JWT authentication and permission middleware for ${goal}`,
    requiredCapability: 'Backend',
    priority: 'HIGH',
    estimatedComplexity: 3,
    dependsOn: [3],
    batch: 4,
  },
  {
    title: 'Write Verification Unit & Integration Tests',
    description: (goal) => `Create test suites covering API routes and middleware for ${goal}`,
    requiredCapability: 'QA',
    priority: 'MEDIUM',
    estimatedComplexity: 2,
    dependsOn: [4],
    batch: 5,
  },
  {
    title: 'Generate OpenAPI Specifications & Documentation',
    description: (goal) => `Generate OpenAPI spec and developer documentation for ${goal}`,
    requiredCapability: 'Documentation',
    priority: 'LOW',
    estimatedComplexity: 1,
    dependsOn: [4],
    softDependsOn: [4],
    batch: 5,
  },
  // ─── LARGE tier extends here (tasks 7-10) ─────────────────────────
  {
    title: 'Implement API Gateway & Rate Limiting',
    description: (goal) => `Add an API gateway layer with rate limiting and request routing for ${goal}`,
    requiredCapability: 'Backend',
    priority: 'MEDIUM',
    estimatedComplexity: 3,
    dependsOn: [4],
    batch: 5,
  },
  {
    title: 'Add Caching & Performance Layer',
    description: (goal) => `Introduce a caching layer to meet performance targets for ${goal}`,
    requiredCapability: 'Backend',
    priority: 'MEDIUM',
    estimatedComplexity: 2,
    dependsOn: [4],
    batch: 5,
  },
  {
    title: 'Implement Structured Logging & Observability',
    description: (goal) => `Add structured logging, metrics, and tracing across services for ${goal}`,
    requiredCapability: 'Backend',
    priority: 'MEDIUM',
    estimatedComplexity: 3,
    dependsOn: [4],
    batch: 5,
  },
  {
    title: 'Load & Integration Testing Suite',
    description: (goal) => `Run load and cross-service integration testing for ${goal}`,
    requiredCapability: 'QA',
    priority: 'HIGH',
    estimatedComplexity: 3,
    dependsOn: [7, 8, 9],
    batch: 6,
  },
  // ─── ENTERPRISE tier extends here (tasks 11-15) ────────────────────
  {
    title: 'Multi-Region Deployment Pipeline',
    description: (goal) => `Build a multi-region deployment and rollout pipeline for ${goal}`,
    requiredCapability: 'Backend',
    priority: 'HIGH',
    estimatedComplexity: 4,
    dependsOn: [10],
    batch: 7,
  },
  {
    title: 'Compliance & Audit Logging',
    description: (goal) => `Add compliance-grade audit logging and retention policies for ${goal}`,
    requiredCapability: 'Backend',
    priority: 'HIGH',
    estimatedComplexity: 3,
    dependsOn: [4],
    batch: 7,
  },
  {
    title: 'Security Hardening & Access Review',
    description: (goal) => `Harden security posture and review access controls for ${goal}`,
    requiredCapability: 'Backend',
    priority: 'CRITICAL',
    estimatedComplexity: 4,
    dependsOn: [4],
    batch: 7,
  },
  {
    title: 'Internal Admin Console',
    description: (goal) => `Build an internal admin console for operating ${goal}`,
    requiredCapability: 'Backend',
    priority: 'MEDIUM',
    estimatedComplexity: 3,
    dependsOn: [3],
    batch: 7,
  },
  {
    title: 'Disaster Recovery & Load Testing',
    description: (goal) => `Validate disaster recovery and run production-scale load testing for ${goal}`,
    requiredCapability: 'QA',
    priority: 'HIGH',
    estimatedComplexity: 3,
    dependsOn: [11],
    batch: 8,
  },
];

const TIER_TASK_COUNT: Record<TeamSizeTier, number> = {
  SMALL: 3,
  MEDIUM: 6,
  LARGE: 10,
  ENTERPRISE: 15,
};

// SMALL tier is not a slice of the same blueprint chain (it needs to stay a minimal 3-step
// arc, not "the first 3 steps of a REST API build"), so it gets its own small blueprint set.
const SMALL_BLUEPRINTS: TaskBlueprint[] = [
  {
    title: 'Design Minimal Architecture',
    description: (goal) => `Sketch the minimal architecture needed for goal: ${goal}`,
    requiredCapability: 'Architecture',
    priority: 'HIGH',
    estimatedComplexity: 1,
    dependsOn: [],
    batch: 1,
  },
  {
    title: 'Implement Core Functionality',
    description: (goal) => `Implement the core functionality directly needed for ${goal}`,
    requiredCapability: 'Backend',
    priority: 'HIGH',
    estimatedComplexity: 2,
    dependsOn: [1],
    batch: 2,
  },
  {
    title: 'Write Verification Tests',
    description: (goal) => `Write tests covering the implemented functionality for ${goal}`,
    requiredCapability: 'QA',
    priority: 'MEDIUM',
    estimatedComplexity: 1,
    dependsOn: [2],
    batch: 3,
  },
];

export class DefaultMissionPlanningStrategy implements IMissionPlanningStrategy {
  private estimator = new TeamSizeEstimator();

  async planMission(
    missionId: string,
    goal: string,
    context?: Record<string, any>
  ): Promise<MissionExecutionPlan> {
    const planId = `plan-${missionId}`;
    const { tier, taskCount } = this.estimator.estimate(goal);
    const blueprints = tier === 'SMALL' ? SMALL_BLUEPRINTS : BLUEPRINTS.slice(0, taskCount);

    const tasks: MissionTask[] = blueprints.map((bp, idx) => ({
      id: `t-${missionId}-${idx + 1}`,
      missionId,
      title: bp.title,
      description: bp.description(goal),
      requiredCapability: bp.requiredCapability,
      priority: bp.priority,
      status: idx === 0 ? 'READY' : 'PENDING',
      dependencies: bp.dependsOn.map((depIdx) => `t-${missionId}-${depIdx}`),
      estimatedComplexity: bp.estimatedComplexity,
    }));

    const dependencies: TaskDependency[] = [];
    blueprints.forEach((bp, idx) => {
      for (const depIdx of bp.dependsOn) {
        dependencies.push({
          taskId: `t-${missionId}-${idx + 1}`,
          dependsOnTaskId: `t-${missionId}-${depIdx}`,
          dependencyType: bp.softDependsOn?.includes(depIdx) ? 'SOFT' : 'HARD',
        });
      }
    });

    const batchMap = new Map<number, string[]>();
    blueprints.forEach((bp, idx) => {
      const list = batchMap.get(bp.batch) || [];
      list.push(`t-${missionId}-${idx + 1}`);
      batchMap.set(bp.batch, list);
    });
    const executionBatches: string[][] = Array.from(batchMap.keys())
      .sort((a, b) => a - b)
      .map((batchNum) => batchMap.get(batchNum)!);

    const totalEstimatedComplexity = tasks.reduce((sum, t) => sum + t.estimatedComplexity, 0);

    return {
      planId,
      missionId,
      goal,
      tasks,
      dependencies,
      executionBatches,
      departmentAssignments: {},
      workerAssignments: {},
      totalEstimatedComplexity,
      workspacePath: context?.executionWorkspacePath || context?.workspacePath,
      projectId: context?.projectId,
    };
  }
}
