import { EventEmitter } from 'events';
import { Mission, Task, MissionStatus } from '../../domain/missions/mission_models';
import { TaskGraph } from './task_graph';
import { MissionPlanner } from './mission_planner';
import { IEventStore } from '../../contracts/ievent_store';
import { CapabilityRegistry } from '../plugins/capability_registry';

export class MissionEngine extends EventEmitter {
  private missions = new Map<string, Mission>();
  private taskGraphs = new Map<string, TaskGraph>();
  private planner = new MissionPlanner();

  constructor(private eventStore?: IEventStore, private capabilityRegistry?: CapabilityRegistry) {
    super();
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
    return true;
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
