import { Task, ExecutionBatch } from '../../domain/missions/mission_models';

export class TaskGraph {
  private tasks = new Map<string, Task>();
  private adjacencyList = new Map<string, Set<string>>(); // taskId -> dependent TaskIds (out-edges)
  private inDegree = new Map<string, number>();

  addTask(task: Task): void {
    this.tasks.set(task.id, task);
    if (!this.adjacencyList.has(task.id)) {
      this.adjacencyList.set(task.id, new Set());
    }
    if (!this.inDegree.has(task.id)) {
      this.inDegree.set(task.id, 0);
    }

    if (task.dependsOnTaskIds && task.dependsOnTaskIds.length > 0) {
      for (const depId of task.dependsOnTaskIds) {
        this.addDependency(task.id, depId);
      }
    }
  }

  addDependency(taskId: string, dependsOnTaskId: string): void {
    if (!this.adjacencyList.has(dependsOnTaskId)) {
      this.adjacencyList.set(dependsOnTaskId, new Set());
    }
    if (!this.adjacencyList.get(dependsOnTaskId)!.has(taskId)) {
      this.adjacencyList.get(dependsOnTaskId)!.add(taskId);
      this.inDegree.set(taskId, (this.inDegree.get(taskId) || 0) + 1);
    }
  }

  detectCycle(): boolean {
    const tempInDegree = new Map(this.inDegree);
    const queue: string[] = [];

    for (const [id, deg] of tempInDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    let processedCount = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      processedCount++;
      const neighbors = this.adjacencyList.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDeg = (tempInDegree.get(neighbor) || 0) - 1;
          tempInDegree.set(neighbor, newDeg);
          if (newDeg === 0) queue.push(neighbor);
        }
      }
    }

    return processedCount !== this.tasks.size;
  }

  getReadyTasks(): Task[] {
    const ready: Task[] = [];
    for (const task of this.tasks.values()) {
      if (task.status === 'BACKLOG' || task.status === 'READY') {
        const allDepsCompleted = (task.dependsOnTaskIds || []).every((depId) => {
          const depTask = this.tasks.get(depId);
          return depTask && depTask.status === 'COMPLETED';
        });

        if (allDepsCompleted) {
          task.status = 'READY';
          ready.push(task);
        }
      }
    }
    return ready;
  }

  getExecutionBatches(): ExecutionBatch[] {
    if (this.detectCycle()) {
      throw new Error('[TaskGraph] Cyclic dependency detected in task graph!');
    }

    const tempInDegree = new Map(this.inDegree);
    const batches: ExecutionBatch[] = [];
    let currentBatch: string[] = [];

    for (const [id, deg] of tempInDegree.entries()) {
      if (deg === 0) currentBatch.push(id);
    }

    let batchNum = 1;
    while (currentBatch.length > 0) {
      batches.push({ batchNumber: batchNum++, taskIds: [...currentBatch] });
      const nextBatch: string[] = [];

      for (const taskId of currentBatch) {
        const neighbors = this.adjacencyList.get(taskId);
        if (neighbors) {
          for (const neighbor of neighbors) {
            const newDeg = (tempInDegree.get(neighbor) || 0) - 1;
            tempInDegree.set(neighbor, newDeg);
            if (newDeg === 0) nextBatch.push(neighbor);
          }
        }
      }
      currentBatch = nextBatch;
    }

    return batches;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }
}
