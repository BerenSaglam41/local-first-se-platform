import { IContextBuilder } from '../../domain/interfaces/icontext_builder';
import { IProvider, ProviderResult } from '../../domain/interfaces/iprovider';
import { IConfig } from '../../domain/interfaces/iconfig';
import { IProcessRuntime } from '../../domain/interfaces/iprocess_runtime';
import {
  EngineeringTask,
  ExecutionResult,
  StageProgressCallback,
  SubTaskResult,
  SubTaskStatus,
} from '../../domain/models/execution';
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
      return this.makeErrorResult('unknown', 'Invalid task: Task ID is required', startTime);
    }
    if (!task.description || task.description.trim() === '') {
      return this.makeErrorResult(task.id, 'Invalid task: Task description cannot be empty', startTime);
    }

    const wsRoot = task.workspaceRoot || process.cwd();

    // 1.5. Knowledge Engine indexing
    if (this.projectKnowledgeService) {
      const kStartTime = Date.now();
      onProgress?.({ stage: 'Project Knowledge Engine', status: 'started' });
      try {
        await this.projectKnowledgeService.indexProject(task.id, wsRoot, task.workspaceFiles);
        onProgress?.({
          stage: 'Project Knowledge Engine',
          status: 'completed',
          durationMs: Date.now() - kStartTime,
          metrics: {
            workspaceFilesCount: task.workspaceFiles.length,
          },
        });
      } catch (err: any) {
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

    const subTaskResults: SubTaskResult[] = [];
    const maxRetryCount = this.config.get().maxRetryCount;
    let totalRetryCount = 0;
    const retryHistory: string[] = [];

    let overallStatus: 'SUCCESS' | 'FAILED' | 'ERROR' = 'SUCCESS';
    let lastOutput = '';
    let lastError = '';
    const allModifiedFiles = new Set<string>();
    const allFilesSkipped = new Set<string>();
    let lastParserWarnings: string[] = [];
    let lastValidationErrors: string[] = [];
    let lastValidationWarnings: string[] = [];
    let lastParserConfidence = 1.0;
    let lastVerificationLogs = '';
    let lastBuildPassed = false;
    let lastTestsPassed = false;
    let lastVerificationDuration = 0;

    const totalSubTasks = plan.subTasks.length;

    // ─────────────────────────────────────────────────────────────────────────
    // SEQUENTIAL MULTI-SUB-TASK ORCHESTRATION LOOP
    // ─────────────────────────────────────────────────────────────────────────
    for (let stIndex = 0; stIndex < totalSubTasks; stIndex++) {
      const st = plan.subTasks[stIndex];
      const stNum = `[${stIndex + 1}/${totalSubTasks}]`;
      st.status = 'RUNNING';

      onProgress?.({
        stage: 'Sub-task Orchestrator',
        status: 'started',
        metrics: {
          label: stNum,
          subTaskId: st.id,
          targetFile: st.targetFile,
          objective: st.objective,
          selectionReason: st.selectionReason,
          selectionBasis: st.selectionBasis,
        },
      });

      const stStartTime = Date.now();
      let stRetryCount = 0;
      let stSuccess = false;
      let stError = '';
      let stOutput = '';
      let stConfidence = 0;
      let stBuildPassed = false;
      let stTestsPassed = false;
      let stGitHash: string | undefined = undefined;

      // 2. Build context slice for this specific target file
      let contextContent = '';
      try {
        const query = totalSubTasks === 1 ? task.description : st.objective;
        const cbRes = await this.contextBuilder.buildContext(
          query,
          st.targetFile,
          task.workspaceFiles
        );
        contextContent = cbRes.codeContent;
      } catch (err: any) {

        onProgress?.({
          stage: 'Context Builder',
          status: 'failed',
          error: `Context generation failure: ${err.message || err}`,
        });
        return this.makeErrorResult(task.id, `Context generation failure: ${err.message || err}`, startTime);
      }

      // Build execution specification contract for this sub-task
      const forbiddenFiles = [
        'package.json', 'package-lock.json', 'tsconfig.json',
        'jest.config.js', 'jest.config.ts', 'Cargo.toml', 'go.mod',
        'pom.xml', 'build.gradle', 'Dockerfile', 'docker-compose.yml', '.gitignore',
      ];

      let currentPrompt = `====================================================
EXECUTION SPECIFICATION CONTRACT
====================================================

1. SUB-TASK OBJECTIVE ${stNum}:
"${st.objective}"

2. ALLOWED TARGET FILE (STRICT — DO NOT MODIFY ANY OTHER FILE):
- ${st.targetFile}

3. FORBIDDEN PROTECTED FILES (NEVER MODIFY):
- ${forbiddenFiles.join('\n- ')}

4. EXPECTED OUTPUT FORMAT CONTRACT:
You are a non-interactive source code generator.
Output ONLY pure source code blocks matching the allowed target file (${st.targetFile}).
Every code block MUST start with the explicit file header comment:
// FILE: ${st.targetFile}

FORBIDDEN OUTPUT TYPES:
- NO conversational text or explanations outside code blocks
- NO markdown explanations or comments outside code blocks
- NO shell commands (e.g. cat, ls, git, npm)
- NO terminal instructions or JSON tool call objects

5. CODEBASE CONTEXT:
${contextContent}`;

      // ── Sub-task retry loop ──────────────────────────────────────────────
      while (stRetryCount <= maxRetryCount) {
        if (stRetryCount > 0) {
          totalRetryCount++;
          onProgress?.({
            stage: 'Autonomous Retry Engine',
            status: 'started',
            metrics: { attempt: stRetryCount, maxRetries: maxRetryCount, prompt: currentPrompt },
          });
        }

        // Provider Call
        const provStartTime = Date.now();
        onProgress?.({
          stage: 'AI Provider Execution',
          status: 'started',
          metrics: { providerName: this.provider.providerName(), targetFile: st.targetFile },
        });

        let providerResult: ProviderResult | undefined;
        try {
          if (typeof this.provider.stream === 'function') {
            providerResult = await this.provider.stream(currentPrompt, (chunk) => {
              onProgress?.({ stage: 'Provider Stream', status: 'completed', metrics: { chunk } });
            });
          }
          if (!providerResult) {
            providerResult = await this.provider.execute(currentPrompt);
          }
        } catch (err: any) {
          stError = `Provider crashed: ${err.message}`;
          onProgress?.({ stage: 'AI Provider Execution', status: 'failed', error: stError });
          break;
        }

        stOutput = providerResult?.output || '';
        lastOutput = stOutput;

        if (!providerResult || !providerResult.success) {
          stError = providerResult?.error || `Provider process exited with code ${providerResult?.exitCode ?? -1}`;
          onProgress?.({ stage: 'AI Provider Execution', status: 'failed', error: stError });

          if (stRetryCount < maxRetryCount) {
            stRetryCount++;
            retryHistory.push(`Sub-task ${stNum} attempt ${stRetryCount} failed: ${stError}`);
            currentPrompt = this.retryEngine.buildRetryPrompt(task, stOutput, stError, stRetryCount);
            continue;
          }
          break;
        }

        onProgress?.({
          stage: 'AI Provider Execution',
          status: 'completed',
          durationMs: Date.now() - provStartTime,
          metrics: { providerName: this.provider.providerName(), responseLength: stOutput.length },
        });

        // Response Parser
        const parsed = this.parser.parse(stOutput, [st.targetFile], st.targetFile);
        lastParserWarnings = parsed.warnings;

        // Response Validator
        const valRes = this.validator.validate(stOutput, parsed, [st.targetFile]);
        lastValidationErrors = valRes.errors;
        lastValidationWarnings = valRes.warnings;
        stConfidence = valRes.confidence;
        lastParserConfidence = valRes.confidence;

        if (!valRes.isValid) {
          stError = `Response validation failed: ${valRes.errors.join('; ')}`;
          onProgress?.({ stage: 'Response Validation & Parser', status: 'failed', error: stError });

          if (stRetryCount < maxRetryCount) {
            stRetryCount++;
            retryHistory.push(`Sub-task ${stNum} attempt ${stRetryCount} failed: ${stError}`);
            currentPrompt = this.retryEngine.buildRetryPrompt(task, stOutput, stError, stRetryCount);
            continue;
          }
          break;
        }

        onProgress?.({
          stage: 'Response Validation & Parser',
          status: 'completed',
          metrics: { confidence: valRes.confidence, codeBlocksCount: parsed.blocks.length },
        });

        // Patch Generator — STRICTLY target only this subtask's target file
        const patchRes = this.patchGenerator.generatePatches(parsed.blocks, [st.targetFile]);
        if (!patchRes.success) {
          stError = `Patch generation failed: ${patchRes.error}`;
          onProgress?.({ stage: 'Patch Generator & Workspace Updater', status: 'failed', error: stError });

          if (stRetryCount < maxRetryCount) {
            stRetryCount++;
            retryHistory.push(`Sub-task ${stNum} attempt ${stRetryCount} failed: ${stError}`);
            currentPrompt = this.retryEngine.buildRetryPrompt(task, stOutput, stError, stRetryCount);
            continue;
          }
          break;
        }

        // Workspace Updater
        const updateRes = this.updater.update(patchRes.patches);
        updateRes.modifiedFiles.forEach((f) => allModifiedFiles.add(f));
        updateRes.filesSkipped.forEach((f) => allFilesSkipped.add(f));

        if (!updateRes.success) {
          stError = `Workspace update failed: ${updateRes.error}`;
          onProgress?.({ stage: 'Patch Generator & Workspace Updater', status: 'failed', error: stError });

          if (stRetryCount < maxRetryCount) {
            stRetryCount++;
            retryHistory.push(`Sub-task ${stNum} attempt ${stRetryCount} failed: ${stError}`);
            currentPrompt = this.retryEngine.buildRetryPrompt(task, stOutput, stError, stRetryCount);
            continue;
          }
          break;
        }

        onProgress?.({
          stage: 'Patch Generator & Workspace Updater',
          status: 'completed',
          metrics: { modifiedFiles: updateRes.modifiedFiles },
        });

        // Verification Runner
        const vStartTime = Date.now();
        onProgress?.({ stage: 'Verification Runner', status: 'started' });
        const configCmds = this.config.get().verificationCommands;
        const commandsToRun = (task.verificationCommands && task.verificationCommands.length > 0)
          ? task.verificationCommands
          : (configCmds && configCmds.length > 0 ? configCmds : ['npm run build', 'npm test']);

        const vRes = await this.verificationRunner.run(
          commandsToRun,
          (chunk: string, _type: 'stdout' | 'stderr') => {
            onProgress?.({ stage: 'Verification Stream', status: 'completed', metrics: { chunk } });
          },
          wsRoot
        );

        lastVerificationDuration = Date.now() - vStartTime;
        lastVerificationLogs = vRes.logs;
        stBuildPassed = vRes.buildPassed;
        stTestsPassed = vRes.testsPassed;
        lastBuildPassed = vRes.buildPassed;
        lastTestsPassed = vRes.testsPassed;

        if (!vRes.success) {
          stError = `Verification failed: ${vRes.logs || 'Build/test error'}`;
          onProgress?.({ stage: 'Verification Runner', status: 'failed', error: stError });

          if (stRetryCount < maxRetryCount) {
            stRetryCount++;
            retryHistory.push(`Attempt ${stRetryCount} failed: ${stError}`);
            currentPrompt = this.retryEngine.buildRetryPrompt(task, stOutput, stError, stRetryCount);
            continue;
          }
          break;
        }

        onProgress?.({
          stage: 'Verification Runner',
          status: 'completed',
          durationMs: lastVerificationDuration,
          metrics: { buildPassed: vRes.buildPassed, testsPassed: vRes.testsPassed },
        });

        // Git Checkpoint (commit on success)
        try {
          const cpRes = await this.gitManager.commit(
            [st.targetFile],
            `feat(se-os): task-${task.id}-subtask-${stIndex + 1} (${st.targetFile})`,
            wsRoot
          );
          if (cpRes.success) {
            stGitHash = cpRes.commitHash;
            onProgress?.({
              stage: 'Git Integration',
              status: 'completed',
              metrics: { commitHash: stGitHash, targetFile: st.targetFile },
            });
          }
        } catch (gitErr: any) {
          console.warn(`[WARN] Git checkpoint failed for sub-task ${stNum}: ${gitErr.message}`);
        }

        stSuccess = true;
        break; // Exit retry loop for this sub-task
      }

      const stEndTime = Date.now();
      const stDuration = stEndTime - stStartTime;

      if (stSuccess) {
        st.status = 'SUCCESS';
        subTaskResults.push({
          subTaskId: st.id,
          targetFile: st.targetFile,
          objective: st.objective,
          status: 'SUCCESS',
          startTime: stStartTime,
          endTime: stEndTime,
          durationMs: stDuration,
          retryCount: stRetryCount,
          providerResponseLength: stOutput.length,
          parserConfidence: stConfidence,
          verificationPassed: true,
          gitCommitHash: stGitHash,
        });

        onProgress?.({
          stage: 'Sub-task Orchestrator',
          status: 'completed',
          durationMs: stDuration,
          metrics: { label: stNum, targetFile: st.targetFile, commitHash: stGitHash },
        });
      } else {
        st.status = 'FAILED';
        overallStatus = 'FAILED';
        lastError = stError;

        subTaskResults.push({
          subTaskId: st.id,
          targetFile: st.targetFile,
          objective: st.objective,
          status: 'FAILED',
          startTime: stStartTime,
          endTime: stEndTime,
          durationMs: stDuration,
          retryCount: stRetryCount,
          providerResponseLength: stOutput.length,
          parserConfidence: stConfidence,
          verificationPassed: false,
          error: stError,
        });

        // Roll back ONLY this failed sub-task's uncommitted workspace changes
        try {
          await this.gitManager.rollback([st.targetFile], wsRoot);
          onProgress?.({
            stage: 'Git Integration',
            status: 'failed',
            error: `Sub-task ${stNum} failed verification after ${stRetryCount} retries. Rolled back workspace changes.`,
            recoveryAction: 'Rolled back workspace changes to last clean Git checkpoint.',
          });
        } catch (rbErr: any) {
          console.warn(`[WARN] Git rollback failed for sub-task ${stNum}: ${rbErr.message}`);
        }

        onProgress?.({
          stage: 'Sub-task Orchestrator',
          status: 'failed',
          durationMs: stDuration,
          error: stError,
          metrics: { label: stNum, targetFile: st.targetFile },
        });

        // Mark remaining planned sub-tasks as SKIPPED
        for (let rem = stIndex + 1; rem < totalSubTasks; rem++) {
          plan.subTasks[rem].status = 'SKIPPED';
        }

        break; // Halt orchestration loop on first sub-task failure
      }
    }

    const completedCount = subTaskResults.filter((r) => r.status === 'SUCCESS').length;
    const failedCount = subTaskResults.filter((r) => r.status === 'FAILED').length;
    const skippedCount = totalSubTasks - completedCount - failedCount;

    return {
      taskId: task.id,
      status: overallStatus,
      output: lastOutput,
      error: overallStatus !== 'SUCCESS' ? lastError : undefined,
      durationMs: Date.now() - startTime,
      modifiedFiles: Array.from(allModifiedFiles),
      filesSkipped: Array.from(allFilesSkipped),
      parserWarnings: lastParserWarnings,
      patchStatus: overallStatus === 'SUCCESS' ? 'applied' : 'failed',
      validationStatus: overallStatus === 'SUCCESS' ? 'passed' : 'failed',
      validationErrors: lastValidationErrors,
      validationWarnings: lastValidationWarnings,
      parserConfidence: lastParserConfidence,
      verificationStatus: overallStatus === 'SUCCESS' ? 'passed' : 'failed',
      verificationSteps: [],
      verificationLogs: lastVerificationLogs,
      buildPassed: lastBuildPassed,
      testsPassed: lastTestsPassed,
      verificationDuration: lastVerificationDuration,
      retryCount: totalRetryCount,
      retryHistory,
      finalVerificationResult: overallStatus === 'SUCCESS' ? 'passed' : 'failed',
      finalProviderResponse: lastOutput,
      subTaskResults,
      totalSubTasks,
      completedSubTasks: completedCount,
      failedSubTasks: failedCount,
      skippedSubTasks: skippedCount,
    };
  }

  private makeErrorResult(taskId: string, errorMsg: string, startTime: number): ExecutionResult {
    return {
      taskId,
      status: 'ERROR',
      output: '',
      error: errorMsg,
      durationMs: Date.now() - startTime,
      modifiedFiles: [],
      filesSkipped: [],
      parserWarnings: [],
      patchStatus: 'none',
      validationStatus: 'skipped',
      validationErrors: [errorMsg],
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
      subTaskResults: [],
      totalSubTasks: 0,
      completedSubTasks: 0,
      failedSubTasks: 0,
      skippedSubTasks: 0,
    };
  }
}
