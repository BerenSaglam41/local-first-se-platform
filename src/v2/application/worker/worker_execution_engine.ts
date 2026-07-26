import { EventEmitter } from 'events';
import {
  WorkerExecutionRequest,
  WorkerExecutionResult,
  ExecutionReport,
  ExecutionPlan,
  ExecutionArtifact,
  ExecutionStatus,
  WorkerQuestion,
} from '../../contracts/iautonomous_worker';
import { WorkspaceEngine } from '../workspace/workspace_engine';
import { WorkspaceExecutionService } from './workspace_execution_service';
import { ReasoningCoordinator } from '../reasoning/reasoning_coordinator';
import { ExecutionResponseParser } from './execution_response_parser';
import { JsonWorkerMessageProtocol } from './worker_message_protocol';
import { IEventStore } from '../../contracts/ievent_store';
import { createHash } from 'crypto';
import { CollaborationEngine } from '../collaboration/collaboration_engine';
import { WorkerStore } from './worker_store';
import { ISharedMemory } from '../../contracts/ishared_memory';
import * as path from 'path';

/**
 * Delegates all reasoning to ReasoningCoordinator, which is also where the assigned worker's
 * activeExecution/history bookkeeping happens (via WorkerStore — see ADR-0005). This engine does
 * not duplicate that tracking; it only turns the reasoning response into real file mutations.
 */
export class WorkerExecutionEngine extends EventEmitter {
  private reports = new Map<string, ExecutionReport>();
  private responseParser: ExecutionResponseParser;
  private messageProtocol = new JsonWorkerMessageProtocol();
  private providerSessions = new Map<string, string>();

  constructor(
    private workspaceEngine: WorkspaceEngine,
    private workspaceExecutionService: WorkspaceExecutionService,
    private reasoningCoordinator: ReasoningCoordinator,
    private eventStore?: IEventStore,
    responseParser?: ExecutionResponseParser,
    private collaborationEngine?: CollaborationEngine,
    private workerStore?: WorkerStore,
    private sharedMemory?: ISharedMemory
  ) {
    super();
    this.responseParser = responseParser || new ExecutionResponseParser();
  }

  async executeTask(request: WorkerExecutionRequest): Promise<WorkerExecutionResult> {
    const startTime = Date.now();
    const executionId = request.executionId || `exec-${Date.now()}`;
    let status: ExecutionStatus = 'PREPARING_CONTEXT';
    let workspacePath: string | undefined;

    this.emitEvent('WorkerExecutionStarted', executionId, {
      taskId: request.taskId,
      workerId: request.workerId,
      goal: request.goal,
    });

    try {
      // 1. Prepare Workspace
      workspacePath = request.workspacePath || this.workspaceEngine.createWorkspace(request.taskId).isolatedPath;

      // 2. Invoke Reasoning Pipeline
      status = 'REASONING';
      const memoryScopeId = request.projectId || request.missionId;
      const worker = this.workerStore?.get(request.workerId);
      const runtimeEnvironment = this.buildRuntimeEnvironment(worker?.cliProfilePath || request.cliProfilePath);
      const recentMemory = this.sharedMemory
        ? await this.sharedMemory.listMemory('PROJECT', memoryScopeId, 12)
        : [];
      let reasoningRes = await this.reasoningCoordinator.requestReasoning({
        requestId: `req-${executionId}`,
        taskId: request.taskId,
        missionId: request.missionId,
        workerId: request.workerId,
        goal: this.buildCodeGenerationPrompt(request.goal, workspacePath, {
          ...(request.contextPackage || {}),
          persistentMemory: recentMemory.map((memory) => ({ kind: memory.kind, author: memory.author, content: memory.content })),
        }),
        context: {
          workspacePath,
          resumeConversation: request.resumeConversation ?? this.hasSession(request),
          conversationSessionId: request.conversationSessionId || this.getSessionId(request),
          constraints: [`Execute strictly within workspace '${workspacePath}'`],
          environment: runtimeEnvironment,
        },
        // Wires the caller's real configured timeout (see MissionExecutionPolicy.timeoutMs via
        // TaskScheduler) through to the actual reasoning call instead of silently discarding it
        // and always falling back to ReasoningCoordinator's own default — see ADR-0012 / M29.1
        // Fix #3: a real, complex Claude Code CLI call was measured taking ~125s, and the
        // previously-unused config path meant every caller was stuck with whatever
        // ReasoningCoordinator's internal default happened to be, with no way to override it.
        timeoutMs: request.policy?.maxDurationMs,
      });

      if (!reasoningRes.success || !reasoningRes.response) {
        throw new Error(reasoningRes.error || 'Reasoning pipeline failed to generate execution response');
      }

      // Workers may request specialist input using the explicit protocol in the prompt. The
      // request is routed to a real available worker, whose assigned CLI answers it; the answer
      // is then sent back to the original worker in the same provider conversation.
      const questions = this.extractQuestions(reasoningRes.response.responseText, request.workerId);
      if (questions.length > 0 && this.collaborationEngine && this.workerStore) {
        const answers: string[] = [];
        for (const question of questions.slice(0, 3)) {
          const recipient = this.workerStore.findBySkill(question.capability, new Set([request.workerId]));
          if (!recipient) continue;
          question.recipientWorkerId = recipient.id;
          await this.collaborationEngine.askQuestion(question.id, request.workerId, recipient.id, request.missionId, question.question, request.taskId);
          await this.sharedMemory?.writeMemory({
            id: `memory-${question.id}`,
            scope: 'PROJECT', scopeId: memoryScopeId, author: request.workerId, kind: 'QUESTION',
            content: `${recipient.name}: ${question.question}`, timestamp: new Date().toISOString(),
          });

          const answerResult = await this.reasoningCoordinator.requestReasoning({
            requestId: `req-${executionId}-${question.id}-answer`,
            taskId: `${request.taskId}-question-${question.id}`,
            missionId: request.missionId,
            workerId: recipient.id,
            goal: `Answer this question from worker ${request.workerId} using your ${recipient.skills.join(', ')} expertise. Do not edit files.\n\nQUESTION: ${question.question}`,
            context: {
              workspacePath,
              resumeConversation: this.hasSession({ ...request, workerId: recipient.id }),
              conversationSessionId: this.getSessionId({ ...request, workerId: recipient.id }),
              constraints: [`Read the shared workspace at '${workspacePath}' if needed. Return a concise technical answer.`],
              environment: this.buildRuntimeEnvironment(recipient.cliProfilePath),
            },
            timeoutMs: request.policy?.maxDurationMs,
          });
          const answer = answerResult.success && answerResult.response?.responseText
            ? answerResult.response.responseText.trim()
            : `No answer available: ${answerResult.error || 'specialist execution failed'}`;
          question.answer = answer;
          answers.push(`${recipient.name} (${recipient.role}) answered: ${answer}`);
          await this.collaborationEngine.answerQuestion(question.id, recipient.id, request.workerId, request.missionId, answer, request.taskId);
          await this.sharedMemory?.writeMemory({
            id: `memory-${question.id}-answer`,
            scope: 'PROJECT', scopeId: memoryScopeId, author: recipient.id, kind: 'ANSWER',
            content: answer, timestamp: new Date().toISOString(),
          });
        }

        if (answers.length > 0) {
          reasoningRes = await this.reasoningCoordinator.requestReasoning({
            requestId: `req-${executionId}-with-team-answers`,
            taskId: request.taskId,
            missionId: request.missionId,
            workerId: request.workerId,
            goal: `${this.buildCodeGenerationPrompt(request.goal, workspacePath, request.contextPackage)}\n\nTEAM ANSWERS TO YOUR QUESTIONS:\n${answers.join('\n\n')}\n\nContinue the implementation using these answers.`,
            context: {
              workspacePath,
              resumeConversation: true,
              conversationSessionId: this.getSessionId(request),
              constraints: [`Execute strictly within workspace '${workspacePath}'`],
              environment: runtimeEnvironment,
            },
            timeoutMs: request.policy?.maxDurationMs,
          });
          if (!reasoningRes.success || !reasoningRes.response) {
            throw new Error(reasoningRes.error || 'Worker could not continue after specialist answers');
          }
        }
      }

      // 3. Generate ExecutionPlan from the provider's actual response (zero direct file writes)
      status = 'PLANNING_MUTATIONS';
      const reasoningText = reasoningRes.response.responseText;
      const parsed = this.responseParser.parse(reasoningText);

      const plan: ExecutionPlan = parsed.hasStructuredOutput
        ? {
            planId: `plan-${executionId}`,
            taskId: request.taskId,
            workspacePath,
            summary: `Applied ${parsed.files.length} file(s) generated by the reasoning provider for goal: ${request.goal}`,
            filesToCreate: parsed.files,
            filesToModify: [],
          }
        : {
            // Honest fallback: the provider returned no `// FILE: <path>` blocks (prose-only
            // reply, refusal, or an unavailable-provider error message). Persist its raw
            // output for review instead of fabricating code that was never actually generated.
            planId: `plan-${executionId}`,
            taskId: request.taskId,
            workspacePath,
            summary: `Reasoning provider returned no structured file blocks for goal: ${request.goal}. Raw response saved to RESPONSE.md for review.`,
            filesToCreate: [
              {
                relativePath: 'RESPONSE.md',
                content: `# Task ${request.taskId}\n\nGoal: ${request.goal}\n\n> No \`// FILE: <path>\` code blocks were found in the provider response below.\n\n---\n\n${reasoningText}\n`,
              },
            ],
            filesToModify: [],
          };

      // 4. Delegate Filesystem Mutations to WorkspaceExecutionService
      status = 'EXECUTING_MUTATIONS';
      const mutationRes = this.workspaceExecutionService.applyExecutionPlan(plan);

      if (!mutationRes.success) {
        throw new Error(mutationRes.error || 'WorkspaceExecutionService failed to apply execution plan');
      }

      // 5. Harvest Artifacts
      status = 'COLLECTING_ARTIFACTS';
      const artifacts: ExecutionArtifact[] = [...mutationRes.artifacts];

      // Add Reasoning Summary Artifact
      artifacts.push({
        artifactId: `art-reasoning-${executionId}`,
        type: 'REASONING_SUMMARY',
        path: `${workspacePath}/reasoning_summary.json`,
        content: JSON.stringify(reasoningRes.response, null, 2),
        sizeBytes: Buffer.byteLength(JSON.stringify(reasoningRes.response), 'utf8'),
        createdAt: new Date().toISOString(),
      });

      // Add Execution Log Artifact
      const logContent = `[EXECUTION LOG - ${new Date().toISOString()}]\nTask: ${request.taskId}\nWorker: ${request.workerId}\nFiles Created: ${mutationRes.createdFiles.length}\nDuration: ${Date.now() - startTime}ms\n`;
      artifacts.push({
        artifactId: `art-log-${executionId}`,
        type: 'EXECUTION_LOG',
        path: `${workspacePath}/execution.log`,
        content: logContent,
        sizeBytes: Buffer.byteLength(logContent, 'utf8'),
        createdAt: new Date().toISOString(),
      });

      this.emitEvent('ArtifactsGenerated', executionId, {
        artifactCount: artifacts.length,
        taskId: request.taskId,
      });

      // 6. Compile ExecutionReport
      status = 'COMPLETED';
      const durationMs = Date.now() - startTime;
      const report: ExecutionReport = {
        executionId,
        taskId: request.taskId,
        workerId: request.workerId,
        status,
        summary: `Worker ${request.workerId} successfully executed task '${request.taskId}' in isolated workspace '${workspacePath}'`,
        recommendations: [
          'Run verification engine tests on generated workspace files',
          'Prepare dry-run merge inspection for master integration',
        ],
        artifacts,
        durationMs,
        filesCreated: mutationRes.createdFiles,
        filesModified: mutationRes.modifiedFiles,
        reasoningResponse: reasoningRes.response,
        workspacePath,
      };

      this.reports.set(executionId, report);
      await this.sharedMemory?.writeMemory({
        id: `memory-task-${executionId}`,
        scope: 'PROJECT', scopeId: memoryScopeId, author: request.workerId, kind: 'SUMMARY',
        content: `${request.taskId}: ${report.summary}. Files: ${[...report.filesCreated, ...report.filesModified].join(', ') || 'none'}`,
        timestamp: new Date().toISOString(),
      });
      this.emitEvent('WorkerExecutionCompleted', executionId, {
        taskId: request.taskId,
        workerId: request.workerId,
        durationMs,
        filesCreatedCount: mutationRes.createdFiles.length,
      });

      return { success: true, report, questions: this.extractQuestions(reasoningRes.response?.responseText || '', request.workerId) };
    } catch (err: any) {
      status = 'FAILED';
      const durationMs = Date.now() - startTime;
      this.emitEvent('WorkerExecutionFailed', executionId, {
        taskId: request.taskId,
        workerId: request.workerId,
        reason: err.message,
        durationMs,
      });

      const report: ExecutionReport = {
        executionId,
        taskId: request.taskId,
        workerId: request.workerId,
        status,
        summary: `Worker execution failed: ${err.message}`,
        recommendations: ['Check workspace permissions and retry task'],
        artifacts: [],
        durationMs,
        filesCreated: [],
        filesModified: [],
        workspacePath,
      };

      this.reports.set(executionId, report);
      return { success: false, report, error: err.message };
    }
  }

  getReport(executionId: string): ExecutionReport | undefined {
    return this.reports.get(executionId);
  }

  listReports(): ExecutionReport[] {
    return Array.from(this.reports.values());
  }

  private buildCodeGenerationPrompt(goal: string, workspacePath: string, contextPackage?: Record<string, any>): string {
    const handoff = contextPackage && Object.keys(contextPackage).length > 0
      ? `\n\nTEAM HANDOFF CONTEXT:\n${JSON.stringify(contextPackage, null, 2)}\nUse this as prior worker output. Do not discard existing work.\n`
      : '';
    return [
      goal,
      handoff,
      '',
      `You are generating source files inside the isolated workspace directory '${workspacePath}'.`,
      'Respond with one or more fenced code blocks and no prose outside of them.',
      'The first line inside each fenced code block MUST declare its destination using the exact form:',
      '// FILE: relative/path/to/file.ext',
      '(use the comment syntax appropriate to the file type, e.g. "# FILE: path" for YAML/shell, "<!-- FILE: path -->" for Markdown/HTML).',
      'Paths must be relative to the workspace root — never absolute, never containing "..".',
      'If you need another team member, add a comment line in your response exactly as: // QUESTION_FOR: capability | your concise question. Continue with the best safe implementation while waiting for the answer.',
      'For machine-readable coordination, you may instead emit a fenced ```json block such as {"type":"QUESTION","capability":"backend","question":"..."}.',
    ].join('\n');
  }

  private extractQuestions(responseText: string, senderWorkerId: string): WorkerQuestion[] {
    const questions: WorkerQuestion[] = this.messageProtocol.parseQuestions(responseText, senderWorkerId);
    const pattern = /(?:\/\/|#|<!--)\s*QUESTION_FOR:\s*([^|\r\n]+?)\s*\|\s*([^\r\n]+?)(?:\s*-->)?\s*$/gim;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(responseText)) !== null) {
      const capability = match[1].trim();
      const question = match[2].trim();
      if (!capability || !question) continue;
      if (!questions.some((existing) => existing.capability === capability && existing.question === question)) {
        questions.push({ id: `q-${Date.now()}-${questions.length}`, senderWorkerId, capability, question });
      }
    }
    return questions;
  }

  private buildRuntimeEnvironment(profilePath?: string): Record<string, string> | undefined {
    if (!profilePath) return undefined;
    const root = path.resolve(profilePath);
    return {
      SEOS_WORKER_PROFILE: root,
      HOME: root,
      CLAUDE_CONFIG_DIR: path.join(root, 'claude'),
      CODEX_HOME: path.join(root, 'codex'),
    };
  }

  private getSessionId(request: WorkerExecutionRequest): string {
    const key = `${request.projectId || request.missionId}:${request.workerId}`;
    const existing = this.providerSessions.get(key);
    if (existing) return existing;
    // Deterministic UUID-shaped ID means a restarted SE-OS process can resume the same
    // provider chat for the same project/worker without persisting provider secrets.
    const hex = createHash('sha256').update(key).digest('hex').slice(0, 32);
    const sessionId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    this.providerSessions.set(key, sessionId);
    return sessionId;
  }

  private hasSession(request: WorkerExecutionRequest): boolean {
    return this.providerSessions.has(`${request.projectId || request.missionId}:${request.workerId}`);
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'WorkerExecutionEngine',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
