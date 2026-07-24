import { TaskPlan } from '../models/execution';

export interface ITaskPlanner {
  planTask(taskPrompt: string, workspaceFiles: string[]): Promise<TaskPlan>;
}
