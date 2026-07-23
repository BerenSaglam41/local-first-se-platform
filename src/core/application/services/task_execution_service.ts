import { IContextBuilder } from '../../domain/interfaces/icontext_builder';
import { IProvider } from '../../domain/interfaces/iprovider';
import { EngineeringTask, ExecutionResult } from '../../domain/models/execution';
import { ResponseParser } from './response_parser';
import { PatchGenerator } from './patch_generator';
import { WorkspaceUpdater } from './workspace_updater';

export class TaskExecutionService {
  private parser = new ResponseParser();
  private patchGenerator = new PatchGenerator();
  private updater = new WorkspaceUpdater();

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
        modifiedFiles: [],
        filesSkipped: [],
        parserWarnings: [],
        patchStatus: 'none',
      };
    }
    if (!task.description || task.description.trim() === '') {
      return {
        taskId: task.id,
        status: 'ERROR',
        output: '',
        error: 'Invalid task: Task description cannot be empty',
        durationMs: Date.now() - startTime,
        modifiedFiles: [],
        filesSkipped: [],
        parserWarnings: [],
        patchStatus: 'none',
      };
    }
    if (!task.entryFile || task.entryFile.trim() === '') {
      return {
        taskId: task.id,
        status: 'ERROR',
        output: '',
        error: 'Invalid task: Entry file path is required',
        durationMs: Date.now() - startTime,
        modifiedFiles: [],
        filesSkipped: [],
        parserWarnings: [],
        patchStatus: 'none',
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
        modifiedFiles: [],
        filesSkipped: [],
        parserWarnings: [],
        patchStatus: 'none',
      };
    }

    // 3. Invoke provider
    let output = '';
    let errorMsg = '';
    let success = false;
    let exitCode: number | null = null;
    let providerDuration = 0;

    try {
      const providerResult = await this.provider.execute(contextContent);
      output = providerResult.output;
      errorMsg = providerResult.error || '';
      success = providerResult.success;
      exitCode = providerResult.exitCode;
      providerDuration = providerResult.durationMs;
    } catch (err: any) {
      return {
        taskId: task.id,
        status: 'ERROR',
        output: '',
        error: `Provider execution failure: ${err.message || err}`,
        durationMs: Date.now() - startTime,
        modifiedFiles: [],
        filesSkipped: [],
        parserWarnings: [],
        patchStatus: 'none',
      };
    }

    if (!success) {
      return {
        taskId: task.id,
        status: 'FAILED',
        output,
        error: errorMsg || `Provider process exited with status code ${exitCode}`,
        durationMs: Date.now() - startTime,
        modifiedFiles: [],
        filesSkipped: [],
        parserWarnings: [],
        patchStatus: 'failed',
      };
    }

    // 4. Parse Response & Extract Code Blocks
    const parsed = this.parser.parse(output, task.workspaceFiles, task.entryFile);
    if (!parsed.success) {
      return {
        taskId: task.id,
        status: 'SUCCESS',
        output,
        durationMs: Date.now() - startTime,
        modifiedFiles: [],
        filesSkipped: [],
        parserWarnings: [...parsed.warnings, 'No code blocks extracted from provider response.'],
        patchStatus: 'skipped',
      };
    }

    // 5. Generate patches
    const patchResult = this.patchGenerator.generatePatches(parsed.blocks, task.workspaceFiles);
    if (!patchResult.success) {
      return {
        taskId: task.id,
        status: 'FAILED',
        output,
        error: `Patch generation failed: ${patchResult.error}`,
        durationMs: Date.now() - startTime,
        modifiedFiles: [],
        filesSkipped: [],
        parserWarnings: parsed.warnings,
        patchStatus: 'failed',
      };
    }

    // 6. Update workspace
    const updateResult = this.updater.update(patchResult.patches);
    if (!updateResult.success) {
      return {
        taskId: task.id,
        status: 'FAILED',
        output,
        error: `Workspace update failed: ${updateResult.error}`,
        durationMs: Date.now() - startTime,
        modifiedFiles: updateResult.modifiedFiles,
        filesSkipped: updateResult.filesSkipped,
        parserWarnings: parsed.warnings,
        patchStatus: 'failed',
      };
    }

    return {
      taskId: task.id,
      status: 'SUCCESS',
      output,
      durationMs: Date.now() - startTime,
      modifiedFiles: updateResult.modifiedFiles,
      filesSkipped: updateResult.filesSkipped,
      parserWarnings: parsed.warnings,
      patchStatus: 'applied',
    };
  }
}
