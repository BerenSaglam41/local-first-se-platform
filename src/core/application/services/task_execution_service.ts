import { IContextBuilder } from '../../domain/interfaces/icontext_builder';
import { IProvider, ProviderResult } from '../../domain/interfaces/iprovider';
import { IConfig } from '../../domain/interfaces/iconfig';
import { IProcessRuntime } from '../../domain/interfaces/iprocess_runtime';
import { EngineeringTask, ExecutionResult, StageProgressCallback } from '../../domain/models/execution';
import { ResponseParser } from './response_parser';
import { PatchGenerator } from './patch_generator';
import { WorkspaceUpdater } from './workspace_updater';
import { ResponseValidator } from './response_validator';
import { VerificationRunner } from './verification_runner';
import { RetryEngine } from './retry_engine';
import { GitManager } from './git_manager';
import { ProjectKnowledgeService } from './project_knowledge_service';
import { ITaskPlanner } from '../../domain/interfaces/itask_planner';
import { TaskPlanner } from './task_planner';

export class TaskExecutionService {
  private parser = new ResponseParser();
  private patchGenerator = new PatchGenerator();
  private updater = new WorkspaceUpdater();
  private validator = new ResponseValidator();
  private verificationRunner: VerificationRunner;
  private retryEngine = new RetryEngine();
  private gitManager: GitManager;
  private taskPlanner: ITaskPlanner;

  constructor(
    private contextBuilder: IContextBuilder,
    private provider: IProvider,
    private config: IConfig,
    private runtime: IProcessRuntime,
    private projectKnowledgeService?: ProjectKnowledgeService,
    taskPlanner?: ITaskPlanner
  ) {
    this.verificationRunner = new VerificationRunner(runtime);
    this.gitManager = new GitManager(runtime);
    this.taskPlanner = taskPlanner || new TaskPlanner();
  }

  async executeTask(task: EngineeringTask, onProgress?: StageProgressCallback): Promise<ExecutionResult> {
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

    // 1.5. Index project knowledge before building context
    if (this.projectKnowledgeService) {
      const kStartTime = Date.now();
      onProgress?.({ stage: 'Project Knowledge Engine', status: 'started' });
      try {
        const rootPath = process.cwd();
        await this.projectKnowledgeService.indexProject(
          task.id,
          rootPath,
          task.workspaceFiles
        );
        const meta = await this.projectKnowledgeService.getProjectMetadata(task.id);
        onProgress?.({
          stage: 'Project Knowledge Engine',
          status: 'completed',
          durationMs: Date.now() - kStartTime,
          metrics: {
            techStack: meta?.techStack || ['TypeScript', 'Node.js'],
            schemaVersion: meta?.schemaVersion || 1,
            workspaceFilesCount: task.workspaceFiles.length,
          },
        });
      } catch (err: any) {
        console.warn(`[WARN] ProjectKnowledgeService: Indexing failed, falling back to dynamic context generation: ${err.message}`);
        onProgress?.({
          stage: 'Project Knowledge Engine',
          status: 'failed',
          durationMs: Date.now() - kStartTime,
          error: err.message,
          exceptionStack: err.stack,
          recoveryAction: 'Falling back to dynamic AST context generation.',
        });
      }
    }

    // 1.8. Task Decomposition & Planning
    const planStartTime = Date.now();
    onProgress?.({ stage: 'Task Decomposition & Planning', status: 'started' });
    let plan = task.plan;
    if (!plan) {
      plan = await this.taskPlanner.planTask(task.description, task.workspaceFiles);
    }
    task.plan = plan;
    onProgress?.({
      stage: 'Task Decomposition & Planning',
      status: 'completed',
      durationMs: Date.now() - planStartTime,
      metrics: {
        subTaskCount: plan.subTasks.length,
        subTasks: plan.subTasks,
      },
    });

    // 2. Build context
    const cbStartTime = Date.now();
    onProgress?.({ stage: 'Context Builder', status: 'started' });
    let contextContent = '';
    try {
      const contextResult = await this.contextBuilder.buildContext(
        task.description,
        task.entryFile,
        task.workspaceFiles
      );
      contextContent = contextResult.codeContent;
      onProgress?.({
        stage: 'Context Builder',
        status: 'completed',
        durationMs: Date.now() - cbStartTime,
        metrics: {
          contextSizeChars: contextContent.length,
          contextSizeKB: (contextContent.length / 1024).toFixed(2),
          selectedFilesCount: contextResult.extractedSymbols ? contextResult.extractedSymbols.length : 1,
        },
      });
    } catch (err: any) {
      onProgress?.({
        stage: 'Context Builder',
        status: 'failed',
        durationMs: Date.now() - cbStartTime,
        error: `Context generation failure: ${err.message || err}`,
        exceptionStack: err.stack,
        recoveryAction: 'Ensure entry file exists and contains valid TypeScript syntax.',
      });
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
      if (retryCount > 0) {
        onProgress?.({
          stage: 'Autonomous Retry Engine',
          status: 'started',
          metrics: { attempt: retryCount, maxRetries: maxRetryCount, prompt: currentPrompt },
        });
      }

      // 4. Invoke provider
      const provStartTime = Date.now();
      onProgress?.({
        stage: 'AI Provider Execution',
        status: 'started',
        metrics: { providerName: this.provider.providerName() },
      });
      let output = '';
      let errorMsg = '';
      let success = false;
      let exitCode: number | null = null;

      let providerResult: ProviderResult | undefined;
      try {
        if (typeof this.provider.stream === 'function') {
          providerResult = await this.provider.stream(currentPrompt, (chunk) => {
            onProgress?.({
              stage: 'Provider Stream',
              status: 'completed',
              metrics: { chunk },
            });
          });
        }
        if (!providerResult) {
          providerResult = await this.provider.execute(currentPrompt);
        }
        output = providerResult.output;
        errorMsg = providerResult.error || '';
        success = providerResult.success;
        exitCode = providerResult.exitCode;
      } catch (err: any) {
        lastError = `Provider execution failure: ${err.message || err}`;
        onProgress?.({
          stage: 'AI Provider Execution',
          status: 'failed',
          durationMs: Date.now() - provStartTime,
          error: lastError,
          exceptionStack: err.stack,
          recoveryAction: 'Check AI provider availability or CLI executable.',
        });
        break;
      }

      lastOutput = output;

      if (!success) {
        lastError = errorMsg || `Provider process exited with status code ${exitCode}`;
        onProgress?.({
          stage: 'AI Provider Execution',
          status: 'failed',
          durationMs: Date.now() - provStartTime,
          error: lastError,
          recoveryAction: 'Verify AI provider parameters and environment variables.',
        });
        
        // If provider fails during retry, we decide if we can retry again
        if (retryCount < maxRetryCount) {
          retryHistory.push(`Attempt ${retryCount + 1} failed: Provider error: ${lastError}`);
          retryCount++;
          currentPrompt = this.retryEngine.buildRetryPrompt(task, lastOutput, lastError, retryCount);
          continue;
        }
        break;
      } else {
        onProgress?.({
          stage: 'AI Provider Execution',
          status: 'completed',
          durationMs: Date.now() - provStartTime,
          metrics: { providerName: this.provider.providerName(), responseLength: output.length, exitCode },
        });
      }

      // 5. Parse Response & Extract Code Blocks
      const valStartTime = Date.now();
      onProgress?.({ stage: 'Response Validation & Parser', status: 'started' });
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
        onProgress?.({
          stage: 'Response Validation & Parser',
          status: 'failed',
          durationMs: Date.now() - valStartTime,
          error: lastError,
          metrics: { errors: lastValidationErrors, confidence: lastParserConfidence, warnings: lastValidationWarnings },
          recoveryAction: 'Autonomous Retry Engine will feed validation errors back to provider for self-repair.',
        });

        if (retryCount < maxRetryCount) {
          retryHistory.push(`Attempt ${retryCount + 1} failed: ${lastError}`);
          retryCount++;
          currentPrompt = this.retryEngine.buildRetryPrompt(task, lastOutput, lastError, retryCount);
          continue;
        }
        break;
      } else {
        onProgress?.({
          stage: 'Response Validation & Parser',
          status: 'completed',
          durationMs: Date.now() - valStartTime,
          metrics: { confidence: lastParserConfidence, codeBlocksCount: parsed.blocks.length },
        });
      }

      // 7. Generate patches
      const patchStartTime = Date.now();
      onProgress?.({ stage: 'Patch Generator & Workspace Updater', status: 'started' });
      const patchResult = this.patchGenerator.generatePatches(parsed.blocks, task.workspaceFiles);
      if (!patchResult.success) {
        lastError = `Patch generation failed: ${patchResult.error}`;
        lastPatchStatus = 'failed';
        onProgress?.({
          stage: 'Patch Generator & Workspace Updater',
          status: 'failed',
          durationMs: Date.now() - patchStartTime,
          error: lastError,
          recoveryAction: 'The generated code blocks target file paths outside allowed workspace files.',
        });

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
        onProgress?.({
          stage: 'Patch Generator & Workspace Updater',
          status: 'failed',
          durationMs: Date.now() - patchStartTime,
          error: lastError,
          recoveryAction: 'Failed to write patch updates to disk filesystem.',
        });

        if (retryCount < maxRetryCount) {
          retryHistory.push(`Attempt ${retryCount + 1} failed: ${lastError}`);
          retryCount++;
          currentPrompt = this.retryEngine.buildRetryPrompt(task, lastOutput, lastError, retryCount);
          continue;
        }
        break;
      }

      lastPatchStatus = 'applied';
      onProgress?.({
        stage: 'Patch Generator & Workspace Updater',
        status: 'completed',
        durationMs: Date.now() - patchStartTime,
        metrics: { modifiedFiles: lastModifiedFiles, filesSkipped: lastFilesSkipped },
      });

      // 9. Run Verification Runner
      const verificationStartTime = Date.now();
      onProgress?.({ stage: 'Verification Runner', status: 'started' });
      const verificationCmds = task.verificationCommands && task.verificationCommands.length > 0
        ? task.verificationCommands
        : this.config.get().verificationCommands;
      const targetCwd = task.workspaceRoot || process.cwd();

      if (verificationCmds && verificationCmds.length > 0) {
        const vResult = await this.verificationRunner.run(
          verificationCmds,
          (chunk, type) => {
            onProgress?.({ stage: 'Verification Stream', status: 'completed', metrics: { chunk, streamType: type } });
          },
          targetCwd
        );
        verificationStatus = vResult.success ? 'passed' : 'failed';
        buildPassed = vResult.buildPassed;
        testsPassed = vResult.testsPassed;
        verificationSteps = vResult.steps.map(s => `${s.command}: ${s.success ? 'PASSED' : 'FAILED'}`);
        verificationLogs = vResult.logs;
        verificationDuration = Date.now() - verificationStartTime;

        if (vResult.success) {
          onProgress?.({
            stage: 'Verification Runner',
            status: 'completed',
            durationMs: verificationDuration,
            metrics: { buildPassed, testsPassed, steps: verificationSteps },
          });
          break;
        } else {
          lastError = `Verification failed: One or more verification steps did not pass.`;
          onProgress?.({
            stage: 'Verification Runner',
            status: 'failed',
            durationMs: verificationDuration,
            error: lastError,
            metrics: { buildPassed, testsPassed, verificationSteps, verificationLogs },
            recoveryAction: 'Verification commands (build/test) failed. Passing test output back to Retry Engine for self-repair.',
          });

          if (retryCount < maxRetryCount) {
            retryHistory.push(`Attempt ${retryCount + 1} failed: Verification failed.`);
            retryCount++;
            currentPrompt = this.retryEngine.buildRetryPrompt(task, lastOutput, verificationLogs, retryCount);
            continue;
          }

          // Verification failed after max retries: trigger Git checkpoint rollback
          await this.gitManager.rollbackToCheckpoint(task.id);
          onProgress?.({
            stage: 'Git Integration',
            status: 'failed',
            error: `Sub-task execution failed verification after ${maxRetryCount} retries. Rolled back Git checkpoint to preserve workspace integrity.`,
            recoveryAction: 'Rolled back workspace changes to last clean Git checkpoint.',
          });
          break;
        }
      } else {
        verificationStatus = 'skipped';
        buildPassed = true;
        testsPassed = true;
        onProgress?.({
          stage: 'Verification Runner',
          status: 'completed',
          durationMs: Date.now() - verificationStartTime,
          metrics: { buildPassed: true, testsPassed: true, verificationStatus: 'skipped' },
        });
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
