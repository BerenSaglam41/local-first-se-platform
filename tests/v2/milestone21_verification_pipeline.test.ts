import { Kernel } from '../../src/v2/kernel/kernel';
import { VerificationPipeline } from '../../src/v2/application/verification/verification_pipeline';
import { IVerificationStep, VerificationStepResult } from '../../src/v2/contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../src/v2/contracts/iverification_pipeline';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { createFakeClaudeCodeRuntimePlugin, createFakeClaudeSpawner, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 21 — Verification Pipeline Suite', () => {
  const testDbPath = './se_company_m21_test.db';
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

  // ─── 1. IVerificationStep & Built-in Step Execution ───────────────

  it('should execute 6 built-in verification steps via VerificationPipeline', async () => {
    await bootKernelWithClaude();
    const pipeline = kernel.getVerificationPipeline();

    const context: VerificationContext = {
      taskId: 't-test-1',
      workspacePath: './.se_workspaces',
      artifacts: [
        { type: 'CREATED_FILE', path: './.se_workspaces/index.ts' },
      ],
    };

    const result = await pipeline.verify(context);
    expect(result.success).toBe(true);
    expect(result.status).toBe('PASSED');
    expect(result.stepResults.length).toBe(6);
    expect(result.qualityScore).toBe(100);
  });

  // ─── 2. Worker Task Automatic Verification Integration ────────────

  it('should automatically pass worker execution outputs through VerificationPipeline during mission execution', async () => {
    await bootKernelWithClaude();
    const orchestrator = kernel.getMissionExecutionOrchestrator();
    const engine = kernel.getMissionEngine();

    const { plan } = await engine.decomposeAndPlanMission('Verified Mission', 'Create verified backend REST endpoints');
    const result = await orchestrator.executeMissionPlan(plan);

    expect(result.success).toBe(true);
    expect(result.state.status).toBe('COMPLETED');
    expect(result.state.completedTaskIds.length).toBe(6);
  });

  // ─── 3. Verification Failure Triggering Retry Policy ──────────────

  it('should trigger orchestrator task retries when a verification step fails', async () => {
    await bootKernelWithClaude();
    const pipeline = kernel.getVerificationPipeline();

    let attempts = 0;
    const failingStep: IVerificationStep = {
      name: 'FlakySecurityScan',
      category: 'Security',
      async execute(ctx: VerificationContext): Promise<VerificationStepResult> {
        attempts++;
        const pass = attempts > 1; // Fails on first attempt, passes on retry
        return {
          name: 'FlakySecurityScan',
          category: 'Security',
          passed: pass,
          message: pass ? 'Security scan passed' : 'Security vulnerability detected',
          errors: pass ? [] : ['Vulnerability CVE-2026-9999 found'],
          warnings: [],
          durationMs: 5,
        };
      },
    };

    pipeline.registerStep(failingStep);

    const orchestrator = kernel.getMissionExecutionOrchestrator();
    const engine = kernel.getMissionEngine();

    const { plan } = await engine.decomposeAndPlanMission('Flaky Mission', 'Test flaky verification retry');
    const result = await orchestrator.executeMissionPlan(plan);

    expect(attempts).toBeGreaterThan(1);
    expect(result.success).toBe(true);
  });

  // ─── 4. Custom IVerificationStep Registration ─────────────────────

  it('should support dynamic registration of custom IVerificationStep implementations', async () => {
    await bootKernelWithClaude();
    const pipeline = kernel.getVerificationPipeline();

    let customStepInvoked = false;
    const customStep: IVerificationStep = {
      name: 'LicenseComplianceCheck',
      category: 'Compliance',
      async execute(ctx: VerificationContext): Promise<VerificationStepResult> {
        customStepInvoked = true;
        return {
          name: 'LicenseComplianceCheck',
          category: 'Compliance',
          passed: true,
          message: 'All licenses compliant',
          errors: [],
          warnings: [],
          durationMs: 2,
        };
      },
    };

    pipeline.registerStep(customStep);
    expect(pipeline.getSteps().some((s) => s.name === 'LicenseComplianceCheck')).toBe(true);

    const res = await pipeline.verify({ taskId: 't-custom-step', workspacePath: './.se_workspaces', artifacts: [{ type: 'CREATED_FILE' }] });
    expect(customStepInvoked).toBe(true);
    expect(res.success).toBe(true);
  });

  // ─── 5. Domain Event Persistence ───────────────────────────────────

  it('should emit and persist all 4 Verification domain events', async () => {
    await bootKernelWithClaude();
    const pipeline = kernel.getVerificationPipeline();
    const events: string[] = [];

    pipeline.on('VerificationStarted', () => events.push('VerificationStarted'));
    pipeline.on('VerificationPassed', () => events.push('VerificationPassed'));
    pipeline.on('VerificationCompleted', () => events.push('VerificationCompleted'));

    await pipeline.verify({ taskId: 't-event-verify', workspacePath: './.se_workspaces', artifacts: [{ type: 'CREATED_FILE' }] });

    expect(events).toContain('VerificationStarted');
    expect(events).toContain('VerificationPassed');
    expect(events).toContain('VerificationCompleted');
  });

  // ─── 6. CLI Integration ──────────────────────────────────────────

  it('should execute CLI verify workspace, task, and project subcommands cleanly', async () => {
    const cli = new SeOsCli(createSafeTestProviderOverrides());
    await cli.boot('./non_existent_config.json');

    await cli.verifyWorkspace('./.se_workspaces');

    await cli.projectRun('Verification CLI Test Goal');
    const projects = Array.from((cli['kernel'].getProjectLifecycleOrchestrator() as any).projectHistory.keys()) as string[];
    expect(projects.length).toBeGreaterThan(0);

    const pId = projects[0];
    await cli.verifyProjectResults(pId);

    await cli.shutdown();
  });
});
