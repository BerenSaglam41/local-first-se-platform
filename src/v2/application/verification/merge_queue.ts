import { EventEmitter } from 'events';
import { MergeCandidate } from '../../contracts/iverification_merge';
import { IEventStore } from '../../contracts/ievent_store';

export class MergeQueue extends EventEmitter {
  private queue: MergeCandidate[] = [];

  constructor(private eventStore?: IEventStore) {
    super();
  }

  enqueue(taskId: string, worktreeId: string, priority: number = 1): MergeCandidate {
    const candidate: MergeCandidate = {
      id: `mc-${taskId}-${Date.now()}`,
      taskId,
      worktreeId,
      priority,
      enqueuedAt: new Date().toISOString(),
      status: 'QUEUED',
    };

    this.queue.push(candidate);
    this.queue.sort((a, b) => b.priority - a.priority);

    this.emitEvent('MergeQueued', taskId, { candidateId: candidate.id, priority });
    return candidate;
  }

  dequeue(): MergeCandidate | undefined {
    const item = this.queue.shift();
    if (item) {
      item.status = 'INSPECTING';
    }
    return item;
  }

  cancel(taskId: string): boolean {
    const idx = this.queue.findIndex((c) => c.taskId === taskId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  list(): MergeCandidate[] {
    return [...this.queue];
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'MergeQueue',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
