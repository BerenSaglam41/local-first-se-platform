import { EventEmitter } from 'events';
import { IMissionPlanningStrategy } from '../../contracts/imission_planning_strategy';
import { DefaultMissionPlanningStrategy } from './default_mission_planning_strategy';
import { MissionExecutionPlan } from '../../contracts/imission_decomposition';
import { IEventStore } from '../../contracts/ievent_store';

export class MissionDecomposer extends EventEmitter {
  private planningStrategy: IMissionPlanningStrategy;

  constructor(
    private eventStore?: IEventStore,
    planningStrategy?: IMissionPlanningStrategy
  ) {
    super();
    this.planningStrategy = planningStrategy || new DefaultMissionPlanningStrategy();
  }

  async decomposeMission(
    missionId: string,
    goal: string,
    context?: Record<string, any>
  ): Promise<MissionExecutionPlan> {
    const plan = await this.planningStrategy.planMission(missionId, goal, context);

    this.emitEvent('MissionDecomposed', missionId, {
      planId: plan.planId,
      goal,
      taskCount: plan.tasks.length,
      batchCount: plan.executionBatches.length,
      totalEstimatedComplexity: plan.totalEstimatedComplexity,
    });

    for (const t of plan.tasks) {
      this.emitEvent('TaskCreated', t.id, {
        missionId,
        title: t.title,
        requiredCapability: t.requiredCapability,
        priority: t.priority,
      });
    }

    return plan;
  }

  setPlanningStrategy(strategy: IMissionPlanningStrategy): void {
    this.planningStrategy = strategy;
  }

  getPlanningStrategy(): IMissionPlanningStrategy {
    return this.planningStrategy;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'MissionDecomposer',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
