import { EventEmitter } from 'events';
import {
  MissionExecutionState,
  MissionExecutionResult,
  MissionExecutionPolicy,
} from '../../contracts/imission_execution_orchestrator';
import { MissionExecutionPlan, MissionTask } from '../../contracts/imission_decomposition';
import { IWorkerDispatcher } from '../../contracts/iworker_dispatcher';
import { ReadyTaskQueue } from './ready_task_queue';
import { TaskScheduler } from './task_scheduler';
import { IEventStore } from '../../contracts/ievent_store';
import { VerificationPipeline } from '../verification/verification_pipeline';

export class MissionExecutionOrchestrator extends EventEmitter {
  private states = new Map<string, MissionExecutionState>();
  private activeExecutions = new Set<string>();
  private verificationPipeline: VerificationPipeline;
  private defaultPolicy: MissionExecutionPolicy = {
    maxParallelWorkers: 3,
    maxTaskRetries: 2,
    timeoutMs: 60000,
    autoRetryOnFailure: true,
  };

  constructor(
    private dispatcher: IWorkerDispatcher,
    private eventStore?: IEventStore,
    verificationPipeline?: VerificationPipeline
  ) {
    super();
    this.verificationPipeline = verificationPipeline || new VerificationPipeline(eventStore);
  }

  async executeMissionPlan(
    plan: MissionExecutionPlan,
    policyConfig?: Partial<MissionExecutionPolicy>
  ): Promise<MissionExecutionResult> {
    const policy: MissionExecutionPolicy = { ...this.defaultPolicy, ...policyConfig };
    const missionId = plan.missionId;

    const state: MissionExecutionState = {
      missionId,
      planId: plan.planId,
      status: 'EXECUTING',
      completedTaskIds: [],
      failedTaskIds: [],
      runningTaskIds: [],
      pendingTaskIds: plan.tasks.map((t) => t.id),
      startTime: new Date().toISOString(),
    };

    this.states.set(missionId, state);
    this.activeExecutions.add(missionId);

    this.emitEvent('MissionExecutionStarted', missionId, {
      planId: plan.planId,
      totalTasks: plan.tasks.length,
      batchCount: plan.executionBatches.length,
    });

    const readyQueue = new ReadyTaskQueue();
    readyQueue.initializeFromPlan(plan);

    const scheduler = new TaskScheduler(this.dispatcher);
    const completedSet = new Set<string>();
    const reports: Record<string, any> = {};

    try {
      // Topological batch / ready queue iteration
      while (completedSet.size < plan.tasks.length && this.activeExecutions.has(missionId)) {
        const readyTasks = readyQueue.getReadyTasks();
        if (readyTasks.length === 0 && state.runningTaskIds.length === 0) {
          // Deadlock or unresolvable failure
          break;
        }

        const batchToRun: MissionTask[] = [];
        while (
          readyQueue.getReadyTasksCount() > 0 &&
          state.runningTaskIds.length + batchToRun.length < policy.maxParallelWorkers
        ) {
          const task = readyQueue.popNextReadyTask();
          if (task) batchToRun.push(task);
        }

        if (batchToRun.length === 0 && state.runningTaskIds.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }

        // Execute batch in parallel
        const promises = batchToRun.map(async (task) => {
          state.pendingTaskIds = state.pendingTaskIds.filter((id) => id !== task.id);
          state.runningTaskIds.push(task.id);

          this.emitEvent('TaskExecutionStarted', task.id, {
            missionId,
            workerId: task.assignedWorkerId,
          });

          let attempt = 0;
          let taskSuccess = false;
          let lastReport: any;

          while (attempt <= policy.maxTaskRetries && !taskSuccess) {
            attempt++;
            const res = await scheduler.scheduleTask(task, missionId, policy);
            lastReport = res.report;

            if (res.success && res.report?.status === 'COMPLETED') {
              // Run Verification Pipeline on generated workspace artifacts
              const workspacePath = res.report.artifacts?.find((a: any) => a.path)?.path || './.se_workspaces';
              const vResult = await this.verificationPipeline.verify({
                taskId: task.id,
                missionId,
                workspacePath,
                artifacts: res.report.artifacts,
              });

              if (vResult.success) {
                taskSuccess = true;
              } else {
                if (lastReport) {
                  lastReport.summary += ` [Verification Failed: ${vResult.errors.join(', ')}]`;
                }
                if (attempt <= policy.maxTaskRetries && policy.autoRetryOnFailure) {
                  await new Promise((res) => setTimeout(res, 100 * attempt));
                }
              }
            } else if (attempt <= policy.maxTaskRetries && policy.autoRetryOnFailure) {
              await new Promise((res) => setTimeout(res, 100 * attempt));
            }
          }

          state.runningTaskIds = state.runningTaskIds.filter((id) => id !== task.id);
          reports[task.id] = lastReport;

          if (taskSuccess) {
            task.status = 'COMPLETED';
            state.completedTaskIds.push(task.id);
            completedSet.add(task.id);

            this.emitEvent('TaskExecutionCompleted', task.id, {
              missionId,
              workerId: task.assignedWorkerId,
            });

            // Unlock downstream ready tasks
            readyQueue.unlockReadyTasks(plan, completedSet);
          } else {
            task.status = 'FAILED';
            state.failedTaskIds.push(task.id);

            this.emitEvent('TaskExecutionFailed', task.id, {
              missionId,
              workerId: task.assignedWorkerId,
              reason: lastReport?.summary || 'Task execution failed',
            });
          }
        });

        await Promise.all(promises);

        // If any task failed and we have no remaining path forward
        if (state.failedTaskIds.length > 0 && readyQueue.getReadyTasksCount() === 0 && state.runningTaskIds.length === 0) {
          break;
        }
      }

      state.endTime = new Date().toISOString();
      const allCompleted = state.completedTaskIds.length === plan.tasks.length;

      if (allCompleted) {
        state.status = 'COMPLETED';
        this.emitEvent('MissionExecutionCompleted', missionId, {
          completedCount: state.completedTaskIds.length,
        });
      } else {
        state.status = 'FAILED';
      }

      this.activeExecutions.delete(missionId);
      return {
        success: allCompleted,
        state,
        reports,
      };
    } catch (err: any) {
      state.status = 'FAILED';
      state.endTime = new Date().toISOString();
      this.activeExecutions.delete(missionId);

      return {
        success: false,
        state,
        reports,
        error: err.message,
      };
    }
  }

  cancelExecution(missionId: string): boolean {
    if (this.activeExecutions.has(missionId)) {
      this.activeExecutions.delete(missionId);
      const state = this.states.get(missionId);
      if (state) {
        state.status = 'CANCELLED';
        state.endTime = new Date().toISOString();
      }
      this.emitEvent('MissionExecutionCancelled', missionId, {});
      return true;
    }
    return false;
  }

  getState(missionId: string): MissionExecutionState | undefined {
    return this.states.get(missionId);
  }

  setDispatcher(dispatcher: IWorkerDispatcher): void {
    this.dispatcher = dispatcher;
  }

  getDispatcher(): IWorkerDispatcher {
    return this.dispatcher;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'MissionExecutionOrchestrator',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
