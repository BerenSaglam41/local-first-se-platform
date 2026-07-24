import { MissionExecutionPlan } from './imission_decomposition';

export interface IMissionPlanningStrategy {
  /**
   * Generates a structured MissionExecutionPlan (tasks, dependencies, execution batches)
   * for a given mission goal and context.
   */
  planMission(
    missionId: string,
    goal: string,
    context?: Record<string, any>
  ): Promise<MissionExecutionPlan>;
}
