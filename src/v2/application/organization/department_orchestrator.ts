import { EventEmitter } from 'events';
import { Department, DepartmentType, DepartmentMember, DepartmentMetrics } from '../../domain/organization/organization_models';
import { IEventStore } from '../../contracts/ievent_store';

export class DepartmentOrchestrator extends EventEmitter {
  private departments = new Map<string, Department>();

  constructor(private eventStore?: IEventStore) {
    super();
    this.initializeDefaultDepartments();
  }

  private initializeDefaultDepartments(): void {
    const depts: { type: DepartmentType; name: string; leadId: string; members: DepartmentMember[] }[] = [
      {
        type: 'Architecture',
        name: 'Architecture Department',
        leadId: 'emp-alice',
        members: [{ workerId: 'emp-alice', name: 'Alice', role: 'Lead Architect', isLead: true, activeTasksCount: 0 }],
      },
      {
        type: 'Backend',
        name: 'Backend Department',
        leadId: 'emp-bob',
        members: [{ workerId: 'emp-bob', name: 'Bob', role: 'Backend Engineer', isLead: true, activeTasksCount: 0 }],
      },
      {
        type: 'QA',
        name: 'QA Department',
        leadId: 'emp-charlie',
        members: [{ workerId: 'emp-charlie', name: 'Charlie', role: 'QA Engineer', isLead: true, activeTasksCount: 0 }],
      },
      {
        type: 'Frontend',
        name: 'Frontend Department',
        leadId: 'emp-frontend-lead',
        members: [{ workerId: 'emp-frontend-lead', name: 'Frank', role: 'Frontend Lead', isLead: true, activeTasksCount: 0 }],
      },
      {
        type: 'DevOps',
        name: 'DevOps Department',
        leadId: 'emp-devops-lead',
        members: [{ workerId: 'emp-devops-lead', name: 'Dave', role: 'DevOps Lead', isLead: true, activeTasksCount: 0 }],
      },
      {
        type: 'Documentation',
        name: 'Documentation Department',
        leadId: 'emp-doc-lead',
        members: [{ workerId: 'emp-doc-lead', name: 'Diana', role: 'Doc Lead', isLead: true, activeTasksCount: 0 }],
      },
      {
        type: 'Research',
        name: 'Research Department',
        leadId: 'emp-research-lead',
        members: [{ workerId: 'emp-research-lead', name: 'Ray', role: 'Research Lead', isLead: true, activeTasksCount: 0 }],
      },
    ];

    for (const d of depts) {
      const id = `dept-${d.type.toLowerCase()}`;
      const dept: Department = {
        id,
        name: d.name,
        type: d.type,
        leadId: d.leadId,
        members: d.members,
        createdAt: new Date().toISOString(),
      };
      this.departments.set(id, dept);
    }
  }

  routeTaskToDepartment(capabilities: string[]): Department {
    if (capabilities.includes('ARCHITECTURE')) {
      return this.departments.get('dept-architecture')!;
    } else if (capabilities.includes('TEST_GENERATION') || capabilities.includes('CODE_REVIEW')) {
      return this.departments.get('dept-qa')!;
    } else if (capabilities.includes('CODE_GENERATION')) {
      return this.departments.get('dept-backend')!;
    }
    return this.departments.get('dept-backend')!;
  }

  selectWorkerForTask(deptId: string): DepartmentMember | null {
    const dept = this.departments.get(deptId);
    if (!dept || dept.members.length === 0) return null;

    // Load balancing: pick member with least active tasks
    const sorted = [...dept.members].sort((a, b) => a.activeTasksCount - b.activeTasksCount);
    const chosen = sorted[0];
    chosen.activeTasksCount++;
    return chosen;
  }

  getDepartmentMetrics(deptId: string): DepartmentMetrics {
    const dept = this.departments.get(deptId);
    const memberCount = dept ? dept.members.length : 1;
    const activeTasks = dept ? dept.members.reduce((acc, m) => acc + m.activeTasksCount, 0) : 0;

    return {
      departmentId: deptId,
      completedTasksCount: 12,
      avgReviewTimeMs: 4500,
      failureRatePercent: 2.5,
      workerUtilizationPercent: Math.min(100, (activeTasks / memberCount) * 100),
      throughputPerDay: 8.5,
      missionCompletionRatePercent: 98.0,
    };
  }

  assignTaskToDepartment(taskId: string, deptId: string): boolean {
    const dept = this.departments.get(deptId);
    if (!dept) return false;

    this.emitEvent('DepartmentAssigned', deptId, { taskId });
    return true;
  }

  listDepartments(): Department[] {
    return Array.from(this.departments.values());
  }

  getDepartment(deptId: string): Department | undefined {
    return this.departments.get(deptId);
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
