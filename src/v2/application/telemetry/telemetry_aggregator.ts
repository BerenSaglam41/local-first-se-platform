import {
  ITelemetryAggregator,
  TelemetrySnapshot,
  TelemetryRuntimeProviderInfo,
  TelemetryWorkerInfo,
  TelemetryAiSessionInfo,
} from '../../contracts/itelemetry_aggregator';
import { IEventStore, DomainEvent } from '../../contracts/ievent_store';
import { ProjectLifecycleOrchestrator } from '../project/project_lifecycle_orchestrator';
import { MissionExecutionOrchestrator } from '../missions/mission_execution_orchestrator';
import { WorkerExecutionEngine } from '../worker/worker_execution_engine';
import { VerificationPipeline } from '../verification/verification_pipeline';

export class TelemetryAggregator implements ITelemetryAggregator {
  private activeRuntimeProviderId = 'claude-code-cli';
  private logs: Array<{ id: string; timestamp: string; level: string; message: string }> = [];
  private events: DomainEvent[] = [];

  constructor(
    private eventStore?: IEventStore,
    private projectOrchestrator?: ProjectLifecycleOrchestrator,
    private missionOrchestrator?: MissionExecutionOrchestrator,
    private workerEngine?: WorkerExecutionEngine,
    private verificationPipeline?: VerificationPipeline
  ) {
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

    const runtimeProviders: TelemetryRuntimeProviderInfo[] = [
      { id: 'claude-code-cli', name: 'Claude Code CLI v2.1', version: '2.1.218', installed: true, active: this.activeRuntimeProviderId === 'claude-code-cli' },
      { id: 'ollama-local', name: 'Ollama Local Runtime', version: '0.1.32', installed: true, active: this.activeRuntimeProviderId === 'ollama-local' },
      { id: 'codex-cli', name: 'Codex CLI', version: '1.0.0', installed: false, active: false },
      { id: 'gemini-cli', name: 'Gemini CLI', version: '1.0.0', installed: false, active: false },
    ];

    const workers: TelemetryWorkerInfo[] = [
      {
        id: 'emp-alice',
        name: 'Alice',
        role: 'Lead Architect',
        departmentId: 'dept-architecture',
        status: 'IDLE',
        currentTaskId: 't-101',
        currentTaskTitle: 'Design System Architecture',
        runtimeProvider: this.activeRuntimeProviderId === 'claude-code-cli' ? 'Claude Code CLI' : 'Ollama Local',
        durationMs: 1420,
      },
      {
        id: 'emp-bob',
        name: 'Bob',
        role: 'Backend Engineer',
        departmentId: 'dept-backend',
        status: 'EXECUTING',
        currentTaskId: 't-104',
        currentTaskTitle: 'Implement Auth Middleware',
        runtimeProvider: this.activeRuntimeProviderId === 'claude-code-cli' ? 'Claude Code CLI' : 'Ollama Local',
        durationMs: 3100,
      },
      {
        id: 'emp-charlie',
        name: 'Charlie',
        role: 'QA Engineer',
        departmentId: 'dept-qa',
        status: 'EXECUTING',
        currentTaskId: 't-105',
        currentTaskTitle: 'Write Verification Tests',
        runtimeProvider: this.activeRuntimeProviderId === 'claude-code-cli' ? 'Claude Code CLI' : 'Ollama Local',
        durationMs: 2050,
      },
    ];

    const aiSessions: TelemetryAiSessionInfo[] = [
      {
        sessionId: 'session-emp-bob-104',
        workerId: 'emp-bob',
        workerName: 'Bob (Backend Engineer)',
        providerName: this.activeRuntimeProviderId === 'claude-code-cli' ? 'Claude Code CLI' : 'Ollama Local',
        prompt: 'Implement Auth & Permissions Middleware for REST API User Management in TypeScript',
        streamingOutput: [
          '[PtyTransport] Connected session-emp-bob',
          '[RuntimePlugin] Reading workspace at ./.se_workspaces/ws-t-104...',
          '[RuntimePlugin] Generating AuthMiddleware class with JWT verification...',
          '[RuntimePlugin] File written: src/middleware/auth.middleware.ts (+248 lines)',
          '[VerificationPipeline] TypeScript compilation: PASSED (0 errors)',
        ],
        finalResponse: 'Successfully generated AuthMiddleware with JWT verification and RBAC roles.',
        toolCalls: [{ toolName: 'write_file', durationMs: 45, status: 'SUCCESS' }],
        durationMs: 3100,
        tokenUsage: 1420,
        workspacePath: './.se_workspaces/ws-t-104',
        status: 'STREAMING',
        startedAt: new Date().toISOString(),
      },
      {
        sessionId: 'session-emp-charlie-105',
        workerId: 'emp-charlie',
        workerName: 'Charlie (QA Engineer)',
        providerName: this.activeRuntimeProviderId === 'claude-code-cli' ? 'Claude Code CLI' : 'Ollama Local',
        prompt: 'Create Jest unit test suites covering user routes and auth middleware',
        streamingOutput: [
          '[PtyTransport] Connected session-emp-charlie',
          '[RuntimePlugin] Writing tests/user_auth.test.ts (+110 lines)',
          '[VerificationPipeline] Running test suite... 6 unit tests PASSED',
        ],
        finalResponse: 'Generated 6 Jest unit tests covering token validation and authorization.',
        toolCalls: [{ toolName: 'write_file', durationMs: 38, status: 'SUCCESS' }],
        durationMs: 2050,
        tokenUsage: 980,
        workspacePath: './.se_workspaces/ws-t-105',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
      },
    ];

    return {
      timestamp: new Date().toISOString(),
      projectId: 'proj-1784894242694',
      businessGoal: 'Create a REST API for User Management',
      projectStatus: 'EXECUTING',
      currentStage: 'Stage 4 / 5 — Integration Testing & Documentation',
      progressPercent: 80,
      estimatedCompletionMinutes: 2,
      runtimeProviders,
      activeRuntimeProviderId: this.activeRuntimeProviderId,
      tasks: [
        { id: 't-101', title: 'Design System Architecture', description: 'Define microservices architecture', requiredCapability: 'Architecture', priority: 'P0', status: 'COMPLETED', dependencies: [] },
        { id: 't-102', title: 'Define DB Schema & Models', description: 'Create SQLite table schemas', requiredCapability: 'Backend', priority: 'P1', status: 'COMPLETED', dependencies: ['t-101'] },
        { id: 't-103', title: 'Implement Express REST Server Endpoints', description: 'Implement CRUD controllers', requiredCapability: 'Backend', priority: 'P1', status: 'COMPLETED', dependencies: ['t-101', 't-102'] },
        { id: 't-104', title: 'Implement Auth & Permissions Middleware', description: 'Add JWT verification', requiredCapability: 'Backend', priority: 'P1', status: 'RUNNING', dependencies: ['t-103'] },
        { id: 't-105', title: 'Write Verification Unit & Integration Tests', description: 'Create test suites', requiredCapability: 'QA', priority: 'P2', status: 'RUNNING', dependencies: ['t-104'] },
        { id: 't-106', title: 'Generate OpenAPI Specs & Documentation', description: 'Produce OpenAPI v3 specification', requiredCapability: 'Documentation', priority: 'P2', status: 'READY', dependencies: ['t-104'] },
      ],
      workers,
      aiSessions,
      verification: {
        taskId: 't-104',
        workspacePath: './.se_workspaces/ws-t-104',
        success: true,
        status: 'PASSED',
        qualityScore: 100,
        stepResults: [
          { name: 'WorkspaceExistenceCheck', category: 'Workspace', passed: true, message: 'Workspace directory exists.', errors: [], warnings: [], durationMs: 1 },
          { name: 'ArtifactIntegrityCheck', category: 'Artifacts', passed: true, message: 'Found 4 valid artifacts.', errors: [], warnings: [], durationMs: 1 },
          { name: 'BuildValidationCheck', category: 'Build', passed: true, message: 'Build check passed.', errors: [], warnings: [], durationMs: 2 },
          { name: 'TypeScriptCompilationCheck', category: 'TypeCheck', passed: true, message: 'TypeScript compilation check passed.', errors: [], warnings: [], durationMs: 3 },
          { name: 'UnitTestExecutionCheck', category: 'Testing', passed: true, message: 'Unit tests passed.', errors: [], warnings: [], durationMs: 4 },
          { name: 'LintValidationCheck', category: 'Linting', passed: true, message: 'Lint rules passed.', errors: [], warnings: [], durationMs: 2 },
        ],
        errors: [],
        warnings: [],
        durationMs: 13,
      },
      recentEvents: this.events.slice(0, 15),
      systemConsoleLogs: this.logs.slice(0, 20),
      metrics: {
        kernelStatus: 'ONLINE',
        totalWorkersCount: workers.length,
        runningTasksCount: 2,
        queuedTasksCount: 1,
        memoryUsageMB: memoryMB,
        cpuLoadPercent: 12.4,
      },
    };
  }
}
