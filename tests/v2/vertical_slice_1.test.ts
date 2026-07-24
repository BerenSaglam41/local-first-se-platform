import { Kernel } from '../../src/v2/kernel/kernel';
import { ClaudeCodeRuntimePlugin } from '../../src/v2/application/plugins/claude/claude_code_runtime_plugin';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';

describe('SE-OS v2.0 Vertical Slice 1 — End-to-End Autonomous Project Execution Suite', () => {
  const testDbPath = './se_company_vs1_test.db';
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
      new ClaudeCodeRuntimePlugin(kernel.getEventStore())
    );
    return kernel;
  }

  // ─── 1. End-to-End Real Project Lifecycle Execution ─────────────────

  it('should autonomously plan, decompose, execute, verify, and complete a real project from a single business goal', async () => {
    await bootKernelWithClaude();

    const orchestrator = kernel.getProjectLifecycleOrchestrator();
    const aggregator = kernel.getTelemetryAggregator();

    const goal = 'Create a REST API for User Management';
    const result = await orchestrator.runProject(goal);

    // 1. Verify Project Outcome
    expect(result.success).toBe(true);
    expect(result.state.status).toBe('COMPLETED');
    expect(result.state.goal).toBe(goal);
    expect(Object.keys(result.reports).length).toBe(6);

    // 2. Verify Task Execution Reports
    expect(Object.keys(result.reports).length).toBe(6);
    for (const taskId of Object.keys(result.reports)) {
      const report = result.reports[taskId];
      expect(report.status).toBe('COMPLETED');
    }

    // 3. Verify Telemetry Snapshot State
    const snapshot = aggregator.getSnapshot();
    expect(snapshot.metrics.kernelStatus).toBe('ONLINE');
    expect(snapshot.projectStatus).toBe('COMPLETED');
    expect(snapshot.verification?.qualityScore).toBe(100);
    expect(snapshot.recentEvents.length).toBeGreaterThan(0);
  });

  // ─── 2. CLI End-to-End Project Execution Integration ──────────────

  it('should run project execution via CLI projectRun helper cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');

    await cli.projectRun('Create a REST API for User Management');

    const projectOrchestrator = cli['kernel'].getProjectLifecycleOrchestrator() as any;
    const history = Array.from(projectOrchestrator.projectHistory.values()) as any[];
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].state.status).toBe('COMPLETED');

    await cli.shutdown();
  });
});
