export interface ConflictWarning {
  type: 'DUPLICATE_OWNERSHIP' | 'PARALLEL_FILE_EDIT' | 'STALE_CONTEXT';
  taskId: string;
  workerIds: string[];
  targetFile?: string;
  message: string;
}

export class ConflictDetector {
  detectConflicts(
    activeTasks: { id: string; targetFiles: string[]; assignedWorkerId?: string }[]
  ): ConflictWarning[] {
    const warnings: ConflictWarning[] = [];
    const fileToWorkers = new Map<string, string[]>();

    for (const task of activeTasks) {
      if (task.assignedWorkerId && task.targetFiles) {
        for (const file of task.targetFiles) {
          if (!fileToWorkers.has(file)) {
            fileToWorkers.set(file, []);
          }
          fileToWorkers.get(file)!.push(task.assignedWorkerId);
        }
      }
    }

    for (const [file, workers] of fileToWorkers.entries()) {
      if (workers.length > 1) {
        warnings.push({
          type: 'PARALLEL_FILE_EDIT',
          taskId: 'multiple',
          workerIds: Array.from(new Set(workers)),
          targetFile: file,
          message: `Parallel edits detected on file '${file}' by workers [${workers.join(', ')}]`,
        });
      }
    }

    return warnings;
  }
}
