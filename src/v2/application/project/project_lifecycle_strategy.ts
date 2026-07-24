import { IProjectLifecycleStrategy } from '../../contracts/iproject_lifecycle_strategy';
import {
  ProjectExecutionResult,
  ProjectExecutionState,
} from '../../contracts/iproject_lifecycle_orchestrator';
import { AutonomousPlanner } from '../planning/autonomous_planner';
import { MissionEngine } from '../missions/mission_engine';
import { MissionExecutionOrchestrator } from '../missions/mission_execution_orchestrator';

export class DefaultProjectLifecycleStrategy implements IProjectLifecycleStrategy {
  constructor(
    private planner: AutonomousPlanner,
    private missionEngine: MissionEngine,
    private executionOrchestrator: MissionExecutionOrchestrator
  ) {}

  async executeProjectLifecycle(
    projectId: string,
    goal: string,
    context?: Record<string, any>
  ): Promise<ProjectExecutionResult> {
    const startTime = new Date().toISOString();
    const state: ProjectExecutionState = {
      projectId,
      goal,
      status: 'PLANNING',
      executionPlans: {},
      executionResults: {},
      startTime,
      conversationHistory: [],
    };

    try {
      // Step 1: High-Level Autonomous Planning
      const plannerResult = await this.planner.planMission({
        title: `Project ${projectId}`,
        description: goal,
      });
      state.missionPlan = plannerResult;

      // Step 2: Mission Planning & Decomposition (DAG Task Graph Generation)
      state.status = 'EXECUTING_MISSIONS';
      const { mission, plan } = await this.missionEngine.decomposeAndPlanMission(
        `Mission for ${goal}`,
        goal,
        context
      );
      state.executionPlans[mission.id] = plan;

      // Step 3: DAG Mission Execution Orchestration
      const execResult = await this.executionOrchestrator.executeMissionPlan(plan);
      state.executionResults[mission.id] = execResult;

      state.endTime = new Date().toISOString();
      const success = execResult.success;
      state.status = success ? 'COMPLETED' : 'FAILED';

      const summary = `Project '${projectId}' completed with status '${state.status}'. Tasks executed: ${execResult.state.completedTaskIds.length}/${plan.tasks.length}.`;

      return {
        success,
        state,
        summary,
        reports: execResult.reports,
      };
    } catch (err: any) {
      state.status = 'FAILED';
      state.endTime = new Date().toISOString();
      return {
        success: false,
        state,
        summary: `Project '${projectId}' failed: ${err.message}`,
        reports: {},
        error: err.message,
      };
    }
  }
}
