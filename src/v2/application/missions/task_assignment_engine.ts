import { EventEmitter } from 'events';
import { MissionExecutionPlan, MissionTask } from '../../contracts/imission_decomposition';
import { DepartmentOrchestrator } from '../organization/department_orchestrator';
import { IEventStore } from '../../contracts/ievent_store';

const CAPABILITY_DEPT_MAP: Record<string, string> = {
  Architecture: 'dept-architecture',
  Backend: 'dept-backend',
  QA: 'dept-qa',
  Documentation: 'dept-documentation',
};

function departmentForCapability(capability: string): string {
  return CAPABILITY_DEPT_MAP[capability] || 'dept-backend';
}

export class TaskAssignmentEngine extends EventEmitter {
  constructor(
    private departmentOrchestrator: DepartmentOrchestrator,
    private eventStore?: IEventStore
  ) {
    super();
  }

  /**
   * Batch-aware assignment: tasks within the same topological execution batch avoid doubling up
   * on one worker when another idle department member is available, which is what actually
   * caused concurrent same-worker dispatch under the old per-task-independent assignment (see
   * ADR-0005). Falls back to the department's only member if that's genuinely all there is.
   */
  assignPlanTasks(plan: MissionExecutionPlan): MissionExecutionPlan {
    const departmentAssignments: Record<string, string[]> = {};
    const workerAssignments: Record<string, string[]> = {};

    for (const batch of plan.executionBatches) {
      const usedInThisBatch = new Set<string>();

      for (const taskId of batch) {
        const task = plan.tasks.find((t) => t.id === taskId);
        if (!task) continue;

        const targetDeptId = departmentForCapability(task.requiredCapability);
        const skillMatch = this.departmentOrchestrator.selectWorkerForCapability(task.requiredCapability, usedInThisBatch);
        const selection =
          skillMatch ||
          this.departmentOrchestrator.selectWorkerForTask(targetDeptId, usedInThisBatch) ||
          this.departmentOrchestrator.selectWorkerForTask(targetDeptId);

        if (!selection) continue;

        usedInThisBatch.add(selection.workerId);
        task.assignedDepartmentId = targetDeptId;
        task.assignedWorkerId = selection.workerId;
        task.status = 'ASSIGNED';

        if (!departmentAssignments[targetDeptId]) departmentAssignments[targetDeptId] = [];
        departmentAssignments[targetDeptId].push(task.id);

        if (!workerAssignments[selection.workerId]) workerAssignments[selection.workerId] = [];
        workerAssignments[selection.workerId].push(task.id);

        this.emitEvent('TaskAssigned', task.id, {
          missionId: plan.missionId,
          departmentId: targetDeptId,
          workerId: selection.workerId,
          requiredCapability: task.requiredCapability,
        });
      }
    }

    plan.departmentAssignments = departmentAssignments;
    plan.workerAssignments = workerAssignments;
    return plan;
  }

  assignSingleTask(task: MissionTask): { departmentId: string; workerId: string } | undefined {
    const targetDeptId = departmentForCapability(task.requiredCapability);
    const selection = this.departmentOrchestrator.selectWorkerForTask(targetDeptId);
    return selection ? { departmentId: targetDeptId, workerId: selection.workerId } : undefined;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'TaskAssignmentEngine',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
