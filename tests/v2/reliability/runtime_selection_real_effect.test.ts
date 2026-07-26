import * as fs from 'fs';
import { Kernel } from '../../../src/v2/kernel/kernel';
import { createFakeClaudeCodeRuntimePlugin, createSpawnRecorder } from '../helpers/fake_claude_process';

describe('SE-OS v2.0 M29.1 Fix #11 — Runtime Selection screen has real effect', () => {
  const testDbPath = './se_company_m29_1_fix11_test.db';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel.isReady()) await kernel.shutdown();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('setDefaultRuntimeProvider() should genuinely change which plugin an unassigned reasoning call routes to', async () => {
    await kernel.boot('./non_existent_config.json');

    const claudeRecorder = createSpawnRecorder();
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      createFakeClaudeCodeRuntimePlugin({ eventStore: kernel.getEventStore(), recorder: claudeRecorder })
    );

    // 'emp-planner' is not a real registered worker — it has no assignedProviderId, so its
    // routing depends entirely on the selection strategy's default.
    kernel.setDefaultRuntimeProvider('plugin-claude-code');
    const resultViaClaude = await kernel.getReasoningCoordinator().requestReasoning({
      requestId: 'r-default-claude', missionId: 'm', workerId: 'emp-planner', goal: 'test goal 1',
    });
    expect(resultViaClaude.response?.executionMetadata.pluginId).toBe('plugin-claude-code');
    expect(claudeRecorder.calls.length).toBe(1);

    kernel.setDefaultRuntimeProvider('mock-runtime-plugin');
    const resultViaMock = await kernel.getReasoningCoordinator().requestReasoning({
      requestId: 'r-default-mock', missionId: 'm', workerId: 'emp-planner', goal: 'test goal 2',
    });
    expect(resultViaMock.response?.executionMetadata.pluginId).toBe('mock-runtime-plugin');
    // Switching the default must not have re-invoked Claude for this second, mock-routed call.
    expect(claudeRecorder.calls.length).toBe(1);
  });

  it('should never override a real worker\'s own per-role provider assignment (ADR-0005)', async () => {
    await kernel.boot('./non_existent_config.json');

    const claudeRecorder = createSpawnRecorder();
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      createFakeClaudeCodeRuntimePlugin({ eventStore: kernel.getEventStore(), recorder: claudeRecorder })
    );

    const alice = kernel.getWorkerStore().get('emp-alice')!;
    alice.assignedProviderId = 'plugin-claude-code';

    // Switching the default to Mock must not affect Alice's own real assignment.
    kernel.setDefaultRuntimeProvider('mock-runtime-plugin');

    const result = await kernel.getReasoningCoordinator().requestReasoning({
      requestId: 'r-alice-own-assignment', missionId: 'm', workerId: 'emp-alice', goal: 'test goal',
    });
    expect(result.response?.executionMetadata.pluginId).toBe('plugin-claude-code');
    expect(claudeRecorder.calls.length).toBe(1);
  });

  it('should also update the telemetry snapshot to match the real routing default', async () => {
    await kernel.boot('./non_existent_config.json');
    kernel.setDefaultRuntimeProvider('plugin-codex-cli');
    const snapshot = kernel.getTelemetryAggregator().getSnapshot();
    expect(snapshot.activeRuntimeProviderId).toBe('plugin-codex-cli');
  });
});
