import { ProviderDetector } from '../../src/v2/application/providers/provider_detector';
import { Kernel } from '../../src/v2/kernel/kernel';
import { ClaudeCodeRuntimePlugin } from '../../src/v2/application/plugins/claude/claude_code_runtime_plugin';

describe('SE-OS v2.0 Milestone 26 — Interactive Multi-Tab Chat-Driven Operating System Suite', () => {

  // ─── 1. ProviderDetector Verification ─────────────────────────────────

  it('should auto-detect installed and missing AI provider CLI binaries on host system', () => {
    const providers = ProviderDetector.detectAll();

    expect(providers.length).toBeGreaterThanOrEqual(6);
    expect(providers.some((p) => p.name === 'Claude Code CLI')).toBe(true);
    expect(providers.some((p) => p.name === 'Codex CLI')).toBe(true);
    expect(providers.some((p) => p.name === 'Gemini CLI')).toBe(true);

    const claude = providers.find((p) => p.id === 'claude-code-cli');
    expect(claude?.statusBadge).toContain('[✓] Installed');
  });

  // ─── 2. Continuous Chat-Driven Iterative Project Lifecycle ────────────

  it('should support iterative prompt requests via ChatTab without terminating kernel session', async () => {
    const kernel = new Kernel();
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      new ClaudeCodeRuntimePlugin(kernel.getEventStore())
    );

    const orchestrator = kernel.getProjectLifecycleOrchestrator();

    // Initial creation
    const res1 = await orchestrator.runProject('Create REST API');
    expect(res1.success).toBe(true);

    // Iterative chat feature request
    const res2 = await orchestrator.runProject('Evolve Project: Add JWT Authentication');
    expect(res2.success).toBe(true);
    expect(res2.state.goal).toContain('Add JWT Authentication');

    await kernel.shutdown();
  });
});
