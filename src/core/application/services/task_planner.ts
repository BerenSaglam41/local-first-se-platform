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
      // Infer target filename from task prompt intent (e.g. "Create Calculator class" -> "src/calculator.ts")
      const inferredFile = this.inferTargetFileFromIntent(taskPrompt, workspaceFiles);
      subTasks.push({
        id: `${taskId}-step-1`,
        targetFile: inferredFile,
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

  private inferTargetFileFromIntent(prompt: string, workspaceFiles: string[]): string {
    const classMatch = prompt.match(/(?:Create|Implement|Add|Refactor)\s+(?:a\s+)?([A-Za-z0-9_]+)\s+(?:class|service|module|component|helper|controller)/i);
    if (classMatch && classMatch[1]) {
      const name = classMatch[1].toLowerCase();
      const existing = workspaceFiles.find(f => path.basename(f, path.extname(f)).toLowerCase() === name);
      if (existing) return existing;

      const ext = workspaceFiles.some(f => f.endsWith('.ts')) ? '.ts' : workspaceFiles.some(f => f.endsWith('.py')) ? '.py' : workspaceFiles.some(f => f.endsWith('.rs')) ? '.rs' : '.ts';
      return `src/${name}${ext}`;
    }

    const sourceFile = workspaceFiles.find(f => !f.includes('package-lock') && !f.includes('package.json') && (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.py')));
    return sourceFile || 'src/main.ts';
  }
}
