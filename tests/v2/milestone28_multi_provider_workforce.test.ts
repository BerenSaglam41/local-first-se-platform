import { Kernel } from '../../src/v2/kernel/kernel';
import { registerDefaultProviders } from '../../src/v2/application/providers/default_provider_bootstrap';
import { CliRuntimePlugin } from '../../src/v2/application/plugins/cli_runtime_plugin';
import { TmuxIntegration } from '../../src/v2/infrastructure/dashboard/tmux_integration';
import { DefaultMissionPlanningStrategy } from '../../src/v2/application/missions/default_mission_planning_strategy';
import { WorkerTerminalLog } from '../../src/v2/application/worker/worker_terminal_log';
import * as fs from 'fs';
import { spawnSync, execSync } from 'child_process';
import {
  createSafeTestProviderOverrides,
  createFakeClaudeSpawner,
  createSpawnRecorder,
  FakeCliDetector,
} from './helpers/fake_claude_process';

describe('SE-OS v2.0 Milestone 28 — Multi-Provider Workforce Suite', () => {
  const testDbPath = './se_company_m28_test.db';
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

  // ─── 1. Kernel stays AI-agnostic ────────────────────────────────────

  it('should register provider plugins generically without the kernel knowing any vendor', async () => {
    await kernel.boot('./non_existent_config.json');
    const recorder = createSpawnRecorder();
    await kernel.registerProviderPlugins([
      new CliRuntimePlugin(
        { id: 'plugin-test-cli', name: 'Test CLI', command: 'testcli', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder })
      ),
    ]);

    expect(kernel.getRuntimePluginSystemManager().getPlugin('plugin-test-cli')).toBeDefined();
  });

  // ─── 2. Real per-worker provider assignment, not one shared runtime ───

  it('should assign each default worker its own provider by role', async () => {
    await kernel.boot('./non_existent_config.json');
    await registerDefaultProviders(kernel, createSafeTestProviderOverrides());

    const workerStore = kernel.getWorkerStore();
    expect(workerStore.get('emp-alice')?.assignedProviderId).toBe('plugin-claude-code');
    expect(workerStore.get('emp-bob')?.assignedProviderId).toBe('plugin-codex-cli');
    expect(workerStore.get('emp-charlie')?.assignedProviderId).toBe('plugin-gemini-cli');
    expect(workerStore.get('emp-diana')?.assignedProviderId).toBe('plugin-antigravity');
    expect(workerStore.get('emp-eve')?.assignedProviderId).toBe('plugin-claude-code');

    // Different workers must not resolve to the same shared plugin instance path.
    expect(workerStore.get('emp-bob')?.assignedProviderId).not.toBe(workerStore.get('emp-charlie')?.assignedProviderId);
  });

  // ─── 3. Reasoning actually routes through the assigned plugin per worker ──

  it('should route each worker reasoning request through its own assigned plugin', async () => {
    await kernel.boot('./non_existent_config.json');
    const bobRecorder = createSpawnRecorder();
    const charlieRecorder = createSpawnRecorder();

    await kernel.registerProviderPlugins([
      new CliRuntimePlugin(
        { id: 'plugin-codex-cli', name: 'Codex CLI', command: 'codex', buildArgs: (p) => ['exec', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: bobRecorder })
      ),
      new CliRuntimePlugin(
        { id: 'plugin-gemini-cli', name: 'Gemini CLI', command: 'gemini', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: charlieRecorder })
      ),
    ]);

    const workerStore = kernel.getWorkerStore();
    workerStore.get('emp-bob')!.assignedProviderId = 'plugin-codex-cli';
    workerStore.get('emp-charlie')!.assignedProviderId = 'plugin-gemini-cli';

    const coordinator = kernel.getReasoningCoordinator();
    await coordinator.requestReasoning({ requestId: 'r1', missionId: 'm', workerId: 'emp-bob', goal: 'Bob goal' });
    await coordinator.requestReasoning({ requestId: 'r2', missionId: 'm', workerId: 'emp-charlie', goal: 'Charlie goal' });

    expect(bobRecorder.calls.length).toBe(1);
    expect(charlieRecorder.calls.length).toBe(1);
    expect(bobRecorder.calls[0].args.join(' ')).toContain('Bob goal');
    expect(charlieRecorder.calls[0].args.join(' ')).toContain('Charlie goal');
  });

  // ─── 4. Hot-swap: reassigning a worker's provider takes effect next call ──

  it('should hot-swap a worker provider mid-project without any session teardown', async () => {
    await kernel.boot('./non_existent_config.json');
    const claudeRecorder = createSpawnRecorder();
    const codexRecorder = createSpawnRecorder();

    await kernel.registerProviderPlugins([
      new CliRuntimePlugin(
        { id: 'plugin-claude-code', name: 'Claude', command: 'claude', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: claudeRecorder })
      ),
      new CliRuntimePlugin(
        { id: 'plugin-codex-cli', name: 'Codex', command: 'codex', buildArgs: (p) => ['exec', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ recorder: codexRecorder })
      ),
    ]);

    const workerStore = kernel.getWorkerStore();
    const coordinator = kernel.getReasoningCoordinator();

    workerStore.get('emp-bob')!.assignedProviderId = 'plugin-claude-code';
    await coordinator.requestReasoning({ requestId: 'r1', missionId: 'm', workerId: 'emp-bob', goal: 'first' });
    expect(claudeRecorder.calls.length).toBe(1);
    expect(codexRecorder.calls.length).toBe(0);

    workerStore.get('emp-bob')!.assignedProviderId = 'plugin-codex-cli';
    await coordinator.requestReasoning({ requestId: 'r2', missionId: 'm', workerId: 'emp-bob', goal: 'second' });
    expect(claudeRecorder.calls.length).toBe(1);
    expect(codexRecorder.calls.length).toBe(1);
  });

  // ─── 5. Assigned-but-unregistered provider fails honestly, no silent reroute ──

  it('should fail honestly rather than silently reroute when the assigned provider is not registered', async () => {
    await kernel.boot('./non_existent_config.json');
    kernel.getWorkerStore().get('emp-bob')!.assignedProviderId = 'plugin-does-not-exist';

    const result = await kernel.getReasoningCoordinator().requestReasoning({
      requestId: 'r1', missionId: 'm', workerId: 'emp-bob', goal: 'goal',
    });

    expect(result.success).toBe(false);
  });

  // ─── 6. Detection is always real: never reports an uninstalled CLI as installed ──
  // (covered at the bottom of this file, see "should never report a provider as installed...")

  // ─── 7. Worker reflects real execution, not fake telemetry (single source of truth — ADR-0005) ──

  it('should track real per-worker activity directly on the Worker entity, not a separate registry', async () => {
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      new CliRuntimePlugin(
        { id: 'plugin-claude-code', name: 'Claude', command: 'claude', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner()
      )
    );
    const worker = kernel.getWorkerStore().get('emp-alice')!;
    worker.assignedProviderId = 'plugin-claude-code';

    expect(worker.isBusy).toBe(false);
    expect(worker.history.length).toBe(0);

    const result = await kernel.getWorkerExecutionEngine().executeTask({
      executionId: 'exec-activity-1',
      taskId: 'task-activity-1',
      missionId: 'm-activity-1',
      workerId: 'emp-alice',
      goal: 'Write a small utility module',
    });

    expect(result.success).toBe(true);
    expect(worker.isBusy).toBe(false); // back to idle after completing
    expect(worker.assignedProviderId).toBe('plugin-claude-code');
    expect(worker.history.length).toBe(1);
    expect(worker.history[0].outcome).toBe('COMPLETED');
    expect(worker.history[0].taskId).toBe('task-activity-1');
  });

  // ─── 8. Real per-worker terminal log ────────────────────────────────

  it('should append real stdout to a per-worker terminal log during reasoning', async () => {
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      new CliRuntimePlugin(
        { id: 'plugin-claude-code', name: 'Claude', command: 'claude', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner({ stdout: 'real stdout line' })
      )
    );

    // WorkerTerminalLog persists real files on disk across kernel instances (that's the point —
    // a durable log), so this test isolates itself with a dedicated workerId rather than
    // assuming a pristine log.
    const terminalLog = kernel.getWorkerTerminalLog();
    terminalLog.clear('emp-logtest');

    await kernel.getReasoningCoordinator().requestReasoning({
      requestId: 'r-log-1', missionId: 'm', workerId: 'emp-logtest', goal: 'Do a thing',
    });

    const lines = terminalLog.readTail('emp-logtest');
    expect(lines.some((l) => l.includes('Do a thing'))).toBe(true);
    expect(lines.some((l) => l.includes('real stdout line'))).toBe(true);
    expect(lines.some((l) => l.startsWith('[exit'))).toBe(true);
  });

  // ─── 9. Real tmux integration (skipped if tmux isn't installed) ────────

  const tmuxAvailable = spawnSync('tmux', ['-V'], { stdio: 'ignore' }).status === 0;

  (tmuxAvailable ? it : it.skip)('should really create a tmux session and window tailing the worker log', async () => {
    const uniqueSession = `se-os-test-${Date.now()}`;
    const log = new WorkerTerminalLog();
    log.writeLine('emp-test-tmux', 'hello from a real test');

    const tmux = new TmuxIntegration(uniqueSession, log);
    const created = await tmux.createLayout([{ paneIndex: 1, title: 'test-pane', workerId: 'emp-test-tmux' }]);
    expect(created).toBe(true);

    const windows = execSync(`tmux list-windows -t ${uniqueSession}`, { encoding: 'utf8' });
    expect(windows).toContain('test-pane');

    execSync(`tmux kill-session -t ${uniqueSession}`);
  });

  // ─── 10. Interactive worker actions ─────────────────────────────────

  it('should support talking directly to one worker without a full mission decomposition', async () => {
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      new CliRuntimePlugin(
        { id: 'plugin-claude-code', name: 'Claude', command: 'claude', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        createFakeClaudeSpawner()
      )
    );
    kernel.getWorkerStore().get('emp-alice')!.assignedProviderId = 'plugin-claude-code';

    const result = await kernel.getWorkerExecutionEngine().executeTask({
      executionId: 'talk-1',
      taskId: 'talk-1',
      missionId: 'direct-message',
      workerId: 'emp-alice',
      goal: 'What is the current architecture?',
    });

    expect(result.success).toBe(true);
  });

  it('should really cancel an in-flight reasoning request for a specific worker', async () => {
    await kernel.boot('./non_existent_config.json');

    // A spawner that never resolves until killed, so there is something genuinely in-flight
    // to cancel by the time cancelForWorker() runs.
    let killed = false;
    const hangingSpawner = () => {
      const { EventEmitter } = require('events');
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {
        killed = true;
        return true;
      };
      return child;
    };

    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      new CliRuntimePlugin(
        { id: 'plugin-claude-code', name: 'Claude', command: 'claude', buildArgs: (p) => ['-p', p] },
        kernel.getEventStore(),
        hangingSpawner as any
      )
    );
    kernel.getWorkerStore().get('emp-alice')!.assignedProviderId = 'plugin-claude-code';

    const coordinator = kernel.getReasoningCoordinator();
    const pending = coordinator.requestReasoning({
      requestId: 'r-hang-1', missionId: 'm', workerId: 'emp-alice', goal: 'hanging goal',
    });

    // Give the request a tick to actually register as in-flight before interrupting it.
    await new Promise((resolve) => setImmediate(resolve));
    expect(coordinator.getActiveExecutionForWorker('emp-alice')).toBeDefined();

    const cancelled = await coordinator.cancelForWorker('emp-alice');
    expect(cancelled).toBe(true);
    expect(killed).toBe(true);
    expect(coordinator.getActiveExecutionForWorker('emp-alice')).toBeUndefined();
  });

  it('should report no in-flight work to interrupt when a worker is idle', async () => {
    await kernel.boot('./non_existent_config.json');
    const cancelled = await kernel.getReasoningCoordinator().cancelForWorker('emp-alice');
    expect(cancelled).toBe(false);
  });

  // ─── 11. Dynamic workforce sizing ───────────────────────────────────

  it('should keep the historical 6-task medium tier for generic/ambiguous goals (backward compatible)', async () => {
    const strategy = new DefaultMissionPlanningStrategy();
    const plan = await strategy.planMission('m-1', 'Create a REST API for User Management');
    expect(plan.tasks.length).toBe(6);
  });

  it('should scale down to a small 3-task plan for explicitly small-scope goals', async () => {
    const strategy = new DefaultMissionPlanningStrategy();
    const plan = await strategy.planMission('m-2', 'Add a simple health check endpoint');
    expect(plan.tasks.length).toBe(3);
    expect(plan.executionBatches.length).toBe(3);
  });

  it('should scale up to a large 10-task plan for microservices/multi-tenant goals', async () => {
    const strategy = new DefaultMissionPlanningStrategy();
    const plan = await strategy.planMission('m-3', 'Build a multi-tenant microservices platform');
    expect(plan.tasks.length).toBe(10);
    // Every task's dependencies must reference real task ids within this same plan.
    const ids = new Set(plan.tasks.map((t: any) => t.id));
    for (const dep of plan.dependencies) {
      expect(ids.has(dep.taskId)).toBe(true);
      expect(ids.has(dep.dependsOnTaskId)).toBe(true);
    }
  });

  it('should scale up to a 15-task enterprise plan for enterprise-scope goals', async () => {
    const strategy = new DefaultMissionPlanningStrategy();
    const plan = await strategy.planMission('m-4', 'Design an enterprise compliance-grade billing system');
    expect(plan.tasks.length).toBe(15);
  });

  it('should never report a provider as installed unless detection genuinely finds it', async () => {
    const detector = new FakeCliDetector({ available: false, error: 'not found' });
    const plugin = new CliRuntimePlugin(
      { id: 'plugin-nonexistent', name: 'Nonexistent CLI', command: 'definitely-not-a-real-binary-xyz' },
      undefined,
      createFakeClaudeSpawner(),
      detector
    );
    await plugin.initialize();
    expect(plugin.getDetectionResult().available).toBe(false);

    const result = await plugin.execute({ prompt: 'test' });
    expect(result.success).toBe(false);
  });
});
