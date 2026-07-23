import { IContextBuilder } from '../../domain/interfaces/icontext_builder';
import { IProvider } from '../../domain/interfaces/iprovider';
import { EngineeringTask, ExecutionResult } from '../../domain/models/execution';

export class TaskExecutionService {
  constructor(
    private contextBuilder: IContextBuilder,
    private provider: IProvider
  ) {}

  async executeTask(task: EngineeringTask): Promise<ExecutionResult> {
    const startTime = Date.now();

    // 1. Validate task request
    if (!task.id) {
      return {
        taskId: 'unknown',
        status: 'ERROR',
        output: '',
        error: 'Invalid task: Task ID is required',
        durationMs: Date.now() - startTime,
      };
    }
    if (!task.description || task.description.trim() === '') {
      return {
        taskId: task.id,
        status: 'ERROR',
        output: '',
        error: 'Invalid task: Task description cannot be empty',
        durationMs: Date.now() - startTime,
      };
    }
    if (!task.entryFile || task.entryFile.trim() === '') {
      return {
        taskId: task.id,
        status: 'ERROR',
        output: '',
        error: 'Invalid task: Entry file path is required',
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Build context
    let contextContent = '';
    try {
      const contextResult = await this.contextBuilder.buildContext(
        task.description,
        task.entryFile,
        task.workspaceFiles
      );
      contextContent = contextResult.codeContent;
    } catch (err: any) {
      return {
        taskId: task.id,
        status: 'ERROR',
        output: '',
        error: `Context generation failure: ${err.message || err}`,
        durationMs: Date.now() - startTime,
      };
    }

    // 3. Invoke provider
    try {
      const providerResult = await this.provider.execute(contextContent);
      
      return {
        taskId: task.id,
        status: providerResult.success ? 'SUCCESS' : 'FAILED',
        output: providerResult.output,
        error: providerResult.error,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        taskId: task.id,
        status: 'ERROR',
        output: '',
        error: `Provider execution failure: ${err.message || err}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
