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
import { RetryEngine } from './retry_engine';

export class TaskExecutionService {
  private parser = new ResponseParser();
  private patchGenerator = new PatchGenerator();
  private updater = new WorkspaceUpdater();
  private validator = new ResponseValidator();
  private verificationRunner: VerificationRunner;
  private retryEngine = new RetryEngine();

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
        retryCount: 0,
        retryHistory: [],
        finalVerificationResult: 'skipped',
        finalProviderResponse: '',
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
        retryCount: 0,
        retryHistory: [],
        finalVerificationResult: 'skipped',
        finalProviderResponse: '',
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
        retryCount: 0,
        retryHistory: [],
        finalVerificationResult: 'skipped',
        finalProviderResponse: '',
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
        retryCount: 0,
        retryHistory: [],
        finalVerificationResult: 'skipped',
        finalProviderResponse: '',
      };
    }

    // 3. Prepend task instructions to codebase context for the initial prompt
    let currentPrompt = `Task Instruction: ${task.description}\n\nCodebase Context:\n${contextContent}`;
    const maxRetryCount = this.config.get().maxRetryCount;
    let retryCount = 0;
    const retryHistory: string[] = [];

    // Tracks final/current execution state
    let lastOutput = '';
    let lastError = '';
    let lastModifiedFiles: string[] = [];
    let lastFilesSkipped: string[] = [];
    let lastParserWarnings: string[] = [];
    let lastPatchStatus: 'applied' | 'failed' | 'skipped' | 'none' = 'none';
    let lastValidationStatus: 'passed' | 'failed' | 'skipped' = 'skipped';
    let lastValidationErrors: string[] = [];
    let lastValidationWarnings: string[] = [];
    let lastParserConfidence = 0.0;

    let verificationStatus: 'passed' | 'failed' | 'skipped' = 'skipped';
    let buildPassed = false;
    let testsPassed = false;
    let verificationSteps: string[] = [];
    let verificationLogs = '';
    let verificationDuration = 0;

    while (true) {
      lastError = '';
      // 4. Invoke provider
      let output = '';
      let errorMsg = '';
      let success = false;
      let exitCode: number | null = null;

      try {
        const providerResult = await this.provider.execute(currentPrompt);
        output = providerResult.output;
        errorMsg = providerResult.error || '';
        success = providerResult.success;
        exitCode = providerResult.exitCode;
      } catch (err: any) {
        lastError = `Provider execution failure: ${err.message || err}`;
        break;
      }

      lastOutput = output;

      if (!success) {
        lastError = errorMsg || `Provider process exited with status code ${exitCode}`;
        
        // If provider fails during retry, we decide if we can retry again
        if (retryCount < maxRetryCount) {
          retryHistory.push(`Attempt ${retryCount + 1} failed: Provider error: ${lastError}`);
          retryCount++;
          currentPrompt = this.retryEngine.buildRetryPrompt(task, lastOutput, lastError, retryCount);
          continue;
        }
        break;
      }

      // 5. Parse Response & Extract Code Blocks
      const parsed = this.parser.parse(output, task.workspaceFiles, task.entryFile);
      lastParserWarnings = parsed.warnings;

      // 6. Response Validation Pipeline
      const validation = this.validator.validate(output, parsed, task.workspaceFiles);
      lastValidationStatus = validation.isValid ? 'passed' : 'failed';
      lastValidationErrors = validation.errors;
      lastValidationWarnings = validation.warnings;
      lastParserConfidence = validation.confidence;

      if (!validation.isValid) {
        lastError = `Response validation failed: ${validation.errors.join('; ')}`;
        lastPatchStatus = 'skipped';

        if (retryCount < maxRetryCount) {
          retryHistory.push(`Attempt ${retryCount + 1} failed: ${lastError}`);
          retryCount++;
          currentPrompt = this.retryEngine.buildRetryPrompt(task, lastOutput, lastError, retryCount);
          continue;
        }
        break;
      }

      // 7. Generate patches
      const patchResult = this.patchGenerator.generatePatches(parsed.blocks, task.workspaceFiles);
      if (!patchResult.success) {
        lastError = `Patch generation failed: ${patchResult.error}`;
        lastPatchStatus = 'failed';

        if (retryCount < maxRetryCount) {
          retryHistory.push(`Attempt ${retryCount + 1} failed: ${lastError}`);
          retryCount++;
          currentPrompt = this.retryEngine.buildRetryPrompt(task, lastOutput, lastError, retryCount);
          continue;
        }
        break;
      }

      // 8. Update workspace
      const updateResult = this.updater.update(patchResult.patches);
      lastModifiedFiles = updateResult.modifiedFiles;
      lastFilesSkipped = updateResult.filesSkipped;

      if (!updateResult.success) {
        lastError = `Workspace update failed: ${updateResult.error}`;
        lastPatchStatus = 'failed';

        if (retryCount < maxRetryCount) {
          retryHistory.push(`Attempt ${retryCount + 1} failed: ${lastError}`);
          retryCount++;
          currentPrompt = this.retryEngine.buildRetryPrompt(task, lastOutput, lastError, retryCount);
          continue;
        }
        break;
      }

      lastPatchStatus = 'applied';

      // 9. Run Verification Runner
      const verificationStartTime = Date.now();
      const verificationCmds = this.config.get().verificationCommands;

      if (verificationCmds && verificationCmds.length > 0) {
        const vResult = await this.verificationRunner.run(verificationCmds);
        verificationStatus = vResult.success ? 'passed' : 'failed';
        buildPassed = vResult.buildPassed;
        testsPassed = vResult.testsPassed;
        verificationSteps = vResult.steps.map(s => `${s.command}: ${s.success ? 'PASSED' : 'FAILED'}`);
        verificationLogs = vResult.logs;
        verificationDuration = Date.now() - verificationStartTime;

        if (vResult.success) {
          // Verification passed! We break the loop and return success
          break;
        } else {
          lastError = `Verification failed: One or more verification steps did not pass.`;

          if (retryCount < maxRetryCount) {
            retryHistory.push(`Attempt ${retryCount + 1} failed: Verification failed.`);
            retryCount++;
            currentPrompt = this.retryEngine.buildRetryPrompt(task, lastOutput, verificationLogs, retryCount);
            continue;
          }
          break;
        }
      } else {
        verificationStatus = 'skipped';
        buildPassed = true;
        testsPassed = true;
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const isSuccess = lastError === '' && (verificationStatus === 'passed' || verificationStatus === 'skipped');

    return {
      taskId: task.id,
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      output: lastOutput,
      error: lastError || undefined,
      durationMs,
      modifiedFiles: lastModifiedFiles,
      filesSkipped: lastFilesSkipped,
      parserWarnings: lastParserWarnings,
      patchStatus: lastPatchStatus,
      validationStatus: lastValidationStatus,
      validationErrors: lastValidationErrors,
      validationWarnings: lastValidationWarnings,
      parserConfidence: lastParserConfidence,
      verificationStatus,
      verificationSteps,
      verificationLogs,
      buildPassed,
      testsPassed,
      verificationDuration,
      retryCount,
      retryHistory,
      finalVerificationResult: verificationStatus,
      finalProviderResponse: lastOutput,
    };
  }
}
