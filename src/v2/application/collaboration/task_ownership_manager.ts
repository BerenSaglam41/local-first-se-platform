import { TaskOwnership } from '../../contracts/icollaboration';

export class TaskOwnershipManager {
  private ownershipMap = new Map<string, TaskOwnership>();

  assignOwner(taskId: string, ownerId: string, reviewerId?: string): TaskOwnership {
    const ownership: TaskOwnership = {
      taskId,
      ownerId,
      reviewerId,
      observerIds: [],
    };
    this.ownershipMap.set(taskId, ownership);
    return ownership;
  }

  assignReviewer(taskId: string, reviewerId: string): boolean {
    const ownership = this.ownershipMap.get(taskId);
    if (!ownership) return false;

    ownership.reviewerId = reviewerId;
    return true;
  }

  transferOwnership(taskId: string, newOwnerId: string): boolean {
    const ownership = this.ownershipMap.get(taskId);
    if (!ownership) return false;

    ownership.ownerId = newOwnerId;
    return true;
  }

  addObserver(taskId: string, observerId: string): boolean {
    const ownership = this.ownershipMap.get(taskId);
    if (!ownership) return false;

    if (!ownership.observerIds.includes(observerId)) {
      ownership.observerIds.push(observerId);
    }
    return true;
  }

  getOwnership(taskId: string): TaskOwnership | undefined {
    return this.ownershipMap.get(taskId);
  }

  listOwnerships(): TaskOwnership[] {
    return Array.from(this.ownershipMap.values());
  }
}
