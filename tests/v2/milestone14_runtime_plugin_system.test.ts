import { Kernel } from '../../src/v2/kernel/kernel';
import { RuntimePluginSystemManager } from '../../src/v2/application/plugins/runtime_plugin_system_manager';
import { RuntimePluginRegistry } from '../../src/v2/application/plugins/runtime_plugin_registry';
import { RuntimePluginLoader } from '../../src/v2/application/plugins/runtime_plugin_loader';
import { MockRuntimePlugin } from '../../src/v2/application/plugins/mock_runtime_plugin';
import { RuntimePluginManifest, IRuntimePlugin } from '../../src/v2/contracts/iruntime_plugin_system';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { createFakeClaudeSpawner, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 14 — Runtime Plugin System Suite', () => {
  const testDbPath = './se_company_m14_test.db';
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

  // ─── 1. MockRuntimePlugin Metadata & Capabilities ─────────────────

  it('should expose provider-neutral manifest and generic capabilities', async () => {
    const plugin = new MockRuntimePlugin();
    await plugin.initialize();

    const meta = plugin.metadata();
    expect(meta.id).toBe('mock-runtime-plugin');
    expect(meta.capabilities).toContain('Reasoning');
    expect(meta.capabilities).toContain('Cancellation');

    const health = await plugin.heartbeat();
    expect(health.status).toBe('Healthy');

    await plugin.shutdown();
  });

  // ─── 2. RuntimePluginLoader Validation & Compatibility ────────────

  it('should validate compliant plugin manifests and reject invalid ones', async () => {
    const loader = new RuntimePluginLoader();
    const plugin = new MockRuntimePlugin();

    const validResult = await loader.loadPlugin(plugin);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toEqual([]);

    // Invalid manifest test
    const invalidPlugin = new MockRuntimePlugin();
    invalidPlugin.metadata = () => ({
      ...plugin.metadata(),
      id: '', // empty ID -> invalid
      minKernelVersion: '99.0.0', // incompatible version
    });

    const invalidResult = await loader.loadPlugin(invalidPlugin);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  // ─── 3. Plugin Registration & Registry Operations ────────────────

  it('should register, enable, disable, and query plugins in RuntimePluginRegistry', async () => {
    const registry = new RuntimePluginRegistry();
    const plugin = new MockRuntimePlugin();
    await plugin.initialize();

    const valResult = { valid: true, errors: [], warnings: [] };
    registry.register(plugin, valResult);

    expect(registry.getPlugin('mock-runtime-plugin')).toBeDefined();
    expect(registry.getPluginsByCapability('Reasoning').length).toBe(1);

    registry.disable('mock-runtime-plugin');
    expect(registry.getPlugin('mock-runtime-plugin')).toBeUndefined();
    expect(registry.getPluginsByCapability('Reasoning').length).toBe(0);

    registry.enable('mock-runtime-plugin');
    expect(registry.getPlugin('mock-runtime-plugin')).toBeDefined();

    registry.unregister('mock-runtime-plugin');
    expect(registry.getPlugin('mock-runtime-plugin')).toBeUndefined();
  });

  // ─── 3b. Duplicate registration shuts down the old instance, never leaks it ────────

  it('should shut down and replace an already-registered plugin instead of silently overwriting it', async () => {
    const manager = new RuntimePluginSystemManager();

    let firstShutdownCalled = false;
    const first = new MockRuntimePlugin();
    const originalShutdown = first.shutdown.bind(first);
    first.shutdown = async () => {
      firstShutdownCalled = true;
      await originalShutdown();
    };

    await manager.loadAndRegisterPlugin(first);
    expect(manager.getPlugin('mock-runtime-plugin')).toBe(first);

    const second = new MockRuntimePlugin();
    await manager.loadAndRegisterPlugin(second);

    expect(firstShutdownCalled).toBe(true);
    expect(manager.getPlugin('mock-runtime-plugin')).toBe(second);
  });

  // ─── 4. Real Execution (no session layer — see ADR-0005) ──────────

  it('should execute tasks directly through MockRuntimePlugin, keyed by workerId', async () => {
    await kernel.boot('./non_existent_config.json');
    const manager = kernel.getRuntimePluginSystemManager();
    const activePlugin = manager.getPlugin('mock-runtime-plugin')!;
    expect(activePlugin).toBeDefined();

    const execResult = await activePlugin.execute({ title: 'Build Core Module', workerId: 'emp-worker-01' });
    expect(execResult.success).toBe(true);
    expect(execResult.output).toContain('Build Core Module');
  });

  // ─── 5. Plugin Health Monitoring ──────────────────────────────────

  it('should run health checks across loaded runtime plugins', async () => {
    const manager = new RuntimePluginSystemManager();
    const plugin = new MockRuntimePlugin();
    await manager.loadAndRegisterPlugin(plugin);

    const report = await manager.runHealthChecks();
    expect(report['mock-runtime-plugin']).toBeDefined();
    expect(report['mock-runtime-plugin'].status).toBe('Healthy');
  });

  // ─── 6. Domain Event Emission ─────────────────────────────────────

  it('should emit and persist plugin lifecycle events', async () => {
    const manager = new RuntimePluginSystemManager();
    const events: string[] = [];

    manager.on('RuntimePluginValidated', () => events.push('RuntimePluginValidated'));
    manager.on('RuntimePluginInitialized', () => events.push('RuntimePluginInitialized'));
    manager.on('RuntimePluginLoaded', () => events.push('RuntimePluginLoaded'));
    manager.on('RuntimePluginEnabled', () => events.push('RuntimePluginEnabled'));
    manager.on('RuntimePluginDisabled', () => events.push('RuntimePluginDisabled'));
    manager.on('RuntimePluginShutdown', () => events.push('RuntimePluginShutdown'));

    const plugin = new MockRuntimePlugin();
    await manager.loadAndRegisterPlugin(plugin);
    manager.disablePlugin('mock-runtime-plugin');
    await manager.unloadPlugin('mock-runtime-plugin');

    expect(events).toContain('RuntimePluginValidated');
    expect(events).toContain('RuntimePluginInitialized');
    expect(events).toContain('RuntimePluginLoaded');
    expect(events).toContain('RuntimePluginEnabled');
    expect(events).toContain('RuntimePluginDisabled');
    expect(events).toContain('RuntimePluginShutdown');
  });

  // ─── 7. CLI Subcommands ──────────────────────────────────────────

  it('should execute CLI plugin subcommands cleanly', async () => {
    const cli = new SeOsCli(createSafeTestProviderOverrides());
    await cli.boot('./non_existent_config.json');

    await cli.runtimePluginList();
    await cli.runtimePluginInspect('mock-runtime-plugin');
    await cli.runtimePluginValidate('mock-runtime-plugin');
    await cli.runtimePluginDisable('mock-runtime-plugin');
    await cli.runtimePluginEnable('mock-runtime-plugin');

    await cli.shutdown();
  });
});
