import { Kernel } from '../../src/v2/kernel/kernel';
import { registerDefaultProviders } from '../../src/v2/application/providers/default_provider_bootstrap';
import { CliRuntimePlugin } from '../../src/v2/application/plugins/cli_runtime_plugin';
import { createSpawnRecorder, createFakeClaudeSpawner, FakeCliDetector } from './helpers/fake_claude_process';
import * as fs from 'fs';

describe('SE-OS v2.0 — Codex & Antigravity Provider Workforce Execution Test', () => {
  const testDbPath = './se_company_codex_antigravity_test.db';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel && kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('should decompose goal, assign tasks to Bob (Codex) and Diana (Antigravity), and route reasoning calls correctly', async () => {
    await kernel.boot('./non_existent_config.json');

    const codexRecorder = createSpawnRecorder();
    const antigravityRecorder = createSpawnRecorder();
    const claudeRecorder = createSpawnRecorder();

    // Register Codex and Antigravity CLI providers with fake process spawners to intercept CLI execution
    await kernel.registerProviderPlugins([
      new CliRuntimePlugin(
        { id: 'plugin-codex-cli', name: 'Codex CLI', command: 'codex', buildArgs: (p) => ['exec', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: codexRecorder }),
        new FakeCliDetector({ available: true, executablePath: '/fake/bin/codex', version: 'codex 1.0.0' })
      ),
      new CliRuntimePlugin(
        { id: 'plugin-antigravity', name: 'Antigravity AI Engine', command: 'antigravity', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: antigravityRecorder }),
        new FakeCliDetector({ available: true, executablePath: '/fake/bin/antigravity', version: 'antigravity 2.1.0' })
      ),
      new CliRuntimePlugin(
        { id: 'plugin-claude-code', name: 'Claude Code CLI', command: 'claude', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: claudeRecorder }),
        new FakeCliDetector({ available: true, executablePath: '/fake/bin/claude', version: 'claude 1.0.0' })
      ),
    ]);

    const workerStore = kernel.getWorkerStore();
    const bob = workerStore.get('emp-bob');
    const diana = workerStore.get('emp-diana');
    const alice = workerStore.get('emp-alice');

    expect(bob).toBeDefined();
    expect(diana).toBeDefined();

    // Assign specific provider IDs
    if (bob) bob.assignedProviderId = 'plugin-codex-cli';
    if (diana) diana.assignedProviderId = 'plugin-antigravity';
    if (alice) alice.assignedProviderId = 'plugin-claude-code';

    // Verify assigned provider IDs
    expect(workerStore.get('emp-bob')?.assignedProviderId).toBe('plugin-codex-cli');
    expect(workerStore.get('emp-diana')?.assignedProviderId).toBe('plugin-antigravity');

    // Run full project lifecycle orchestrator
    const orchestrator = kernel.getProjectLifecycleOrchestrator();
    const goal = 'Create a CLI calculator module in TypeScript with add, subtract, and multiply functions';
    const result = await orchestrator.runProject(goal);

    // Verify project execution completed
    expect(result.success).toBe(true);
    expect(result.state.status).toBe('COMPLETED');
    expect(result.state.missionPlan).toBeDefined();

    // Verify reasoning calls were dispatched to Codex (Bob) and Antigravity (Diana)
    expect(codexRecorder.calls.length).toBeGreaterThan(0);
    expect(antigravityRecorder.calls.length).toBeGreaterThan(0);

    // Verify actual arguments passed to Codex CLI
    const codexCall = codexRecorder.calls[0];
    expect(codexCall.executable).toBe('/fake/bin/codex');
    expect(codexCall.args[0]).toBe('exec');

    // Verify actual arguments passed to Antigravity CLI
    const antigravityCall = antigravityRecorder.calls[0];
    expect(antigravityCall.executable).toBe('/fake/bin/antigravity');
    expect(antigravityCall.args[0]).toBe('-p');

    console.log(`✔ Codex CLI spawned calls: ${codexRecorder.calls.length}`);
    console.log(`✔ Antigravity CLI spawned calls: ${antigravityRecorder.calls.length}`);
    console.log(`✔ Claude Code CLI spawned calls: ${claudeRecorder.calls.length}`);
  });
});
