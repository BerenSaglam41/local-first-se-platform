import { RuntimePluginManager } from '../../src/v2/application/plugins/runtime_plugin_manager';
import { DummyRuntimePlugin } from '../../src/v2/application/plugins/dummy_runtime_plugin';
import { CapabilityRegistry } from '../../src/v2/application/plugins/capability_registry';
import { PluginLoader } from '../../src/v2/application/plugins/plugin_loader';
import { PluginSandbox } from '../../src/v2/application/plugins/plugin_sandbox';

describe('SE-OS v2.0 Milestone 3 — Runtime Plugin Framework Suite', () => {
  let pluginManager: RuntimePluginManager;
  let dummyPlugin: DummyRuntimePlugin;

  beforeEach(() => {
    pluginManager = new RuntimePluginManager();
    dummyPlugin = new DummyRuntimePlugin();
  });

  afterEach(async () => {
    await dummyPlugin.shutdown();
  });

  it('should register and validate a compliant Runtime Plugin', async () => {
    const success = await pluginManager.registerPlugin(dummyPlugin);
    expect(success).toBe(true);

    const list = pluginManager.listPlugins();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('plugin-dummy-runtime');
    expect(list[0].name).toBe('Reference Testing Runtime Engine');
  });

  it('should map and query capabilities through CapabilityRegistry', async () => {
    await pluginManager.registerPlugin(dummyPlugin);
    const registry = pluginManager.getCapabilityRegistry();

    const codeGenPlugins = registry.findPluginsForCapability('CODE_GENERATION');
    expect(codeGenPlugins).toContain('plugin-dummy-runtime');

    const testGenPlugins = registry.findPluginsForCapability('TEST_GENERATION');
    expect(testGenPlugins).toContain('plugin-dummy-runtime');

    const hasCap = registry.hasCapability('plugin-dummy-runtime', 'CODE_REVIEW');
    expect(hasCap).toBe(true);
  });

  it('should validate plugin manifests and reject incompatible versions', () => {
    const loader = new PluginLoader();

    const validManifest = {
      id: 'plugin-test',
      name: 'Test Plugin',
      version: '1.0.0',
      minKernelVersion: '2.0.0',
      capabilities: ['CODE_GENERATION'],
    };

    expect(loader.validateManifest(validManifest)).toBe(true);
    expect(loader.isCompatible(validManifest as any)).toBe(true);

    const incompatibleManifest = {
      ...validManifest,
      minKernelVersion: '9.0.0',
    };
    expect(loader.isCompatible(incompatibleManifest as any)).toBe(false);
  });

  it('should perform health checks across registered plugins', async () => {
    await pluginManager.registerPlugin(dummyPlugin);

    const healthReport = await pluginManager.healthCheckAll();
    expect(healthReport['plugin-dummy-runtime']).toBeDefined();
    expect(healthReport['plugin-dummy-runtime'].status).toBe('HEALTHY');
  });

  it('should isolate plugin exceptions using PluginSandbox without crashing', async () => {
    const crashingPlugin: any = {
      metadata: () => ({
        id: 'plugin-crash',
        name: 'Crashing Plugin',
        version: '1.0.0',
        capabilities: ['CODE_GENERATION'],
      }),
      capabilities: () => ['CODE_GENERATION'],
      initialize: async () => {},
      shutdown: async () => {
        throw new Error('Crashing during shutdown');
      },
      spawnWorker: async () => {
        throw new Error('Crashing during spawn');
      },
      execute: async () => {
        throw new Error('Crashing during execute');
      },
      health: async () => {
        throw new Error('Crashing during health');
      },
    };

    const sandbox = new PluginSandbox(crashingPlugin);

    const handle = await sandbox.safeSpawnWorker({
      workerId: 'emp-1',
      name: 'Emp1',
      role: 'Dev',
      department: 'Eng',
    });
    expect(handle).toBeNull();

    const result = await sandbox.safeExecute({ taskId: 't1' });
    expect(result?.success).toBe(false);
    expect(result?.error).toBe('Crashing during execute');

    const health = await sandbox.safeHealth();
    expect(health.status).toBe('UNHEALTHY');
  });

  it('should spawn, execute, restart, and stop workers via IRuntimePlugin contract', async () => {
    await pluginManager.registerPlugin(dummyPlugin);
    const plugin = pluginManager.getPlugin('plugin-dummy-runtime');
    expect(plugin).toBeDefined();

    const workerHandle = await plugin!.spawnWorker({
      workerId: 'emp-dummy-1',
      name: 'Dummy1',
      role: 'Backend',
      department: 'Engineering',
    });

    expect(workerHandle.workerId).toBe('emp-dummy-1');
    expect(workerHandle.pid).toBeGreaterThan(0);

    const execResult = await plugin!.execute({ taskId: 'task-100', payload: 'data' });
    expect(execResult.success).toBe(true);
    expect(execResult.output).toContain('Executed payload through DummyRuntimePlugin');

    const restarted = await plugin!.restartWorker('emp-dummy-1');
    expect(restarted.workerId).toBe('emp-dummy-1');

    const stopped = await plugin!.stopWorker('emp-dummy-1');
    expect(stopped).toBe(true);
  });

  it('should support enabling, disabling, and unloading plugins', async () => {
    await pluginManager.registerPlugin(dummyPlugin);

    expect(pluginManager.disablePlugin('plugin-dummy-runtime')).toBe(true);
    expect(pluginManager.getPlugin('plugin-dummy-runtime')).toBeUndefined();

    expect(pluginManager.enablePlugin('plugin-dummy-runtime')).toBe(true);
    expect(pluginManager.getPlugin('plugin-dummy-runtime')).toBeDefined();

    const unloaded = await pluginManager.unloadPlugin('plugin-dummy-runtime');
    expect(unloaded).toBe(true);
    expect(pluginManager.listPlugins().length).toBe(0);
  });
});
