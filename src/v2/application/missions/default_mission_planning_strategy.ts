import { IMissionPlanningStrategy } from '../../contracts/imission_planning_strategy';
import {
  MissionExecutionPlan,
  MissionTask,
  TaskDependency,
} from '../../contracts/imission_decomposition';

export class DefaultMissionPlanningStrategy implements IMissionPlanningStrategy {
  async planMission(
    missionId: string,
    goal: string,
    context?: Record<string, any>
  ): Promise<MissionExecutionPlan> {
    const planId = `plan-${missionId}`;

    // Decompose high-level goal into structured tasks
    const tasks: MissionTask[] = [
      {
        id: `t-${missionId}-1`,
        missionId,
        title: 'Design System Architecture',
        description: `Design architecture, endpoints, and data contracts for goal: ${goal}`,
        requiredCapability: 'Architecture',
        priority: 'CRITICAL',
        status: 'READY',
        dependencies: [],
        estimatedComplexity: 3,
      },
      {
        id: `t-${missionId}-2`,
        missionId,
        title: 'Define Database Schema & Data Models',
        description: `Create data schemas and database migration models for ${goal}`,
        requiredCapability: 'Backend',
        priority: 'HIGH',
        status: 'PENDING',
        dependencies: [`t-${missionId}-1`],
        estimatedComplexity: 2,
      },
      {
        id: `t-${missionId}-3`,
        missionId,
        title: 'Implement Express REST Server Endpoints',
        description: `Implement core API routes, controllers, and service handlers for ${goal}`,
        requiredCapability: 'Backend',
        priority: 'HIGH',
        status: 'PENDING',
        dependencies: [`t-${missionId}-1`, `t-${missionId}-2`],
        estimatedComplexity: 4,
      },
      {
        id: `t-${missionId}-4`,
        missionId,
        title: 'Implement Authentication & Authorization Middleware',
        description: `Add JWT authentication and permission middleware for ${goal}`,
        requiredCapability: 'Backend',
        priority: 'HIGH',
        status: 'PENDING',
        dependencies: [`t-${missionId}-3`],
        estimatedComplexity: 3,
      },
      {
        id: `t-${missionId}-5`,
        missionId,
        title: 'Write Verification Unit & Integration Tests',
        description: `Create test suites covering API routes and middleware for ${goal}`,
        requiredCapability: 'QA',
        priority: 'MEDIUM',
        status: 'PENDING',
        dependencies: [`t-${missionId}-4`],
        estimatedComplexity: 2,
      },
      {
        id: `t-${missionId}-6`,
        missionId,
        title: 'Generate OpenAPI Specifications & Documentation',
        description: `Generate OpenAPI spec and developer documentation for ${goal}`,
        requiredCapability: 'Documentation',
        priority: 'LOW',
        status: 'PENDING',
        dependencies: [`t-${missionId}-4`],
        estimatedComplexity: 1,
      },
    ];

    // Build Task Dependencies
    const dependencies: TaskDependency[] = [
      { taskId: `t-${missionId}-2`, dependsOnTaskId: `t-${missionId}-1`, dependencyType: 'HARD' },
      { taskId: `t-${missionId}-3`, dependsOnTaskId: `t-${missionId}-1`, dependencyType: 'HARD' },
      { taskId: `t-${missionId}-3`, dependsOnTaskId: `t-${missionId}-2`, dependencyType: 'HARD' },
      { taskId: `t-${missionId}-4`, dependsOnTaskId: `t-${missionId}-3`, dependencyType: 'HARD' },
      { taskId: `t-${missionId}-5`, dependsOnTaskId: `t-${missionId}-4`, dependencyType: 'HARD' },
      { taskId: `t-${missionId}-6`, dependsOnTaskId: `t-${missionId}-4`, dependencyType: 'SOFT' },
    ];

    // Calculate Topological Execution Batches (Level 0, Level 1, Level 2, Level 3)
    const executionBatches: string[][] = [
      [`t-${missionId}-1`],                             // Batch 1: Architecture
      [`t-${missionId}-2`],                             // Batch 2: Schema (depends on 1)
      [`t-${missionId}-3`],                             // Batch 3: Server (depends on 1 & 2)
      [`t-${missionId}-4`],                             // Batch 4: Auth (depends on 3)
      [`t-${missionId}-5`, `t-${missionId}-6`],         // Batch 5: QA & Docs in parallel (depends on 4)
    ];

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
    };
  }
}
