import { EventEmitter } from 'events';
import {
  ProjectExecutionState,
  ProjectExecutionResult,
} from '../../contracts/iproject_lifecycle_orchestrator';
import { IProjectLifecycleStrategy } from '../../contracts/iproject_lifecycle_strategy';
import { IEventStore } from '../../contracts/ievent_store';

export class ProjectLifecycleOrchestrator extends EventEmitter {
  private activeProjects = new Map<string, ProjectExecutionState>();
  private projectHistory = new Map<string, ProjectExecutionResult>();

  constructor(
    private strategy: IProjectLifecycleStrategy,
    private eventStore?: IEventStore
  ) {
    super();
  }

  async runProject(goal: string, context?: Record<string, any>): Promise<ProjectExecutionResult> {
    const projectId = `proj-${Date.now()}`;
    const startTime = new Date().toISOString();

    const initialState: ProjectExecutionState = {
      projectId,
      goal,
      status: 'PLANNING',
      executionPlans: {},
      executionResults: {},
      startTime,
    };

    this.activeProjects.set(projectId, initialState);

    this.emitEvent('ProjectExecutionStarted', projectId, { goal });

    try {
      const result = await this.strategy.executeProjectLifecycle(projectId, goal, context);
      this.activeProjects.delete(projectId);
      this.projectHistory.set(projectId, result);

      if (result.success) {
        this.emitEvent('ProjectPlanningCompleted', projectId, { plan: result.state.missionPlan });
        this.emitEvent('MissionExecutionStarted', projectId, { plansCount: Object.keys(result.state.executionPlans).length });
        this.emitEvent('MissionExecutionCompleted', projectId, { resultsCount: Object.keys(result.state.executionResults).length });
        this.emitEvent('ProjectExecutionCompleted', projectId, { summary: result.summary });
      } else {
        this.emitEvent('ProjectExecutionFailed', projectId, { error: result.error || result.summary });
      }

      return result;
    } catch (err: any) {
      initialState.status = 'FAILED';
      initialState.endTime = new Date().toISOString();
      this.activeProjects.delete(projectId);

      const failedResult: ProjectExecutionResult = {
        success: false,
        state: initialState,
        summary: `Project '${projectId}' execution failed: ${err.message}`,
        reports: {},
        error: err.message,
      };

      this.projectHistory.set(projectId, failedResult);
      this.emitEvent('ProjectExecutionFailed', projectId, { error: err.message });
      return failedResult;
    }
  }

  getState(projectId: string): ProjectExecutionState | undefined {
    return this.activeProjects.get(projectId) || this.projectHistory.get(projectId)?.state;
  }

  getResult(projectId: string): ProjectExecutionResult | undefined {
    return this.projectHistory.get(projectId);
  }

  setStrategy(strategy: IProjectLifecycleStrategy): void {
    this.strategy = strategy;
  }

  getStrategy(): IProjectLifecycleStrategy {
    return this.strategy;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'ProjectLifecycleOrchestrator',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
