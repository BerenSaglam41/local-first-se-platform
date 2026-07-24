import { ITaskPlanner } from '../../domain/interfaces/itask_planner';
import { TaskPlan, SubTask } from '../../domain/models/execution';
import * as path from 'path';

export class TaskPlanner implements ITaskPlanner {
  async planTask(taskPrompt: string, workspaceFiles: string[]): Promise<TaskPlan> {
    const taskId = `plan-${Date.now()}`;
    const subTasks: SubTask[] = [];

    // Extract file paths mentioned in the prompt
    const mentionedFiles = this.extractMentionedFiles(taskPrompt);
    
    if (mentionedFiles.length === 0) {
      // Fallback to entry or primary source file
      const defaultTarget = workspaceFiles.find(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.py') || f.endsWith('.rs')) || 'src/main.ts';
      subTasks.push({
        id: `${taskId}-step-1`,
        targetFile: defaultTarget,
        objective: taskPrompt,
        dependencies: [],
        validationCriteria: 'Build and verification suite must pass cleanly.',
        status: 'pending',
      });
    } else {
      // Create ordered sub-tasks per target file or functional layer
      mentionedFiles.forEach((file, index) => {
        const isType = file.includes('type') || file.includes('interface') || file.includes('model');
        const isTest = file.includes('test') || file.includes('spec');
        
        let objective = `Execute changes for ${path.basename(file)}`;
        let validationCriteria = 'Build and test suite must pass cleanly.';

        if (isType) {
          objective = `Define core domain models and interfaces in ${path.basename(file)}`;
          validationCriteria = 'TypeScript compilation must succeed with zero syntax/type errors.';
        } else if (isTest) {
          objective = `Add automated unit tests in ${path.basename(file)}`;
          validationCriteria = 'All test assertions must pass 100%.';
        } else {
          objective = `Implement logic in ${path.basename(file)}`;
          validationCriteria = 'Module implementation must compile and pass build checks.';
        }

        const dependencies = index > 0 ? [`${taskId}-step-${index}`] : [];

        subTasks.push({
          id: `${taskId}-step-${index + 1}`,
          targetFile: file,
          objective,
          dependencies,
          validationCriteria,
          status: 'pending',
        });
      });
    }

    return {
      taskId,
      originalPrompt: taskPrompt,
      subTasks,
    };
  }

  private extractMentionedFiles(prompt: string): string[] {
    const fileRegex = /([a-zA-Z0-9_\-\.\/]+\.(?:ts|tsx|js|jsx|py|rs|go|java|json|md|toml))/g;
    const matches = prompt.match(fileRegex) || [];
    const unique = Array.from(new Set(matches));
    return unique;
  }
}
