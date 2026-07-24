import { EventEmitter } from 'events';
import { MergePlan, MergeConflictDetail } from '../../contracts/iverification_merge';
import { IEventStore } from '../../contracts/ievent_store';

export class MergeEngine extends EventEmitter {
  private mergePlans = new Map<string, MergePlan>();

  constructor(private eventStore?: IEventStore) {
    super();
  }

  prepareMergePlan(
    taskId: string,
    worktreeId: string,
    sourceBranch: string,
    targetBranch: string = 'master',
    conflicts: MergeConflictDetail[] = []
  ): MergePlan {
    const hasConflicts = conflicts.length > 0;
    const canMerge = !hasConflicts;

    const plan: MergePlan = {
      taskId,
      worktreeId,
      sourceBranch,
      targetBranch,
      hasConflicts,
      canMerge,
      conflicts,
      patchSummary: `Dry-run merge plan from ${sourceBranch} to ${targetBranch} (${conflicts.length} conflicts)`,
    };

    this.mergePlans.set(taskId, plan);

    if (canMerge) {
      this.emitEvent('MergeReady', taskId, { sourceBranch, targetBranch });
    } else {
      this.emitEvent('MergeRejected', taskId, { conflictsCount: conflicts.length });
    }

    return plan;
  }

  getMergePlan(taskId: string): MergePlan | undefined {
    return this.mergePlans.get(taskId);
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'MergeEngine',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
