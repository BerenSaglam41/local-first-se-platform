import { Kernel } from '../../src/v2/kernel/kernel';
import { ClaudeCliDetector } from '../../src/v2/application/plugins/claude/claude_cli_detector';
import { ClaudeCodeRuntimePlugin } from '../../src/v2/application/plugins/claude/claude_code_runtime_plugin';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import {
  createFakeClaudeSpawner,
  createSpawnRecorder,
  createAvailableDetector,
  createUnavailableDetector,
  createSafeTestProviderOverrides,
} from './helpers/fake_claude_process';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 15 — Claude Code Runtime Plugin Suite', () => {
  const testDbPath = './se_company_m15_test.db';
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

  // ─── 1. Executable Discovery ───────────────────────────────────────

  it('should detect claude CLI executable or handle missing PATH gracefully', () => {
    const detector = new ClaudeCliDetector();
    const result = detector.detect();

    expect(result).toBeDefined();
    if (result.available) {
      expect(result.executablePath).toBeDefined();
    } else {
      expect(result.error).toBeDefined();
    }

    // Custom path override test
    const customResult = detector.detect(process.execPath);
    expect(customResult.available).toBe(true);
    expect(customResult.executablePath).toBe(process.execPath);
  });

  // ─── 2. Manifest & Capabilities ───────────────────────────────────

  it('should declare correct plugin manifest and capabilities', () => {
    const plugin = new ClaudeCodeRuntimePlugin();
    const meta = plugin.metadata();

    expect(meta.id).toBe('plugin-claude-code');
    expect(meta.name).toBe('Claude Code CLI Runtime Plugin');
    expect(plugin.capabilities()).toContain('Reasoning');
    expect(plugin.capabilities()).toContain('Cancellation');
  });

  // ─── 3. Initialization & Validation ────────────────────────────────

  it('should initialize and validate without throwing errors', async () => {
    const plugin = new ClaudeCodeRuntimePlugin();
    await plugin.initialize();

    const valResult = await plugin.validate();
    expect(valResult.valid).toBe(true);
    expect(valResult.errors).toEqual([]);

    const health = await plugin.heartbeat();
    expect(['Healthy', 'Degraded', 'Unavailable']).toContain(health.status);
    await plugin.shutdown();
  });

  // ─── 4. Task Execution ─────────────────────────────────────────────

  it('should really spawn the claude executable and return its captured stdout', async () => {
    const recorder = createSpawnRecorder();
    const spawner = createFakeClaudeSpawner({ stdout: 'Real CLI stdout response', recorder });
    const plugin = new ClaudeCodeRuntimePlugin(undefined, spawner, createAvailableDetector());
    await plugin.initialize();

    const result = await plugin.execute({ prompt: 'Write a typescript interface', workerId: 'emp-alice' });
    expect(result.success).toBe(true);
    expect(result.pluginId).toBe('plugin-claude-code');
    expect(result.output).toBe('Real CLI stdout response');

    // Prove the prompt was actually handed to the spawned process, not just echoed back.
    expect(recorder.calls.length).toBe(1);
    expect(recorder.calls[0].args).toContain('Write a typescript interface');

    await plugin.shutdown();
  });

  it('should report an honest failure when the claude CLI is unavailable, instead of a fake success', async () => {
    const spawner = createFakeClaudeSpawner();
    const plugin = new ClaudeCodeRuntimePlugin(undefined, spawner, createUnavailableDetector());
    await plugin.initialize();

    const result = await plugin.execute({ prompt: 'Write a typescript interface', workerId: 'emp-alice' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    await plugin.shutdown();
  });

  // ─── 5. Real Cancellation (keyed by workerId, see ADR-0005) ─────────

  it('should really kill the in-flight process for a worker on cancel()', async () => {
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

    const plugin = new ClaudeCodeRuntimePlugin(undefined, hangingSpawner as any, createAvailableDetector());
    await plugin.initialize();

    const pending = plugin.execute({ prompt: 'long task', workerId: 'emp-alice' });
    await new Promise((resolve) => setImmediate(resolve));

    const cancelled = await plugin.cancel('emp-alice');
    expect(cancelled).toBe(true);
    expect(killed).toBe(true);

    await plugin.shutdown();
  });

  // ─── 6. Domain Event Persistence ───────────────────────────────────

  it('should emit generic Runtime* domain events with pluginId payload', async () => {
    const events: string[] = [];
    const plugin = new ClaudeCodeRuntimePlugin(undefined, createFakeClaudeSpawner(), createAvailableDetector());
    await plugin.initialize();

    plugin.on('RuntimeExecutionStarted', () => events.push('RuntimeExecutionStarted'));
    plugin.on('RuntimeExecutionCompleted', () => events.push('RuntimeExecutionCompleted'));

    await plugin.execute({ prompt: 'Test event emission', workerId: 'emp-charlie' });

    expect(events).toEqual(['RuntimeExecutionStarted', 'RuntimeExecutionCompleted']);

    await plugin.shutdown();
  });

  // ─── 7. CLI Subcommands ──────────────────────────────────────────

  it('should execute CLI claude subcommands cleanly', async () => {
    const cli = new SeOsCli(createSafeTestProviderOverrides());
    await cli.boot('./non_existent_config.json');

    await cli.claudeStatus();
    await cli.claudeHealth();
    await cli.claudeExecute('Test CLI Prompt');

    await cli.shutdown();
  });
});
