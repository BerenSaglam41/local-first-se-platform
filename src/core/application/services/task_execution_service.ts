import { IContextBuilder } from '../../domain/interfaces/icontext_builder';
import { IProvider } from '../../domain/interfaces/iprovider';
import { IConfig } from '../../domain/interfaces/iconfig';
import { IProcessRuntime } from '../../domain/interfaces/iprocess_runtime';
import { EngineeringTask, ExecutionResult } from '../../domain/models/execution';
import { ResponseParser } from './response_parser';
import { PatchGenerator } from './patch_generator';
import { WorkspaceUpdater } from './workspace_updater';
import { ResponseValidator } from './response_validator';
import { VerificationRunner } from './verification_runner';

export class TaskExecutionService {
  private parser = new ResponseParser();
  private patchGenerator = new PatchGenerator();
  private updater = new WorkspaceUpdater();
  private validator = new ResponseValidator();
  private verificationRunner: VerificationRunner;

  constructor(
    private contextBuilder: IContextBuilder,
    private provider: IProvider,
    private config: IConfig,
    private runtime: IProcessRuntime
  ) {
    this.verificationRunner = new VerificationRunner(runtime);
  }

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
        validationStatus: 'skipped',
        validationErrors: ['Invalid task request'],
        validationWarnings: [],
        parserConfidence: 0.0,
        verificationStatus: 'skipped',
        verificationSteps: [],
        verificationLogs: '',
        buildPassed: false,
        testsPassed: false,
        verificationDuration: 0,
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
        validationStatus: 'skipped',
        validationErrors: ['Invalid task request'],
        validationWarnings: [],
        parserConfidence: 0.0,
        verificationStatus: 'skipped',
        verificationSteps: [],
        verificationLogs: '',
        buildPassed: false,
        testsPassed: false,
        verificationDuration: 0,
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
        validationStatus: 'skipped',
        validationErrors: ['Invalid task request'],
        validationWarnings: [],
        parserConfidence: 0.0,
        verificationStatus: 'skipped',
        verificationSteps: [],
        verificationLogs: '',
        buildPassed: false,
        testsPassed: false,
        verificationDuration: 0,
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
        validationStatus: 'skipped',
        validationErrors: [`Context compilation error: ${err.message || err}`],
        validationWarnings: [],
        parserConfidence: 0.0,
        verificationStatus: 'skipped',
        verificationSteps: [],
        verificationLogs: '',
        buildPassed: false,
        testsPassed: false,
        verificationDuration: 0,
      };
    }

    // 3. Prepend task instructions to codebase context for the provider prompt
    const prompt = `Task Instruction: ${task.description}\n\nCodebase Context:\n${contextContent}`;

    // 4. Invoke provider
    let output = '';
    let errorMsg = '';
    let success = false;
    let exitCode: number | null = null;

    try {
      const providerResult = await this.provider.execute(prompt);
      output = providerResult.output;
      errorMsg = providerResult.error || '';
      success = providerResult.success;
      exitCode = providerResult.exitCode;
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
        validationStatus: 'skipped',
        validationErrors: [`Provider process crashed: ${err.message || err}`],
        validationWarnings: [],
        parserConfidence: 0.0,
        verificationStatus: 'skipped',
        verificationSteps: [],
        verificationLogs: '',
        buildPassed: false,
        testsPassed: false,
        verificationDuration: 0,
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
        validationStatus: 'skipped',
        validationErrors: ['Provider execution returned non-zero code'],
        validationWarnings: [],
        parserConfidence: 0.0,
        verificationStatus: 'skipped',
        verificationSteps: [],
        verificationLogs: '',
        buildPassed: false,
        testsPassed: false,
        verificationDuration: 0,
      };
    }

    // 5. Parse Response & Extract Code Blocks
    const parsed = this.parser.parse(output, task.workspaceFiles, task.entryFile);

    // 6. Response Validation Pipeline
    const validation = this.validator.validate(output, parsed, task.workspaceFiles);
    if (!validation.isValid) {
      return {
        taskId: task.id,
        status: 'FAILED',
        output,
        error: `Response validation failed: ${validation.errors.join('; ')}`,
        durationMs: Date.now() - startTime,
        modifiedFiles: [],
        filesSkipped: [],
        parserWarnings: parsed.warnings,
        patchStatus: 'skipped',
        validationStatus: 'failed',
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        parserConfidence: validation.confidence,
        verificationStatus: 'skipped',
        verificationSteps: [],
        verificationLogs: '',
        buildPassed: false,
        testsPassed: false,
        verificationDuration: 0,
      };
    }

    // 7. Generate patches
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
        validationStatus: 'passed',
        validationErrors: [patchResult.error || 'Patch generation error'],
        validationWarnings: validation.warnings,
        parserConfidence: validation.confidence,
        verificationStatus: 'skipped',
        verificationSteps: [],
        verificationLogs: '',
        buildPassed: false,
        testsPassed: false,
        verificationDuration: 0,
      };
    }

    // 8. Update workspace
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
        validationStatus: 'passed',
        validationErrors: [updateResult.error || 'Workspace update error'],
        validationWarnings: validation.warnings,
        parserConfidence: validation.confidence,
        verificationStatus: 'skipped',
        verificationSteps: [],
        verificationLogs: '',
        buildPassed: false,
        testsPassed: false,
        verificationDuration: 0,
      };
    }

    // 9. Run Verification Runner
    const verificationStartTime = Date.now();
    const verificationCmds = this.config.get().verificationCommands;
    let verificationStatus: 'passed' | 'failed' | 'skipped' = 'skipped';
    let buildPassed = false;
    let testsPassed = false;
    let verificationSteps: string[] = [];
    let verificationLogs = '';

    if (verificationCmds && verificationCmds.length > 0) {
      const vResult = await this.verificationRunner.run(verificationCmds);
      verificationStatus = vResult.success ? 'passed' : 'failed';
      buildPassed = vResult.buildPassed;
      testsPassed = vResult.testsPassed;
      verificationSteps = vResult.steps.map(s => `${s.command}: ${s.success ? 'PASSED' : 'FAILED'}`);
      verificationLogs = vResult.logs;

      if (!vResult.success) {
        return {
          taskId: task.id,
          status: 'FAILED',
          output,
          error: `Verification failed: One or more verification steps did not pass.`,
          durationMs: Date.now() - startTime,
          modifiedFiles: updateResult.modifiedFiles,
          filesSkipped: updateResult.filesSkipped,
          parserWarnings: parsed.warnings,
          patchStatus: 'applied',
          validationStatus: 'passed',
          validationErrors: [],
          validationWarnings: validation.warnings,
          parserConfidence: validation.confidence,
          verificationStatus,
          verificationSteps,
          verificationLogs,
          buildPassed,
          testsPassed,
          verificationDuration: Date.now() - verificationStartTime,
        };
      }
    } else {
      buildPassed = true;
      testsPassed = true;
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
      validationStatus: 'passed',
      validationErrors: [],
      validationWarnings: validation.warnings,
      parserConfidence: validation.confidence,
      verificationStatus,
      verificationSteps,
      verificationLogs,
      buildPassed,
      testsPassed,
      verificationDuration: Date.now() - verificationStartTime,
    };
  }
}
