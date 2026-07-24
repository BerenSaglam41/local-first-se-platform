import { EventEmitter } from 'events';
import {
  MissionExecutionPlan,
  MissionTask,
  AssignmentPolicy,
} from '../../contracts/imission_decomposition';
import { DepartmentOrchestrator } from '../organization/department_orchestrator';
import { IEventStore } from '../../contracts/ievent_store';

export class TaskAssignmentEngine extends EventEmitter {
  private defaultPolicy: AssignmentPolicy = {
    strategy: 'CAPABILITY_WORKLOAD',
    maxWorkloadPerWorker: 5,
  };

  constructor(
    private departmentOrchestrator: DepartmentOrchestrator,
    private eventStore?: IEventStore
  ) {
    super();
  }

  assignPlanTasks(plan: MissionExecutionPlan): MissionExecutionPlan {
    const departmentAssignments: Record<string, string[]> = {};
    const workerAssignments: Record<string, string[]> = {};

    for (const task of plan.tasks) {
      const assignment = this.assignSingleTask(task);
      if (assignment) {
        task.assignedDepartmentId = assignment.departmentId;
        task.assignedWorkerId = assignment.workerId;
        task.status = 'ASSIGNED';

        if (!departmentAssignments[assignment.departmentId]) {
          departmentAssignments[assignment.departmentId] = [];
        }
        departmentAssignments[assignment.departmentId].push(task.id);

        if (!workerAssignments[assignment.workerId]) {
          workerAssignments[assignment.workerId] = [];
        }
        workerAssignments[assignment.workerId].push(task.id);

        this.emitEvent('TaskAssigned', task.id, {
          missionId: plan.missionId,
          departmentId: assignment.departmentId,
          workerId: assignment.workerId,
          requiredCapability: task.requiredCapability,
        });
      }
    }

    plan.departmentAssignments = departmentAssignments;
    plan.workerAssignments = workerAssignments;
    return plan;
  }

  assignSingleTask(task: MissionTask): { departmentId: string; workerId: string } | undefined {
    // Capability mapping to department types
    const capabilityDeptMap: Record<string, string> = {
      Architecture: 'dept-architecture',
      Backend: 'dept-backend',
      QA: 'dept-qa',
      Documentation: 'dept-documentation',
    };

    const targetDeptId = capabilityDeptMap[task.requiredCapability] || 'dept-backend';
    const dept = this.departmentOrchestrator.getDepartment(targetDeptId);

    if (dept && dept.members.length > 0) {
      // Pick worker with least active workload
      const sortedMembers = [...dept.members].sort(
        (a, b) => a.activeTasksCount - b.activeTasksCount
      );
      const chosenWorker = sortedMembers[0];
      chosenWorker.activeTasksCount += 1;

      return {
        departmentId: targetDeptId,
        workerId: chosenWorker.workerId,
      };
    }

    // Fallback if specific department missing
    return {
      departmentId: 'dept-backend',
      workerId: 'emp-bob',
    };
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
