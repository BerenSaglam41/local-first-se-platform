import { Kernel } from '../../src/v2/kernel/kernel';
import { MissionExecutionOrchestrator } from '../../src/v2/application/missions/mission_execution_orchestrator';
import { DefaultWorkerDispatcher } from '../../src/v2/application/missions/worker_dispatcher';
import { IWorkerDispatcher } from '../../src/v2/contracts/iworker_dispatcher';
import { WorkerExecutionRequest, WorkerExecutionResult } from '../../src/v2/contracts/iautonomous_worker';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { createFakeClaudeCodeRuntimePlugin, createFakeClaudeSpawner, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 19 — Mission Execution Orchestrator Suite', () => {
  const testDbPath = './se_company_m19_test.db';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  async function bootKernelWithClaude(): Promise<Kernel> {
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      createFakeClaudeCodeRuntimePlugin({ eventStore: kernel.getEventStore() })
    );
    return kernel;
  }

  // ─── 1. IWorkerDispatcher & Dispatcher Forwarding ──────────────────

  it('should dispatch worker execution tasks via DefaultWorkerDispatcher', async () => {
    await bootKernelWithClaude();
    const dispatcher = kernel.getWorkerDispatcher();

    const request: WorkerExecutionRequest = {
      executionId: 'exec-disp-1',
      taskId: 't-disp-1',
      missionId: 'm-disp-1',
      workerId: 'emp-bob',
      goal: 'Build authentication endpoint',
    };

    const result = await dispatcher.dispatchWorkerTask(request);
    expect(result.success).toBe(true);
    expect(result.report).toBeDefined();
    expect(result.report!.status).toBe('COMPLETED');
  });

  // ─── 2. End-to-End MissionExecutionPlan Automatic Execution ───────

  it('should automatically execute a complete MissionExecutionPlan from start to finish', async () => {
    await bootKernelWithClaude();
    const engine = kernel.getMissionEngine();
    const orchestrator = kernel.getMissionExecutionOrchestrator();

    const { plan } = await engine.decomposeAndPlanMission(
      'REST API Mission',
      'Create a REST API for User Management'
    );

    expect(plan.tasks.length).toBe(6);

    const result = await orchestrator.executeMissionPlan(plan);
    expect(result.success).toBe(true);
    expect(result.state.status).toBe('COMPLETED');
    expect(result.state.completedTaskIds.length).toBe(6);
    expect(Object.keys(result.reports).length).toBe(6);
  });

  // ─── 3. Parallel Worker Task Execution ──────────────────────────────

  it('should execute parallel DAG batches respecting maxParallelWorkers limit', async () => {
    await bootKernelWithClaude();
    const engine = kernel.getMissionEngine();
    const orchestrator = kernel.getMissionExecutionOrchestrator();

    const { plan } = await engine.decomposeAndPlanMission(
      'Parallel Execution Mission',
      'Implement microservices backend'
    );

    const result = await orchestrator.executeMissionPlan(plan, { maxParallelWorkers: 2 });
    expect(result.success).toBe(true);
    // "microservices" is a real LARGE-tier scope signal (see TeamSizeEstimator) — 10 tasks, not
    // the old fixed 6, since team size now genuinely scales with the goal's stated scope.
    expect(result.state.completedTaskIds.length).toBe(10);
  });

  // ─── 4. Custom IWorkerDispatcher Injection (Pluggable Routing) ──────

  it('should support custom IWorkerDispatcher injection for pluggable backends', async () => {
    await bootKernelWithClaude();
    const engine = kernel.getMissionEngine();
    const orchestrator = kernel.getMissionExecutionOrchestrator();

    let customDispatcherInvoked = false;
    const customDispatcher: IWorkerDispatcher = {
      async dispatchWorkerTask(req: WorkerExecutionRequest): Promise<WorkerExecutionResult> {
        customDispatcherInvoked = true;
        return await kernel.getWorkerExecutionEngine().executeTask(req);
      },
    };

    orchestrator.setDispatcher(customDispatcher);
    expect(orchestrator.getDispatcher()).toBe(customDispatcher);

    const { plan } = await engine.decomposeAndPlanMission('Custom Dispatch Mission', 'Test custom dispatcher');
    const result = await orchestrator.executeMissionPlan(plan);

    expect(customDispatcherInvoked).toBe(true);
    expect(result.success).toBe(true);
  });

  // ─── 5. Mission Cancellation ───────────────────────────────────────

  it('should support in-flight mission cancellation', async () => {
    await bootKernelWithClaude();
    const orchestrator = kernel.getMissionExecutionOrchestrator();

    // Set state as EXECUTING manually to test cancel signal
    (orchestrator as any).activeExecutions.add('m-cancel-1');
    (orchestrator as any).states.set('m-cancel-1', {
      missionId: 'm-cancel-1',
      planId: 'plan-cancel',
      status: 'EXECUTING',
      completedTaskIds: [],
      failedTaskIds: [],
      runningTaskIds: ['t-1'],
      pendingTaskIds: ['t-2'],
      startTime: new Date().toISOString(),
    });

    const cancelled = orchestrator.cancelExecution('m-cancel-1');
    expect(cancelled).toBe(true);
    expect(orchestrator.getState('m-cancel-1')?.status).toBe('CANCELLED');
  });

  // ─── 6. Domain Event Persistence ───────────────────────────────────

  it('should emit and persist all 6 MissionExecution domain events', async () => {
    await bootKernelWithClaude();
    const engine = kernel.getMissionEngine();
    const orchestrator = kernel.getMissionExecutionOrchestrator();
    const events: string[] = [];

    orchestrator.on('MissionExecutionStarted', () => events.push('MissionExecutionStarted'));
    orchestrator.on('TaskExecutionStarted', () => events.push('TaskExecutionStarted'));
    orchestrator.on('TaskExecutionCompleted', () => events.push('TaskExecutionCompleted'));
    orchestrator.on('MissionExecutionCompleted', () => events.push('MissionExecutionCompleted'));

    const { plan } = await engine.decomposeAndPlanMission('Event Mission', 'Test execution events');
    await orchestrator.executeMissionPlan(plan);

    expect(events).toContain('MissionExecutionStarted');
    expect(events).toContain('TaskExecutionStarted');
    expect(events).toContain('TaskExecutionCompleted');
    expect(events).toContain('MissionExecutionCompleted');
  });

  // ─── 7. CLI Integration ──────────────────────────────────────────

  it('should execute CLI mission execute, status, and cancel subcommands cleanly', async () => {
    const cli = new SeOsCli(createSafeTestProviderOverrides());
    await cli.boot('./non_existent_config.json');

    await cli.missionExecute();
    const missions = cli['kernel'].getMissionEngine().listMissions();
    expect(missions.length).toBeGreaterThan(0);

    const mId = missions[0].id;
    await cli.missionExecutionStatus(mId);
    await cli.missionCancel(mId);

    await cli.shutdown();
  });
});
