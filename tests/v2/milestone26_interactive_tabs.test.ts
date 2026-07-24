import { Kernel } from '../../src/v2/kernel/kernel';
import { registerDefaultProviders } from '../../src/v2/application/providers/default_provider_bootstrap';
import { createFakeClaudeCodeRuntimePlugin, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';

describe('SE-OS v2.0 Milestone 26 — Interactive Multi-Tab Chat-Driven Operating System Suite', () => {

  // ─── 1. Real provider detection ─────────────────────────────────

  it('should auto-detect installed and missing AI provider CLI binaries on host system', async () => {
    const kernel = new Kernel();
    await kernel.boot('./non_existent_config.json');
    await registerDefaultProviders(kernel, createSafeTestProviderOverrides());

    const providers = kernel.getProviderRegistry().listProviders();
    expect(providers.length).toBeGreaterThanOrEqual(6);
    expect(providers.some((p) => p.id === 'plugin-codex-cli')).toBe(true);
    expect(providers.some((p) => p.id === 'plugin-gemini-cli')).toBe(true);

    const claude = providers.find((p) => p.id === 'plugin-claude-code');
    expect(claude?.installed).toBe(true);

    await kernel.shutdown();
  });

  // ─── 2. Continuous Chat-Driven Iterative Project Lifecycle ────────────

  it('should continue the SAME project (same id, same workspace) across chat turns instead of starting fresh', async () => {
    const kernel = new Kernel();
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      createFakeClaudeCodeRuntimePlugin({ eventStore: kernel.getEventStore() })
    );

    const orchestrator = kernel.getProjectLifecycleOrchestrator();

    // Initial creation
    const res1 = await orchestrator.runProject('Create REST API');
    expect(res1.success).toBe(true);
    expect(res1.state.conversationHistory.length).toBe(1);
    expect(res1.state.workspacePath).toBeDefined();

    // Real continuation: same project, same workspace, a second real conversation turn.
    const res2 = await orchestrator.continueProject(res1.state.projectId, 'Add JWT Authentication');
    expect(res2.success).toBe(true);
    expect(res2.state.projectId).toBe(res1.state.projectId);
    expect(res2.state.workspacePath).toBe(res1.state.workspacePath);
    expect(res2.state.conversationHistory.length).toBe(2);
    expect(res2.state.conversationHistory[0].goal).toBe('Create REST API');
    expect(res2.state.conversationHistory[1].goal).toBe('Add JWT Authentication');

    // A third turn keeps building on the same thread — never "Goal -> Done".
    const res3 = await orchestrator.continueProject(res1.state.projectId, 'Move database to PostgreSQL');
    expect(res3.success).toBe(true);
    expect(res3.state.projectId).toBe(res1.state.projectId);
    expect(res3.state.conversationHistory.length).toBe(3);

    // Continuing an unknown project id fails honestly instead of silently starting a new one.
    const badContinue = await orchestrator.continueProject('proj-does-not-exist', 'Deploy');
    expect(badContinue.success).toBe(false);

    await kernel.shutdown();
  });
});
