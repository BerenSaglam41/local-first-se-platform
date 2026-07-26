import { Kernel } from '../../src/v2/kernel/kernel';
import { createSafeTestProviderOverrides, createSpawnRecorder, createFakeClaudeSpawner, FakeCliDetector } from './helpers/fake_claude_process';
import { CliRuntimePlugin } from '../../src/v2/application/plugins/cli_runtime_plugin';
import * as fs from 'fs';

describe('SE-OS v2.0 — Human CEO Project Execution: Todo List Web Application', () => {
  const testDbPath = './se_company_ceo_todo_test.db';
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

  it('should process CEO project goal for a Todo List Web App through full orchestrator lifecycle', async () => {
    await kernel.boot('./non_existent_config.json');

    const claudeRecorder = createSpawnRecorder();
    const codexRecorder = createSpawnRecorder();
    const geminiRecorder = createSpawnRecorder();
    const antigravityRecorder = createSpawnRecorder();

    // Register multi-provider workforce for the SE-OS Terminal Orchestrator
    await kernel.registerProviderPlugins([
      new CliRuntimePlugin(
        { id: 'plugin-claude-code', name: 'Claude Code CLI', command: 'claude', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: claudeRecorder }),
        new FakeCliDetector({ available: true, executablePath: '/fake/bin/claude', version: 'claude 1.0.0' })
      ),
      new CliRuntimePlugin(
        { id: 'plugin-codex-cli', name: 'Codex CLI', command: 'codex', buildArgs: (p) => ['exec', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: codexRecorder }),
        new FakeCliDetector({ available: true, executablePath: '/fake/bin/codex', version: 'codex 1.0.0' })
      ),
      new CliRuntimePlugin(
        { id: 'plugin-gemini-cli', name: 'Gemini CLI', command: 'gemini', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: geminiRecorder }),
        new FakeCliDetector({ available: true, executablePath: '/fake/bin/gemini', version: 'gemini 1.0.0' })
      ),
      new CliRuntimePlugin(
        { id: 'plugin-antigravity', name: 'Antigravity AI Engine', command: 'antigravity', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: antigravityRecorder }),
        new FakeCliDetector({ available: true, executablePath: '/fake/bin/antigravity', version: 'antigravity 2.0.0' })
      ),
    ]);

    const workerStore = kernel.getWorkerStore();
    if (workerStore.get('emp-alice')) workerStore.get('emp-alice')!.assignedProviderId = 'plugin-claude-code';
    if (workerStore.get('emp-bob')) workerStore.get('emp-bob')!.assignedProviderId = 'plugin-codex-cli';
    if (workerStore.get('emp-charlie')) workerStore.get('emp-charlie')!.assignedProviderId = 'plugin-gemini-cli';
    if (workerStore.get('emp-diana')) workerStore.get('emp-diana')!.assignedProviderId = 'plugin-antigravity';

    // CEO Goal Submission to SE-OS Orchestrator
    const ceoGoal = 'Build a modern, feature-rich Todo List Web Application with glassmorphism UI, priorities, categories, and local storage';
    console.log(`\n👑 CEO Request Dispatched to SE-OS: "${ceoGoal}"`);

    const orchestrator = kernel.getProjectLifecycleOrchestrator();
    const result = await orchestrator.runProject(ceoGoal);

    expect(result.success).toBe(true);
    expect(result.state.status).toBe('COMPLETED');
    expect(result.state.goal).toBe(ceoGoal);

    console.log(`✔ SE-OS Project Execution Status: ${result.state.status}`);
    console.log(`✔ Total Reports Harvested: ${Object.keys(result.reports).length}`);
    console.log(`✔ Summary: ${result.summary}`);
  });
});
