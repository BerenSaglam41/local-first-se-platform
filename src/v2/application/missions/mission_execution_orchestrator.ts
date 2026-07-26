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
import { CollaborationEngine } from '../collaboration/collaboration_engine';
import { WorkspaceEngine } from '../workspace/workspace_engine';
import { WorkforceRepository } from '../../contracts/iworkforce_repository';

export class MissionExecutionOrchestrator extends EventEmitter {
  private states = new Map<string, MissionExecutionState>();
  private activeExecutions = new Set<string>();
  private verificationPipeline: VerificationPipeline;
  private plans = new Map<string, MissionExecutionPlan>();
  private reportsByMission = new Map<string, Record<string, any>>();
  private defaultPolicy: MissionExecutionPolicy = {
    maxParallelWorkers: 3,
    maxTaskRetries: 2,
    // See ReasoningCoordinator's matching comment / ADR-0012 (M29.1 Fix #3): 60s was measured to
    // be unrealistic for real Claude Code CLI latency on complex prompts (~125s observed for a
    // genuine architecture-generation call). This value now actually reaches the real reasoning
    // call via WorkerExecutionEngine -> ReasoningRequest.timeoutMs (previously silently discarded).
    timeoutMs: 240000,
    autoRetryOnFailure: true,
  };

  constructor(
    private dispatcher: IWorkerDispatcher,
    private eventStore?: IEventStore,
    verificationPipeline?: VerificationPipeline,
    private collaborationEngine?: CollaborationEngine,
    private workspaceEngine?: WorkspaceEngine,
    private workforceRepository?: WorkforceRepository
  ) {
    super();
    this.verificationPipeline = verificationPipeline || new VerificationPipeline(eventStore);
  }

  async executeMissionPlan(
    plan: MissionExecutionPlan,
    policyConfig?: Partial<MissionExecutionPolicy>
  ): Promise<MissionExecutionResult> {
    const policy: MissionExecutionPolicy = { ...this.defaultPolicy, ...policyConfig };
    policy.workspacePath = plan.workspacePath || policy.workspacePath;
    policy.projectId = plan.projectId || policy.projectId;
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
    this.plans.set(missionId, plan);
    this.activeExecutions.add(missionId);

    await Promise.all(plan.tasks.map((task) => this.persistTask(task, missionId, plan.projectId)));

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
    this.reportsByMission.set(missionId, reports);

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
          await this.persistTask(task, missionId, plan.projectId, 'RUNNING');

          this.emitEvent('TaskExecutionStarted', task.id, {
            missionId,
            workerId: task.assignedWorkerId,
          });
          if (task.assignedWorkerId && this.collaborationEngine) {
            this.collaborationEngine.getOwnershipManager().assignOwner(task.id, task.assignedWorkerId);
          }

          let attempt = 0;
          let taskSuccess = false;
          let lastReport: any;
          let lastVerification: any;

          while (attempt <= policy.maxTaskRetries && !taskSuccess) {
            attempt++;
            const taskWorktree = this.workspaceEngine?.createTaskWorktree(plan.workspacePath || '', task.assignedWorkerId || 'unassigned', missionId);
            const executionWorkspacePath = taskWorktree?.worktreePath || plan.workspacePath || policy.workspacePath;
            const handoff: Record<string, any> = {};
            for (const dependencyId of task.dependencies) {
              const dependencyReport = reports[dependencyId];
              if (dependencyReport) {
                handoff[dependencyId] = {
                  workerId: dependencyReport.workerId,
                  summary: dependencyReport.summary,
                  filesCreated: dependencyReport.filesCreated,
                  filesModified: dependencyReport.filesModified,
                };
              }
            }
            if (lastVerification && !lastVerification.success) {
              handoff.verificationFailure = {
                qualityScore: lastVerification.qualityScore,
                errors: lastVerification.errors,
                warnings: lastVerification.warnings,
                instruction: 'Repair the verification failures before repeating the task. Inspect the existing files first; do not overwrite working code blindly.',
              };
            }
            const res = await scheduler.scheduleTask(task, missionId, {
              ...policy,
              workspacePath: executionWorkspacePath,
              contextPackage: Object.keys(handoff).length > 0 ? handoff : undefined,
            });
            lastReport = res.report;

            if (res.success && res.report?.status === 'COMPLETED') {
              // Run Verification Pipeline on the real workspace this task actually ran in.
              const workspacePath = res.report.workspacePath || './.se_workspaces';
              const vResult = await this.verificationPipeline.verify({
                taskId: task.id,
                missionId,
                workspacePath,
                artifacts: res.report.artifacts,
              });
              lastVerification = vResult;

              if (vResult.success) {
                if (taskWorktree && this.workspaceEngine) {
                  const merge = this.workspaceEngine.commitAndMergeTaskWorktree(plan.workspacePath!, taskWorktree.worktreeId, `SE-OS: complete ${task.id}`);
                  taskSuccess = merge.success;
                  if (!merge.success && lastReport) lastReport.summary += ` [Git merge failed: ${merge.error}]`;
                } else {
                  taskSuccess = true;
                }
              } else {
                if (lastReport) {
                  lastReport.summary += ` [Verification Failed: ${vResult.errors.join(', ')}]`;
                }
                if (attempt <= policy.maxTaskRetries && policy.autoRetryOnFailure) {
                  await new Promise((res) => setTimeout(res, 100 * attempt));
                }
              }
              if (!taskSuccess && taskWorktree && this.workspaceEngine) {
                this.workspaceEngine.removeTaskWorktree(plan.workspacePath!, taskWorktree.worktreeId);
              }
            } else if (attempt <= policy.maxTaskRetries && policy.autoRetryOnFailure) {
              if (taskWorktree && this.workspaceEngine) this.workspaceEngine.removeTaskWorktree(plan.workspacePath!, taskWorktree.worktreeId);
              await new Promise((res) => setTimeout(res, 100 * attempt));
            } else if (taskWorktree && this.workspaceEngine) {
              this.workspaceEngine.removeTaskWorktree(plan.workspacePath!, taskWorktree.worktreeId);
            }
          }

          state.runningTaskIds = state.runningTaskIds.filter((id) => id !== task.id);
          // Real verification data is attached alongside the execution report (not folded into
          // its typed shape) so the final project report can honestly surface what was actually
          // checked, without widening ExecutionReport's contract for a field only this orchestrator
          // produces.
          reports[task.id] = lastReport ? { ...lastReport, verification: lastVerification } : lastReport;

          if (taskSuccess) {
            task.status = 'COMPLETED';
            await this.persistTask(task, missionId, plan.projectId, 'COMPLETED');
            state.completedTaskIds.push(task.id);
            completedSet.add(task.id);

            this.emitEvent('TaskExecutionCompleted', task.id, {
              missionId,
              workerId: task.assignedWorkerId,
            });

            // Make hand-off visible to the team. Review requests are recorded, but verification
            // remains the execution gate; a future human/AI reviewer can approve or reject it.
            const reviewer = plan.tasks.find(
              (candidate) => candidate.requiredCapability === 'QA' && candidate.assignedWorkerId && candidate.assignedWorkerId !== task.assignedWorkerId
            );
            if (this.collaborationEngine && task.assignedWorkerId && reviewer?.assignedWorkerId) {
              await this.collaborationEngine.requestReview(task.id, task.assignedWorkerId, reviewer.assignedWorkerId, missionId);
            }
            if (this.collaborationEngine && task.assignedWorkerId) {
              for (const downstream of plan.tasks.filter((candidate) => candidate.dependencies.includes(task.id))) {
                if (!downstream.assignedWorkerId || downstream.assignedWorkerId === task.assignedWorkerId) continue;
                await this.collaborationEngine.sendMessage({
                  id: `msg-done-${task.id}-${downstream.id}`,
                  senderId: task.assignedWorkerId,
                  senderRole: 'Engineer',
                  recipientId: downstream.assignedWorkerId,
                  messageType: 'TASK_COMPLETION',
                  missionId,
                  taskId: task.id,
                  summary: `Task ${task.id} completed; output is available in the shared workspace for ${downstream.id}.`,
                  payload: { filesCreated: lastReport?.filesCreated || [], filesModified: lastReport?.filesModified || [] },
                  timestamp: new Date().toISOString(),
                });
              }
            }

            // Unlock downstream ready tasks
            readyQueue.unlockReadyTasks(plan, completedSet);
          } else {
            task.status = 'FAILED';
            await this.persistTask(task, missionId, plan.projectId, 'FAILED');
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

  /** Reopens a rejected review as a real worker execution, then runs verification again. */
  async retryTaskAfterReview(taskId: string, reviewerId: string, missionId: string, feedback: string): Promise<void> {
    const plan = this.plans.get(missionId);
    const task = plan?.tasks.find((candidate) => candidate.id === taskId);
    const state = this.states.get(missionId);
    if (!plan || !task || !state) return;

    const scheduler = new TaskScheduler(this.dispatcher);
    const result = await scheduler.scheduleTask(task, missionId, {
      ...this.defaultPolicy,
      workspacePath: plan.workspacePath,
      projectId: plan.projectId,
      contextPackage: {
        reviewFeedback: feedback,
        reviewerId,
        instruction: 'Apply the reviewer feedback, preserve correct existing work, and return the repaired implementation.',
      },
    });
    const report = result.report;
    const verification = report?.workspacePath
      ? await this.verificationPipeline.verify({ taskId, missionId, workspacePath: report.workspacePath, artifacts: report.artifacts })
      : undefined;
    this.reportsByMission.get(missionId)![taskId] = report ? { ...report, verification } : report;

    if (result.success && report?.status === 'COMPLETED' && verification?.success) {
      task.status = 'COMPLETED';
      await this.persistTask(task, missionId, plan.projectId, 'COMPLETED');
      if (!state.completedTaskIds.includes(taskId)) state.completedTaskIds.push(taskId);
      state.failedTaskIds = state.failedTaskIds.filter((id) => id !== taskId);
      await this.collaborationEngine?.approveReview(taskId, reviewerId, missionId, 'Auto-repair passed verification.');
      this.emitEvent('TaskAutoRepaired', taskId, { missionId, reviewerId, feedback });
    } else {
      task.status = 'FAILED';
      await this.persistTask(task, missionId, plan.projectId, 'FAILED');
      if (!state.failedTaskIds.includes(taskId)) state.failedTaskIds.push(taskId);
      this.emitEvent('TaskAutoRepairFailed', taskId, { missionId, reviewerId, errors: verification?.errors || [result.error || 'worker execution failed'] });
    }
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

  private async persistTask(task: MissionTask, missionId: string, projectId?: string, status = task.status): Promise<void> {
    try {
      await this.workforceRepository?.upsertTask({
        taskId: task.id,
        projectId,
        missionId,
        workerId: task.assignedWorkerId,
        status,
        title: task.title,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // SQLite availability is observability, not the execution gate.
    }
  }
}
