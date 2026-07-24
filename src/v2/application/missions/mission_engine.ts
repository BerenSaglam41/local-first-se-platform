import { EventEmitter } from 'events';
import { Mission, Task, MissionStatus } from '../../domain/missions/mission_models';
import { TaskGraph } from './task_graph';
import { MissionPlanner } from './mission_planner';
import { IEventStore } from '../../contracts/ievent_store';
import { CapabilityRegistry } from '../plugins/capability_registry';
import { MissionDecomposer } from './mission_decomposer';
import { TaskAssignmentEngine } from './task_assignment_engine';
import { DepartmentOrchestrator } from '../organization/department_orchestrator';
import { MissionExecutionPlan, MissionTask } from '../../contracts/imission_decomposition';

export class MissionEngine extends EventEmitter {
  private missions = new Map<string, Mission>();
  private taskGraphs = new Map<string, TaskGraph>();
  private executionPlans = new Map<string, MissionExecutionPlan>();
  private planner = new MissionPlanner();
  private decomposer: MissionDecomposer;
  private assignmentEngine?: TaskAssignmentEngine;

  constructor(
    private eventStore?: IEventStore,
    private capabilityRegistry?: CapabilityRegistry,
    departmentOrchestrator?: DepartmentOrchestrator,
    decomposer?: MissionDecomposer,
    assignmentEngine?: TaskAssignmentEngine
  ) {
    super();
    this.decomposer = decomposer || new MissionDecomposer(eventStore);
    this.decomposer.on('MissionDecomposed', (payload) => this.emit('MissionDecomposed', payload));
    this.decomposer.on('TaskCreated', (payload) => this.emit('TaskCreated', payload));

    if (departmentOrchestrator) {
      this.assignmentEngine = assignmentEngine || new TaskAssignmentEngine(departmentOrchestrator, eventStore);
    }
    if (this.assignmentEngine) {
      this.assignmentEngine.on('TaskAssigned', (payload) => this.emit('TaskAssigned', payload));
    }
  }

  setTaskAssignmentEngine(assignmentEngine: TaskAssignmentEngine): void {
    this.assignmentEngine = assignmentEngine;
    this.assignmentEngine.on('TaskAssigned', (payload) => this.emit('TaskAssigned', payload));
  }

  async decomposeAndPlanMission(
    title: string,
    goal: string,
    context?: Record<string, any>
  ): Promise<{ mission: Mission; plan: MissionExecutionPlan }> {
    const mission = this.createMission(title, goal);
    const plan = await this.decomposer.decomposeMission(mission.id, goal, context);

    if (this.assignmentEngine) {
      this.assignmentEngine.assignPlanTasks(plan);
    }

    this.executionPlans.set(mission.id, plan);
    return { mission, plan };
  }

  createMission(title: string, goal: string): Mission {
    const id = `mission-${Date.now()}`;
    const now = new Date().toISOString();
    const mission: Mission = {
      id,
      title,
      goal,
      status: 'CREATED',
      createdAt: now,
      updatedAt: now,
    };

    this.missions.set(id, mission);
    const graph = this.planner.planMission(mission, goal);
    this.taskGraphs.set(id, graph);

    this.emitEvent('MissionCreated', id, { title, goal });
    for (const t of graph.getAllTasks()) {
      this.emitEvent('TaskCreated', t.id, { missionId: id, title: t.title });
    }

    return mission;
  }

  startMission(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.status === 'RUNNING') return false;

    mission.status = 'RUNNING';
    mission.updatedAt = new Date().toISOString();
    this.emitEvent('MissionStarted', missionId, {});

    const plan = this.executionPlans.get(missionId);
    if (plan) {
      for (const task of plan.tasks) {
        if (task.status === 'ASSIGNED' || task.status === 'READY') {
          this.startTask(task.id, missionId);
        }
      }
    }

    return true;
  }

  startTask(taskId: string, missionId: string): void {
    const plan = this.executionPlans.get(missionId);
    if (plan) {
      const task = plan.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = 'RUNNING';
        this.emitEvent('TaskStarted', taskId, { missionId, workerId: task.assignedWorkerId });
      }
    }
  }

  completeTask(taskId: string, missionId: string): void {
    const plan = this.executionPlans.get(missionId);
    if (plan) {
      const task = plan.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = 'COMPLETED';
        this.emitEvent('TaskCompleted', taskId, { missionId, workerId: task.assignedWorkerId });
      }

      // Check if all tasks completed
      const allDone = plan.tasks.every((t) => t.status === 'COMPLETED');
      if (allDone) {
        this.completeMission(missionId);
      }
    }
  }

  failTask(taskId: string, missionId: string, reason: string): void {
    const plan = this.executionPlans.get(missionId);
    if (plan) {
      const task = plan.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = 'FAILED';
        this.emitEvent('TaskFailed', taskId, { missionId, reason });
      }
    }
  }

  pauseMission(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.status !== 'RUNNING') return false;

    mission.status = 'PAUSED';
    mission.updatedAt = new Date().toISOString();
    this.emitEvent('MissionPaused', missionId, {});
    return true;
  }

  resumeMission(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.status !== 'PAUSED') return false;

    mission.status = 'RUNNING';
    mission.updatedAt = new Date().toISOString();
    this.emitEvent('MissionStarted', missionId, {});
    return true;
  }

  cancelMission(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    mission.status = 'CANCELLED';
    mission.updatedAt = new Date().toISOString();
    this.emitEvent('MissionFailed', missionId, { reason: 'Cancelled by CEO' });
    return true;
  }

  completeMission(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    mission.status = 'COMPLETED';
    mission.completedAt = new Date().toISOString();
    mission.updatedAt = mission.completedAt;
    this.emitEvent('MissionCompleted', missionId, {});
    return true;
  }

  archiveMission(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    mission.status = 'ARCHIVED';
    mission.updatedAt = new Date().toISOString();
    return true;
  }

  getMission(id: string): Mission | undefined {
    return this.missions.get(id);
  }

  getExecutionPlan(missionId: string): MissionExecutionPlan | undefined {
    return this.executionPlans.get(missionId);
  }

  getTaskGraph(missionId: string): TaskGraph | undefined {
    return this.taskGraphs.get(missionId);
  }

  listMissions(): Mission[] {
    return Array.from(this.missions.values());
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'MissionEngine',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
