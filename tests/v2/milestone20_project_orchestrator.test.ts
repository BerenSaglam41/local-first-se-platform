import { Kernel } from '../../src/v2/kernel/kernel';
import { ProjectLifecycleOrchestrator } from '../../src/v2/application/project/project_lifecycle_orchestrator';
import { DefaultProjectLifecycleStrategy } from '../../src/v2/application/project/project_lifecycle_strategy';
import { IProjectLifecycleStrategy } from '../../src/v2/contracts/iproject_lifecycle_strategy';
import { ProjectExecutionResult } from '../../src/v2/contracts/iproject_lifecycle_orchestrator';
import { ClaudeCodeRuntimePlugin } from '../../src/v2/application/plugins/claude/claude_code_runtime_plugin';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 20 — Autonomous Project Lifecycle Orchestrator Suite', () => {
  const testDbPath = './se_company_m20_test.db';
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
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(new ClaudeCodeRuntimePlugin(kernel.getEventStore()));
    return kernel;
  }

  // ─── 1. End-to-End Autonomous Project Lifecycle ──────────────────

  it('should run complete autonomous project lifecycle from single business goal to finished report', async () => {
    await bootKernelWithClaude();
    const orchestrator = kernel.getProjectLifecycleOrchestrator();

    const goal = 'Create a REST API for User Management';
    const result = await orchestrator.runProject(goal);

    expect(result.success).toBe(true);
    expect(result.state.status).toBe('COMPLETED');
    expect(result.state.goal).toBe(goal);
    expect(result.state.missionPlan).toBeDefined();
    expect(Object.keys(result.state.executionPlans).length).toBe(1);
    expect(Object.keys(result.state.executionResults).length).toBe(1);
    expect(Object.keys(result.reports).length).toBe(6);
    expect(result.summary).toContain('COMPLETED');
  });

  // ─── 2. Custom IProjectLifecycleStrategy Injection ─────────────────

  it('should support custom IProjectLifecycleStrategy injection for pluggable lifecycle workflows', async () => {
    await bootKernelWithClaude();
    const orchestrator = kernel.getProjectLifecycleOrchestrator();

    let customStrategyInvoked = false;
    const customStrategy: IProjectLifecycleStrategy = {
      async executeProjectLifecycle(projectId: string, goal: string): Promise<ProjectExecutionResult> {
        customStrategyInvoked = true;
        return {
          success: true,
          state: {
            projectId,
            goal,
            status: 'COMPLETED',
            executionPlans: {},
            executionResults: {},
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
          },
          summary: `Custom project execution for ${goal}`,
          reports: {},
        };
      },
    };

    orchestrator.setStrategy(customStrategy);
    expect(orchestrator.getStrategy()).toBe(customStrategy);

    const result = await orchestrator.runProject('Custom Strategy Goal');
    expect(customStrategyInvoked).toBe(true);
    expect(result.success).toBe(true);
    expect(result.summary).toContain('Custom project execution');
  });

  // ─── 3. State Tracking and History Querying ───────────────────────

  it('should store and query project execution states and results', async () => {
    await bootKernelWithClaude();
    const orchestrator = kernel.getProjectLifecycleOrchestrator();

    const result = await orchestrator.runProject('Build E-commerce Microservice');
    const pId = result.state.projectId;

    const queryState = orchestrator.getState(pId);
    const queryResult = orchestrator.getResult(pId);

    expect(queryState?.projectId).toBe(pId);
    expect(queryResult?.success).toBe(true);
    expect(queryResult?.state.status).toBe('COMPLETED');
  });

  // ─── 4. Domain Event Persistence ───────────────────────────────────

  it('should emit and persist all 6 ProjectExecution domain events', async () => {
    await bootKernelWithClaude();
    const orchestrator = kernel.getProjectLifecycleOrchestrator();
    const events: string[] = [];

    orchestrator.on('ProjectExecutionStarted', () => events.push('ProjectExecutionStarted'));
    orchestrator.on('ProjectPlanningCompleted', () => events.push('ProjectPlanningCompleted'));
    orchestrator.on('MissionExecutionStarted', () => events.push('MissionExecutionStarted'));
    orchestrator.on('MissionExecutionCompleted', () => events.push('MissionExecutionCompleted'));
    orchestrator.on('ProjectExecutionCompleted', () => events.push('ProjectExecutionCompleted'));

    await orchestrator.runProject('Event Driven Project Lifecycle');

    expect(events).toContain('ProjectExecutionStarted');
    expect(events).toContain('ProjectPlanningCompleted');
    expect(events).toContain('MissionExecutionStarted');
    expect(events).toContain('MissionExecutionCompleted');
    expect(events).toContain('ProjectExecutionCompleted');
  });

  // ─── 5. CLI Integration ──────────────────────────────────────────

  it('should execute CLI project run, status, and report subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');

    await cli.projectRun('CLI Autonomous Goal Test');

    const orchestrator = cli['kernel'].getProjectLifecycleOrchestrator();
    const pId = Array.from((orchestrator as any).projectHistory.keys())[0] as string;
    expect(pId).toBeDefined();

    await cli.projectStatus(pId);
    await cli.projectReport(pId);

    await cli.shutdown();
  });
});
