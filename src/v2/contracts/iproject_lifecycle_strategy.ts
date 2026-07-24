import { ProjectExecutionResult } from './iproject_lifecycle_orchestrator';

export interface IProjectLifecycleStrategy {
  /**
   * Executes an autonomous project lifecycle for a given business goal.
   */
  executeProjectLifecycle(
    projectId: string,
    goal: string,
    context?: Record<string, any>
  ): Promise<ProjectExecutionResult>;
}
