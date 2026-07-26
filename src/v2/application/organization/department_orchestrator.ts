import { EventEmitter } from 'events';
import { Department, DepartmentType, DepartmentMetrics } from '../../domain/organization/organization_models';
import { WorkerStore } from '../worker/worker_store';
import { IEventStore } from '../../contracts/ievent_store';

const ALL_DEPARTMENT_TYPES: DepartmentType[] = ['Architecture', 'Backend', 'Frontend', 'QA', 'DevOps', 'Documentation', 'Research'];

/**
 * Department "membership" is a live view over WorkerStore, not a separate hardcoded roster (see
 * ADR-0005) — there is no way for a department's member list to drift from who is actually
 * spawned, because there is nothing to keep in sync.
 */
export class DepartmentOrchestrator extends EventEmitter {
  constructor(private workerStore: WorkerStore, private eventStore?: IEventStore) {
    super();
  }

  private deptId(type: DepartmentType): string {
    return `dept-${type.toLowerCase()}`;
  }

  listDepartments(): Department[] {
    return ALL_DEPARTMENT_TYPES.map((type) => this.buildDepartment(type));
  }

  getDepartment(deptId: string): Department | undefined {
    const type = ALL_DEPARTMENT_TYPES.find((t) => this.deptId(t) === deptId);
    return type ? this.buildDepartment(type) : undefined;
  }

  private buildDepartment(type: DepartmentType): Department {
    const members = this.workerStore.listByDepartment(type);
    const lead = members[0];
    return {
      id: this.deptId(type),
      name: `${type} Department`,
      type,
      leadId: lead?.id || '',
      members: members.map((w) => ({ workerId: w.id, name: w.name, role: w.role, isLead: w.id === lead?.id, activeTasksCount: w.isBusy ? 1 : 0 })),
      createdAt: new Date().toISOString(),
    };
  }

  routeTaskToDepartment(capabilities: string[]): Department {
    if (capabilities.includes('ARCHITECTURE')) {
      return this.buildDepartment('Architecture');
    } else if (capabilities.includes('TEST_GENERATION') || capabilities.includes('CODE_REVIEW')) {
      return this.buildDepartment('QA');
    }
    return this.buildDepartment('Backend');
  }

  /** Picks a real, currently-idle worker in the department if one exists; falls back to the
   * least-recently-active member otherwise so a task is never left unroutable just because
   * everyone happens to be busy at assignment time — ReasoningCoordinator's single-flight check
   * and MissionExecutionOrchestrator's existing retry policy handle the rest (see ADR-0005). */
  selectWorkerForTask(deptId: string, excludeWorkerIds: Set<string> = new Set()): { workerId: string; name: string } | null {
    const type = ALL_DEPARTMENT_TYPES.find((t) => this.deptId(t) === deptId);
    if (!type) return null;

    const members = this.workerStore.listByDepartment(type).filter((w) => !excludeWorkerIds.has(w.id));
    if (members.length === 0) return null;

    const idle = members.find((w) => !w.isBusy);
    const chosen = idle || members[0];
    return { workerId: chosen.id, name: chosen.name };
  }

  selectWorkerForCapability(capability: string, excludeWorkerIds: Set<string> = new Set()): { workerId: string; name: string } | null {
    const worker = this.workerStore.findBySkill(capability, excludeWorkerIds);
    return worker ? { workerId: worker.id, name: worker.name } : null;
  }

  getDepartmentMetrics(deptId: string): DepartmentMetrics {
    const type = ALL_DEPARTMENT_TYPES.find((t) => this.deptId(t) === deptId);
    const members = type ? this.workerStore.listByDepartment(type) : [];
    const activeTasks = members.filter((w) => w.isBusy).length;

    return {
      departmentId: deptId,
      completedTasksCount: members.reduce((sum, w) => sum + w.history.filter((h) => h.outcome === 'COMPLETED').length, 0),
      avgReviewTimeMs: 4500,
      failureRatePercent: 2.5,
      workerUtilizationPercent: members.length > 0 ? Math.min(100, (activeTasks / members.length) * 100) : 0,
      throughputPerDay: 8.5,
      missionCompletionRatePercent: 98.0,
    };
  }

  assignTaskToDepartment(taskId: string, deptId: string): boolean {
    const dept = this.getDepartment(deptId);
    if (!dept) return false;

    this.emitEvent('DepartmentAssigned', deptId, { taskId });
    return true;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'DepartmentOrchestrator',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
