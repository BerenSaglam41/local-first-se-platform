import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  ProjectExecutionState,
  ProjectExecutionResult,
  ProjectConversationTurn,
} from '../../contracts/iproject_lifecycle_orchestrator';
import { IProjectLifecycleStrategy } from '../../contracts/iproject_lifecycle_strategy';
import { IEventStore } from '../../contracts/ievent_store';
import { WorkspaceEngine } from '../workspace/workspace_engine';
import { WorkforceRepository } from '../../contracts/iworkforce_repository';

export class ProjectLifecycleOrchestrator extends EventEmitter {
  private activeProjects = new Map<string, ProjectExecutionState>();
  private projectHistory = new Map<string, ProjectExecutionResult>();
  private readonly stateFile = path.resolve('./.se_workspaces/project_history.json');

  constructor(
    private strategy: IProjectLifecycleStrategy,
    private eventStore?: IEventStore,
    private workspaceEngine?: WorkspaceEngine,
    private workforceRepository?: WorkforceRepository
  ) {
    super();
    this.loadHistory();
  }

  async runProject(goal: string, context?: Record<string, any>): Promise<ProjectExecutionResult> {
    const projectId = `proj-${Date.now()}`;
    const startTime = new Date().toISOString();

    const initialState: ProjectExecutionState = {
      projectId,
      goal,
      status: 'PLANNING',
      executionPlans: {},
      executionResults: {},
      startTime,
      conversationHistory: [],
    };

    const targetPath = context?.absolutePath ? path.resolve(context.absolutePath) : undefined;
    const executionWorkspace = this.workspaceEngine?.createProjectWorkspace(projectId, targetPath).isolatedPath;
    const lifecycleContext = {
      ...(context || {}),
      projectId,
      ...(executionWorkspace ? { executionWorkspacePath: executionWorkspace } : {}),
    };
    initialState.workspacePath = targetPath || './.se_workspaces';
    initialState.executionWorkspacePath = executionWorkspace;

    this.activeProjects.set(projectId, initialState);
    await this.persistProject(projectId, goal, 'PLANNING', executionWorkspace || initialState.workspacePath);

    this.emitEvent('ProjectExecutionStarted', projectId, { goal });

    try {
      const result = await this.strategy.executeProjectLifecycle(projectId, goal, lifecycleContext);
      this.activeProjects.delete(projectId);
      this.projectHistory.set(projectId, result);
      this.persistHistory();

      const wsPathForState = targetPath || './.se_workspaces';
      result.state.workspacePath = wsPathForState;
      result.state.executionWorkspacePath = executionWorkspace || result.state.executionWorkspacePath;
      result.state.conversationHistory = [
        { turnId: `turn-${Date.now()}`, goal, timestamp: new Date().toISOString(), summary: result.summary },
      ];

      if (result.success) {
        this.emitEvent('ProjectPlanningCompleted', projectId, { plan: result.state.missionPlan });
        this.emitEvent('MissionExecutionStarted', projectId, { plansCount: Object.keys(result.state.executionPlans).length });
        this.emitEvent('MissionExecutionCompleted', projectId, { resultsCount: Object.keys(result.state.executionResults).length });
        this.emitEvent('ProjectExecutionCompleted', projectId, { summary: result.summary });
      } else {
        this.emitEvent('ProjectExecutionFailed', projectId, { error: result.error || result.summary });
      }

      await this.persistProject(projectId, goal, result.success ? 'COMPLETED' : 'FAILED', executionWorkspace || wsPathForState);

      // Materialize real output — success or failure — instead of only ever writing anything on
      // success. A partially-failed run still did real work a user should be able to see.
      this.materializeProjectOutput(projectId, goal, startTime, wsPathForState, result);
      if (executionWorkspace && targetPath) this.workspaceEngine?.syncProjectWorkspace(executionWorkspace, targetPath);

      return result;
    } catch (err: any) {
      initialState.status = 'FAILED';
      initialState.endTime = new Date().toISOString();
      this.activeProjects.delete(projectId);

      const failedResult: ProjectExecutionResult = {
        success: false,
        state: initialState,
        summary: `Project '${projectId}' execution failed: ${err.message}`,
        reports: {},
        error: err.message,
      };

      this.projectHistory.set(projectId, failedResult);
      this.persistHistory();
      await this.persistProject(projectId, goal, 'FAILED', executionWorkspace || initialState.workspacePath);
      this.emitEvent('ProjectExecutionFailed', projectId, { error: err.message });
      return failedResult;
    }
  }

  /**
   * Continues an existing project with a follow-up goal instead of starting a fresh one — this
   * is what makes "Create REST API" -> "Add JWT" -> "Move database to PostgreSQL" an ongoing
   * engineering conversation rather than three unrelated one-shot runs. Reuses the same
   * projectId and the same real workspace path; the follow-up mission is scoped against what
   * already exists there, and the turn is appended to conversationHistory rather than replacing
   * it.
   */
  async continueProject(projectId: string, followUpGoal: string): Promise<ProjectExecutionResult> {
    const priorResult = this.projectHistory.get(projectId);
    const priorState = this.activeProjects.get(projectId) || priorResult?.state;

    if (!priorState) {
      const error = `No existing project found with id '${projectId}' to continue. Use runProject() to start one.`;
      const failedState: ProjectExecutionState = {
        projectId,
        goal: followUpGoal,
        status: 'FAILED',
        executionPlans: {},
        executionResults: {},
        startTime: new Date().toISOString(),
        conversationHistory: [],
      };
      return { success: false, state: failedState, summary: error, reports: {}, error };
    }

    this.emitEvent('ProjectExecutionStarted', projectId, { goal: followUpGoal, continuation: true });
    await this.persistProject(projectId, followUpGoal, 'EXECUTING', priorState.executionWorkspacePath || priorState.workspacePath);

    try {
      const result = await this.strategy.executeProjectLifecycle(projectId, followUpGoal, {
        absolutePath: priorState.workspacePath,
        executionWorkspacePath: priorState.executionWorkspacePath,
        projectId,
        isFollowUp: true,
        conversationHistory: priorState.conversationHistory,
      });

      const turn: ProjectConversationTurn = {
        turnId: `turn-${Date.now()}`,
        goal: followUpGoal,
        timestamp: new Date().toISOString(),
        summary: result.summary,
      };

      const mergedState: ProjectExecutionState = {
        ...priorState,
        goal: followUpGoal,
        status: result.state.status,
        executionPlans: { ...priorState.executionPlans, ...result.state.executionPlans },
        executionResults: { ...priorState.executionResults, ...result.state.executionResults },
        endTime: result.state.endTime,
        workspacePath: priorState.workspacePath,
        executionWorkspacePath: priorState.executionWorkspacePath,
        conversationHistory: [...priorState.conversationHistory, turn],
      };

      const mergedResult: ProjectExecutionResult = {
        ...result,
        state: mergedState,
        // Honest, cumulative report data across every turn in this conversation — not just the
        // latest one — so REPORT.md reflects the project's full real history.
        reports: { ...(priorResult?.reports || {}), ...result.reports },
      };
      this.projectHistory.set(projectId, mergedResult);
      this.persistHistory();
      await this.persistProject(projectId, followUpGoal, result.success ? 'COMPLETED' : 'FAILED', mergedState.executionWorkspacePath || mergedState.workspacePath);

      this.emitEvent(
        result.success ? 'ProjectExecutionCompleted' : 'ProjectExecutionFailed',
        projectId,
        { summary: result.summary, continuation: true }
      );

      this.materializeProjectOutput(projectId, followUpGoal, mergedState.startTime, priorState.workspacePath || path.resolve('./.se_workspaces'), mergedResult);
      if (priorState.executionWorkspacePath && priorState.workspacePath) {
        this.workspaceEngine?.syncProjectWorkspace(priorState.executionWorkspacePath, priorState.workspacePath);
      }

      return mergedResult;
    } catch (err: any) {
      const failedState: ProjectExecutionState = {
        ...priorState,
        status: 'FAILED',
        endTime: new Date().toISOString(),
      };
      const failedResult: ProjectExecutionResult = {
        success: false,
        state: failedState,
        summary: `Project '${projectId}' continuation failed: ${err.message}`,
        reports: priorResult?.reports || {},
        error: err.message,
      };
      this.projectHistory.set(projectId, failedResult);
      this.persistHistory();
      await this.persistProject(projectId, followUpGoal, 'FAILED', failedState.executionWorkspacePath || failedState.workspacePath);
      this.emitEvent('ProjectExecutionFailed', projectId, { error: err.message, continuation: true });
      return failedResult;
    }
  }

  getState(projectId: string): ProjectExecutionState | undefined {
    return this.activeProjects.get(projectId) || this.projectHistory.get(projectId)?.state;
  }

  /** Returns the most recently created project, including one that is still running. */
  getLatestProjectId(): string | undefined {
    const active = Array.from(this.activeProjects.keys()).at(-1);
    if (active) return active;
    return Array.from(this.projectHistory.keys()).at(-1);
  }

  getResult(projectId: string): ProjectExecutionResult | undefined {
    return this.projectHistory.get(projectId);
  }

  listProjects(): ProjectExecutionResult[] {
    return Array.from(this.projectHistory.values()).sort((a, b) =>
      (b.state.endTime || b.state.startTime).localeCompare(a.state.endTime || a.state.startTime)
    );
  }

  setStrategy(strategy: IProjectLifecycleStrategy): void {
    this.strategy = strategy;
  }

  getStrategy(): IProjectLifecycleStrategy {
    return this.strategy;
  }

  private async persistProject(projectId: string, goal: string, status: string, workspacePath?: string): Promise<void> {
    try {
      await this.workforceRepository?.upsertProject({
        projectId,
        goal,
        status,
        workspacePath,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Operational persistence must not make a healthy worker run fail.
    }
  }

  private loadHistory(): void {
    try {
      if (!fs.existsSync(this.stateFile)) return;
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) as Array<[string, ProjectExecutionResult]>;
      for (const [id, result] of parsed) {
        if (result?.state?.projectId) this.projectHistory.set(id, result);
      }
    } catch {
      // Corrupt history must not prevent the terminal from booting.
    }
  }

  private persistHistory(): void {
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(Array.from(this.projectHistory.entries()), null, 2), 'utf8');
    } catch {
      // Persistence is best-effort; execution result remains available in memory.
    }
  }

  /**
   * Writes the real, final project output: copies every file a worker's task actually created
   * or modified (from that task's real isolated workspace) into the user's chosen project
   * directory, then writes a REPORT.md built entirely from real execution data — real task
   * outcomes, real per-task summaries, real verification results, real generated file list.
   *
   * Replaces what used to be an unconditional block of hardcoded fake content (a canned
   * `server.ts` stub, a fake package.json, and a REPORT.md claiming "100/100, 6/6 tests passed"
   * regardless of what actually happened) — see M29.1 Fix #1 / ADR-0009. Runs on both success and
   * failure: a partially-failed run still produced real work a user should be able to see and an
   * honest account of what didn't happen and why.
   */
  private materializeProjectOutput(
    projectId: string,
    goal: string,
    startTime: string,
    wsPath: string,
    result: ProjectExecutionResult
  ): void {
    try {
      if (!fs.existsSync(wsPath)) {
        fs.mkdirSync(wsPath, { recursive: true });
      }

      const reportEntries = Object.entries(result.reports || {}) as Array<[string, any]>;
      const copiedFiles: string[] = [];
      const copyErrors: string[] = [];

      for (const [, report] of reportEntries) {
        const artifacts: Array<{ type: string; path: string; content: string }> = report?.artifacts || [];
        const taskWorkspace: string | undefined = report?.workspacePath;

        for (const artifact of artifacts) {
          if (artifact.type !== 'CREATED_FILE' && artifact.type !== 'MODIFIED_FILE') continue;

          const relativePath = taskWorkspace ? path.relative(taskWorkspace, artifact.path) : path.basename(artifact.path);
          // Never let a malformed/absolute artifact path escape the project directory.
          if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue;

          const destPath = path.join(wsPath, relativePath);
          try {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.writeFileSync(destPath, artifact.content, 'utf8');
            copiedFiles.push(relativePath);
          } catch (err: any) {
            copyErrors.push(`${relativePath}: ${err.message}`);
          }
        }
      }

      const missionResults = Object.values(result.state.executionResults || {}) as any[];
      const completedTasks = missionResults.reduce((sum, m) => sum + (m.state?.completedTaskIds?.length || 0), 0);
      const failedTaskIds: string[] = missionResults.flatMap((m) => m.state?.failedTaskIds || []);
      const totalTasks = reportEntries.length || missionResults.reduce((sum, m) => sum + (m.state?.completedTaskIds?.length || 0) + (m.state?.failedTaskIds?.length || 0), 0);

      const taskLines = reportEntries.map(([taskId, report]) => {
        const outcome = report?.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
        const verification = report?.verification;
        const verificationNote = verification
          ? ` — verification score ${verification.qualityScore}/100${verification.success ? '' : `, ${verification.errors.length} error(s)`}`
          : '';
        return `- **${taskId}** [${outcome}] Worker \`${report?.workerId || 'unknown'}\`: ${report?.summary || 'no summary available'}${verificationNote}`;
      });

      const stepAggregates = new Map<string, { passed: number; failed: number; skipped: number }>();
      for (const [, report] of reportEntries) {
        const stepResults = report?.verification?.stepResults;
        if (!stepResults) continue;
        for (const step of stepResults) {
          const agg = stepAggregates.get(step.name) || { passed: 0, failed: 0, skipped: 0 };
          if (step.skipped) agg.skipped++;
          else if (step.passed) agg.passed++;
          else agg.failed++;
          stepAggregates.set(step.name, agg);
        }
      }
      const verificationLines = Array.from(stepAggregates.entries()).map(([name, agg]) => {
        const parts: string[] = [];
        if (agg.passed > 0) parts.push(`${agg.passed} passed`);
        if (agg.failed > 0) parts.push(`${agg.failed} failed`);
        if (agg.skipped > 0) parts.push(`${agg.skipped} skipped`);
        return `- **${name}**: ${parts.join(', ') || 'no data'}`;
      });

      const realStatus = result.state.status || (result.success ? 'COMPLETED' : 'FAILED');

      const reportMd = [
        '# SE-OS v2.0 Execution Report',
        '',
        '## Executive Summary',
        `- **Business Goal**: "${goal}"`,
        `- **Project ID**: \`${projectId}\``,
        `- **Execution Status**: \`${realStatus}\``,
        `- **Started At**: ${startTime}`,
        `- **Completed At**: ${result.state.endTime || new Date().toISOString()}`,
        result.error ? `- **Error**: ${result.error}` : undefined,
        '',
        '## Mission Tasks',
        `- Tasks Completed: ${completedTasks} / ${totalTasks}`,
        failedTaskIds.length > 0 ? `- Failed Task IDs: ${failedTaskIds.join(', ')}` : undefined,
        '',
        taskLines.length > 0 ? taskLines.join('\n') : '(No tasks were executed.)',
        '',
        '## Verification',
        verificationLines.length > 0 ? verificationLines.join('\n') : '(No verification data available — no task reached the verification stage.)',
        '',
        '## Generated Files',
        // Multiple tasks can legitimately write to the same relative path (a later task revising
        // an earlier one's file); de-duplicated here to reflect what's actually on disk at the
        // end, not one list entry per write.
        copiedFiles.length > 0
          ? Array.from(new Set(copiedFiles)).map((f) => `- \`${f}\``).join('\n')
          : '(No files were generated.)',
        copyErrors.length > 0 ? `\n## File Copy Errors\n${copyErrors.map((e) => `- ${e}`).join('\n')}` : undefined,
        '',
      ]
        .filter((line) => line !== undefined)
        .join('\n');

      fs.writeFileSync(path.join(wsPath, 'REPORT.md'), reportMd, 'utf8');
    } catch (e) {
      // A broken report generator must never crash real project execution itself.
    }
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'ProjectLifecycleOrchestrator',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
