import { IScheduler, QueueMetrics, ScheduledTask } from '../../contracts/ischeduler';

export class SchedulerSkeleton implements IScheduler {
  private queue: ScheduledTask[] = [];

  async enqueueTask(task: ScheduledTask): Promise<void> {
    this.queue.push(task);
  }

  async getNextTaskForWorker(employeeId: string, capabilities: string[]): Promise<ScheduledTask | null> {
    const readyIdx = this.queue.findIndex(t => t.status === 'READY');
    if (readyIdx !== -1) {
      const task = this.queue[readyIdx];
      task.status = 'IN_PROGRESS';
      task.ownerEmployeeId = employeeId;
      return task;
    }
    return null;
  }

  async markTaskComplete(taskId: string, resultData: Record<string, any>): Promise<void> {
    const task = this.queue.find(t => t.id === taskId);
    if (task) {
      task.status = 'COMPLETED';
    }
  }

  async markTaskFailed(taskId: string, error: string): Promise<void> {
    const task = this.queue.find(t => t.id === taskId);
    if (task) {
      task.status = 'FAILED';
    }
  }

  getQueueMetrics(): QueueMetrics {
    return {
      totalPending: this.queue.filter(t => t.status === 'BACKLOG' || t.status === 'READY').length,
      totalRunning: this.queue.filter(t => t.status === 'IN_PROGRESS').length,
      totalCompleted: this.queue.filter(t => t.status === 'COMPLETED').length,
      totalFailed: this.queue.filter(t => t.status === 'FAILED').length,
    };
  }
}
