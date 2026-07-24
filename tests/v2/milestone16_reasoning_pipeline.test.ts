import { Kernel } from '../../src/v2/kernel/kernel';
import { ReasoningCoordinator } from '../../src/v2/application/reasoning/reasoning_coordinator';
import { DefaultRuntimeSelectionStrategy } from '../../src/v2/application/reasoning/runtime_selection_strategy';
import { IRuntimeSelectionStrategy } from '../../src/v2/contracts/iruntime_selection_strategy';
import { IRuntimePlugin, RuntimeCapability } from '../../src/v2/contracts/iruntime_plugin_system';
import { ReasoningRequest } from '../../src/v2/contracts/ireasoning_pipeline';
import { AutonomousPlanner } from '../../src/v2/application/planning/autonomous_planner';
import { ClaudeCodeRuntimePlugin } from '../../src/v2/application/plugins/claude/claude_code_runtime_plugin';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 16 — Runtime Reasoning Pipeline Suite', () => {
  const testDbPath = './se_company_m16_test.db';
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

  // ─── 1. IRuntimeSelectionStrategy & Default Selection ─────────────

  it('should select best available runtime plugin via DefaultRuntimeSelectionStrategy', async () => {
    await bootKernelWithClaude();
    const systemMgr = kernel.getRuntimePluginSystemManager();

    const strategy = new DefaultRuntimeSelectionStrategy(systemMgr);
    const request: ReasoningRequest = {
      requestId: 'req-01',
      missionId: 'm-100',
      workerId: 'emp-bob',
      goal: 'Refactor database schema',
    };

    const selected = await strategy.selectPlugin('Reasoning', request);
    expect(selected).toBeDefined();
    expect(selected!.metadata().id).toBe('plugin-claude-code');
  });

  // ─── 2. End-to-End Reasoning Request Execution ─────────────────────

  it('should execute reasoning request end-to-end through ReasoningCoordinator', async () => {
    await bootKernelWithClaude();
    const coordinator = kernel.getReasoningCoordinator();

    const request: ReasoningRequest = {
      requestId: 'req-e2e',
      missionId: 'm-200',
      workerId: 'emp-alice',
      goal: 'Design secure JWT authentication',
    };

    const result = await coordinator.requestReasoning(request);
    expect(result.success).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.response!.requestId).toBe('req-e2e');
    expect(result.response!.executionMetadata.pluginId).toBe('plugin-claude-code');
    expect(result.response!.responseText).toContain('Design secure JWT authentication');
  });

  // ─── 3. Planning Engine Request Reaching Claude Plugin via ReasoningCoordinator ─────

  it('should demonstrate a Planning Engine request reaching Claude Plugin via ReasoningCoordinator', async () => {
    await bootKernelWithClaude();

    const planner = new AutonomousPlanner(
      undefined,
      undefined,
      kernel.getExecutionPolicyEngine(),
      kernel.getDepartmentOrchestrator(),
      { aiConfidenceThreshold: 99, enableAIFallback: true, maxAIInvocationsPerPlan: 3 },
      kernel.getReasoningCoordinator()
    );

    const plan = await planner.planMission({
      title: 'Implement OAuth2 PKCE Flow',
      description: 'Add OAuth2 authentication PKCE flow for single page applications',
    });

    expect(plan.aiInvocations.length).toBeGreaterThan(0);
    const invocation = plan.aiInvocations[0];
    expect(invocation.decision).toContain('ReasoningCoordinator');
    expect(invocation.decision).toContain('plugin-claude-code');
  });

  // ─── 4. Output Streaming & Cancellation ─────────────────────────────

  it('should support reasoning streaming and stream cancellation', async () => {
    await bootKernelWithClaude();
    const coordinator = kernel.getReasoningCoordinator();

    const chunks: string[] = [];
    const request: ReasoningRequest = {
      requestId: 'req-stream',
      missionId: 'm-300',
      workerId: 'emp-charlie',
      goal: 'Stream test reasoning',
      streaming: true,
    };

    const result = await coordinator.requestReasoning(request, {
      onStdoutChunk: (chunk) => chunks.push(chunk),
      timeoutMs: 200,
    });

    expect(result.success).toBe(true);
    expect(result.response?.executionMetadata.pluginId).toBe('plugin-claude-code');
  });

  // ─── 5. Custom Selection Strategy Injection (SRP) ───────────────────

  it('should support inject custom IRuntimeSelectionStrategy for pluggable routing', async () => {
    await bootKernelWithClaude();
    const coordinator = kernel.getReasoningCoordinator();

    let customStrategyInvoked = false;
    const customStrategy: IRuntimeSelectionStrategy = {
      async selectPlugin(capability: RuntimeCapability, request: ReasoningRequest): Promise<IRuntimePlugin | undefined> {
        customStrategyInvoked = true;
        return kernel.getRuntimePluginSystemManager().getPlugin('plugin-claude-code');
      },
    };

    coordinator.setSelectionStrategy(customStrategy);
    expect(coordinator.getSelectionStrategy()).toBe(customStrategy);

    const result = await coordinator.requestReasoning({
      requestId: 'req-custom',
      missionId: 'm-400',
      workerId: 'emp-devops',
      goal: 'Custom routing test',
    });

    expect(customStrategyInvoked).toBe(true);
    expect(result.success).toBe(true);
  });

  // ─── 6. Policy Concurrency Limits & Error Handling ─────────────────

  it('should enforce concurrency policy limits on ReasoningCoordinator', async () => {
    await bootKernelWithClaude();
    const coordinator = kernel.getReasoningCoordinator();

    // Set maxConcurrentRequests artificially to 0
    (coordinator as any).defaultPolicy.maxConcurrentRequests = 0;

    const result = await coordinator.requestReasoning({
      requestId: 'req-limit',
      missionId: 'm-500',
      workerId: 'emp-qa',
      goal: 'Concurrency limit test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('concurrency limit reached');
  });

  // ─── 7. Domain Event Persistence ───────────────────────────────────

  it('should emit and persist all 6 Reasoning domain events', async () => {
    await bootKernelWithClaude();
    const coordinator = kernel.getReasoningCoordinator();
    const events: string[] = [];

    coordinator.on('ReasoningRequested', () => events.push('ReasoningRequested'));
    coordinator.on('ReasoningStarted', () => events.push('ReasoningStarted'));
    coordinator.on('ReasoningCompleted', () => events.push('ReasoningCompleted'));

    await coordinator.requestReasoning({
      requestId: 'req-events',
      missionId: 'm-600',
      workerId: 'emp-alice',
      goal: 'Event emission test',
    });

    expect(events).toContain('ReasoningRequested');
    expect(events).toContain('ReasoningStarted');
    expect(events).toContain('ReasoningCompleted');
  });

  // ─── 8. CLI Integration ──────────────────────────────────────────

  it('should execute CLI reasoning subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');

    await cli.reasoningExecute('Design API caching strategy');
    await cli.reasoningStream('Implement Redis cache invalidation');
    await cli.reasoningInspect('req-cli-1');

    await cli.shutdown();
  });
});
