import * as os from 'os';
import {
  ITelemetryAggregator,
  TelemetrySnapshot,
  TelemetryRuntimeProviderInfo,
  TelemetryWorkerInfo,
  TelemetryAiSessionInfo,
  TelemetryTaskNode,
  TelemetryFileEvent,
} from '../../contracts/itelemetry_aggregator';
import { IEventStore, DomainEvent } from '../../contracts/ievent_store';
import { ProjectLifecycleOrchestrator } from '../project/project_lifecycle_orchestrator';
import { MissionExecutionOrchestrator } from '../missions/mission_execution_orchestrator';
import { VerificationPipeline } from '../verification/verification_pipeline';
import { WorkerStore } from '../worker/worker_store';
import { ProviderRegistry } from '../providers/provider_registry';
import { WorkerTerminalLog } from '../worker/worker_terminal_log';
import { GitBranchCache } from '../../infrastructure/telemetry/git_branch_cache';

export class TelemetryAggregator implements ITelemetryAggregator {
  private activeRuntimeProviderId = 'plugin-claude-code';
  private logs: Array<{ id: string; timestamp: string; level: string; message: string }> = [];
  private events: DomainEvent[] = [];
  private gitBranchCache: GitBranchCache;

  constructor(
    private eventStore?: IEventStore,
    private projectOrchestrator?: ProjectLifecycleOrchestrator,
    private missionOrchestrator?: MissionExecutionOrchestrator,
    private verificationPipeline?: VerificationPipeline,
    private workerStore?: WorkerStore,
    private providerRegistry?: ProviderRegistry,
    private terminalLog?: WorkerTerminalLog,
    gitBranchCache?: GitBranchCache
  ) {
    this.gitBranchCache = gitBranchCache || new GitBranchCache();
    this.logMessage('INFO', '[Kernel] SE-OS v2.0 TelemetryAggregator initialized (ONLINE)');

    if (this.eventStore && typeof (this.eventStore as any).subscribe === 'function') {
      (this.eventStore as any).subscribe((event: DomainEvent) => this.recordEvent(event));
    }
  }

  setActiveRuntimeProvider(providerId: string): void {
    this.activeRuntimeProviderId = providerId;
    this.logMessage('INFO', `Active Runtime Provider set to '${providerId}'`);
  }

  recordEvent(event: DomainEvent): void {
    this.events.unshift(event);
    if (this.events.length > 50) this.events.pop();

    this.logMessage(
      event.eventType.includes('Passed') || event.eventType.includes('Completed') ? 'SUCCESS' : 'INFO',
      `[${event.actorId}] ${event.eventType} (${event.aggregateId})`
    );
  }

  logMessage(level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string): void {
    const time = new Date().toLocaleTimeString();
    this.logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: time,
      level,
      message,
    });
    if (this.logs.length > 100) this.logs.pop();
  }

  getSnapshot(): TelemetrySnapshot {
    const memoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    const runtimeProviders: TelemetryRuntimeProviderInfo[] = this.providerRegistry
      ? this.providerRegistry.listProviders().map((p) => ({
          id: p.id,
          name: p.name,
          version: p.version || 'unknown',
          installed: p.installed,
          active: p.id === this.activeRuntimeProviderId,
          authentication: p.authentication,
          authenticationDetail: p.authenticationDetail,
        }))
      : [];

    const allWorkers = this.workerStore?.list() || [];
    const workers: TelemetryWorkerInfo[] = allWorkers.map((w) => {
      const execution = w.activeExecution;
      const providerName = runtimeProviders.find((p) => p.id === w.assignedProviderId)?.name || w.assignedProviderId || 'unassigned';
      const workingDirectory = execution?.workspacePath || '';
      const gitBranch = this.gitBranchCache.getSync(execution?.workspacePath);
      const lastHistoryEntry = w.history[0];

      return {
        id: w.id,
        name: w.name,
        role: w.role,
        skills: w.skills,
        departmentId: `dept-${w.department.toLowerCase()}`,
        status: execution ? 'BUSY' : 'IDLE',
        currentTaskId: execution?.taskId,
        currentTaskTitle: execution?.goal,
        runtimeProvider: providerName,
        assignedProvider: providerName,
        workingDirectory,
        terminalPane: `PID ${w.process.pid}`,
        // Not the real invoked command line: each provider builds its own CLI args (Claude/Gemini
        // use `-p`, Codex uses `exec`, etc. — see CliRuntimePluginConfig.buildArgs), and that
        // real command isn't threaded back out of the plugin today. Stating a goal-directed
        // description instead of a fabricated flag syntax avoids implying a specific CLI
        // invocation this worker's actual provider may not use.
        currentCommand: execution ? `${providerName}: ${execution.goal.slice(0, 80)}` : 'idle',
        currentFile: lastHistoryEntry?.filesTouched?.slice(-1)[0] || '',
        gitBranch,
        durationMs: execution ? Date.now() - new Date(execution.startedAt).getTime() : 0,
      };
    });

    // A worker has a session worth showing if it's currently active OR has ever completed/failed/
    // been interrupted on a task — matches the field's own status union, so a finished session
    // stays visible after the fact instead of vanishing the instant work completes.
    const aiSessions: TelemetryAiSessionInfo[] = allWorkers
      .filter((w) => w.activeExecution || w.history.length > 0)
      .map((w) => {
        const execution = w.activeExecution;
        const lastEntry = w.history[0];
        const status: TelemetryAiSessionInfo['status'] = execution
          ? 'STREAMING'
          : lastEntry?.outcome === 'FAILED'
            ? 'FAILED'
            : lastEntry?.outcome === 'INTERRUPTED'
              ? 'INTERRUPTED'
              : 'COMPLETED';

        return {
          sessionId: `session-${w.id}-${execution?.taskId || lastEntry?.taskId || 'session'}`,
          workerId: w.id,
          workerName: w.name,
          providerName: runtimeProviders.find((p) => p.id === w.assignedProviderId)?.name || w.assignedProviderId || 'unassigned',
          prompt: execution?.goal || lastEntry?.goal || '',
          streamingOutput: this.terminalLog?.readTail(w.id, 8) || [],
          durationMs: lastEntry?.durationMs ?? (execution ? Date.now() - new Date(execution.startedAt).getTime() : 0),
          tokenUsage: w.tokenUsageTotal,
          workspacePath: execution?.workspacePath || '',
          status,
          startedAt: execution?.startedAt || new Date().toISOString(),
        };
      });

    const fileEvents: TelemetryFileEvent[] = allWorkers
      .flatMap((w) =>
        w.history.flatMap((h) =>
          (h.filesTouched || []).map((path) => ({
            id: `fe-${w.id}-${h.taskId}-${path}`,
            type: 'CREATED' as const,
            relativePath: path,
            lines: 0,
            timestamp: h.timestamp,
            workerName: w.name,
          }))
        )
      )
      .slice(-20);

    // activeProjects stores ProjectExecutionState directly; projectHistory stores
    // ProjectExecutionResult ({ state, reports, ... }). Normalize both shapes before reading
    // telemetry. The old code treated an active state as a result, causing the dashboard to say
    // "No active project" while a real CLI subprocess was busy.
    const activeState = (this.projectOrchestrator as any)
      ? (Array.from((this.projectOrchestrator as any).activeProjects?.values?.() || []).slice(-1)[0] as any)
      : undefined;
    const activeProjectState = activeState
      ? { state: activeState }
      : ((Array.from((this.projectOrchestrator as any)?.projectHistory?.values?.() || []).slice(-1)[0] as any) || undefined);

    const projectStatus = activeProjectState?.state?.status;
    const firstPlan = activeProjectState?.state?.executionPlans
      ? (Object.values(activeProjectState.state.executionPlans)[0] as any)
      : undefined;
    const tasks: TelemetryTaskNode[] = firstPlan?.tasks
      ? firstPlan.tasks.map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          requiredCapability: t.requiredCapability,
          priority: t.priority,
          status: t.status,
          dependencies: t.dependencies,
        }))
      : [];

    const firstExecutionResult = activeProjectState?.state?.executionResults
      ? (Object.values(activeProjectState.state.executionResults)[0] as any)
      : undefined;

    const lastVerification = this.verificationPipeline?.getLastResult();

    return {
      timestamp: new Date().toISOString(),
      projectId: activeProjectState?.state?.projectId,
      businessGoal: activeProjectState?.state?.goal,
      projectStatus: projectStatus === 'COMPLETED' ? 'COMPLETED' : projectStatus === 'FAILED' ? 'FAILED' : projectStatus ? 'EXECUTING' : 'IDLE',
      currentStage: projectStatus === 'COMPLETED' ? 'Project Completed' : projectStatus ? 'Executing Missions' : 'No active project',
      progressPercent: projectStatus === 'COMPLETED' ? 100 : projectStatus ? 50 : 0,
      estimatedCompletionMinutes: projectStatus === 'COMPLETED' ? 0 : projectStatus ? 1 : 0,
      runtimeProviders,
      activeRuntimeProviderId: this.activeRuntimeProviderId,
      tasks,
      workers,
      aiSessions,
      fileEvents,
      verification: lastVerification,
      recentEvents: this.events.slice(0, 15),
      systemConsoleLogs: this.logs.slice(0, 20),
      metrics: {
        kernelStatus: 'ONLINE',
        totalWorkersCount: workers.length,
        runningTasksCount: firstExecutionResult?.state?.runningTaskIds?.length || 0,
        queuedTasksCount: firstExecutionResult?.state?.pendingTaskIds?.length || 0,
        memoryUsageMB: memoryMB,
        cpuLoadPercent: parseFloat((os.loadavg()[0] || 0).toFixed(2)),
      },
    };
  }
}
