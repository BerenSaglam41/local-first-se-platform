import { MissionTask, MissionExecutionPlan } from '../../contracts/imission_decomposition';

export class ReadyTaskQueue {
  private queue: MissionTask[] = [];

  initializeFromPlan(plan: MissionExecutionPlan): void {
    this.queue = [];
    for (const task of plan.tasks) {
      if (task.dependencies.length === 0) {
        task.status = 'READY';
        this.queue.push(task);
      } else {
        task.status = 'BLOCKED';
      }
    }
  }

  unlockReadyTasks(plan: MissionExecutionPlan, completedTaskIds: Set<string>): MissionTask[] {
    const newlyUnlocked: MissionTask[] = [];

    for (const task of plan.tasks) {
      if (task.status === 'BLOCKED' || task.status === 'PENDING') {
        const allDepsSatisfied = task.dependencies.every((depId) => completedTaskIds.has(depId));
        if (allDepsSatisfied) {
          task.status = 'READY';
          if (!this.queue.some((t) => t.id === task.id)) {
            this.queue.push(task);
            newlyUnlocked.push(task);
          }
        }
      }
    }

    return newlyUnlocked;
  }

  popNextReadyTask(): MissionTask | undefined {
    return this.queue.shift();
  }

  getReadyTasksCount(): number {
    return this.queue.length;
  }

  getReadyTasks(): MissionTask[] {
    return [...this.queue];
  }
}
