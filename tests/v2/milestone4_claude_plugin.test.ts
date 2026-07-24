import { RuntimePluginManager } from '../../src/v2/application/plugins/runtime_plugin_manager';
import { ClaudeRuntimePlugin } from '../../plugins/claude-cli/claude_runtime_plugin';
import { ClaudeSession } from '../../plugins/claude-cli/claude_session';
import { ClaudeExecutor } from '../../plugins/claude-cli/claude_executor';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';
import * as path from 'path';

describe('SE-OS v2.0 Milestone 4 — Claude CLI Reference Runtime Plugin Suite', () => {
  let pluginManager: RuntimePluginManager;
  let claudePlugin: ClaudeRuntimePlugin;

  beforeEach(() => {
    pluginManager = new RuntimePluginManager();
    claudePlugin = new ClaudeRuntimePlugin();
  });

  afterEach(async () => {
    await claudePlugin.shutdown();
  });

  it('should load Claude CLI Runtime Plugin through RuntimePluginManager', async () => {
    const registered = await pluginManager.registerPlugin(claudePlugin);
    expect(registered).toBe(true);

    const list = pluginManager.listPlugins();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('plugin-claude-cli');
    expect(list[0].name).toBe('Claude CLI Runtime Plugin');
    expect(list[0].capabilities).toContain('CODE_GENERATION');
  });

  it('should pass health check for Claude CLI plugin', async () => {
    await pluginManager.registerPlugin(claudePlugin);
    const health = await pluginManager.healthCheckAll();

    expect(health['plugin-claude-cli']).toBeDefined();
    expect(health['plugin-claude-cli'].status).toBe('HEALTHY');
  });

  it('should manage independent Claude CLI sessions for multiple workers', async () => {
    await pluginManager.registerPlugin(claudePlugin);
    const plugin = pluginManager.getPlugin('plugin-claude-cli') as ClaudeRuntimePlugin;
    expect(plugin).toBeDefined();

    const handleAlice = await plugin.spawnWorker({
      workerId: 'emp-alice',
      name: 'Alice',
      role: 'Lead Architect',
      department: 'Architecture',
    });

    const handleBob = await plugin.spawnWorker({
      workerId: 'emp-bob',
      name: 'Bob',
      role: 'Backend Engineer',
      department: 'Backend',
    });

    expect(handleAlice.workerId).toBe('emp-alice');
    expect(handleBob.workerId).toBe('emp-bob');
    expect(handleAlice.pid).toBeGreaterThan(0);
    expect(handleBob.pid).toBeGreaterThan(0);
    expect(handleAlice.pid).not.toBe(handleBob.pid);

    const sessionAlice = plugin.getSession('emp-alice');
    const sessionBob = plugin.getSession('emp-bob');
    expect(sessionAlice).toBeDefined();
    expect(sessionBob).toBeDefined();
    expect(sessionAlice?.sessionId).toBe('session-emp-alice');
    expect(sessionBob?.sessionId).toBe('session-emp-bob');

    await plugin.stopWorker('emp-alice');
    await plugin.stopWorker('emp-bob');
  });

  it('should execute task and produce structured Kernel-neutral ExecutionResult', async () => {
    await pluginManager.registerPlugin(claudePlugin);
    const plugin = pluginManager.getPlugin('plugin-claude-cli')!;

    const result = await plugin.execute({
      workerId: 'emp-alice',
      taskId: 'task-auth-01',
      prompt: 'Implement JWT authentication service in src/auth.ts',
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.taskId).toBe('task-auth-01');
    expect(result.stdout).toContain('[Claude CLI Response for worker emp-alice]');
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should guarantee ZERO Claude-specific imports exist in src/v2/kernel/', () => {
    const kernelFilePath = path.join(__dirname, '../../src/v2/kernel/kernel.ts');
    const kernelCode = fs.readFileSync(kernelFilePath, 'utf8');

    expect(kernelCode).not.toContain('Claude');
    expect(kernelCode).not.toContain('claude');
  });

  it('should support plugin unloading cleanly', async () => {
    await pluginManager.registerPlugin(claudePlugin);
    expect(pluginManager.listPlugins().length).toBe(1);

    const unloaded = await pluginManager.unloadPlugin('plugin-claude-cli');
    expect(unloaded).toBe(true);
    expect(pluginManager.listPlugins().length).toBe(0);
  });

  it('should execute plugin CLI list, health, attach, and detach subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');
    await cli.pluginsList();
    await cli.pluginsHealth();
    await cli.workerAttach('emp-alice', 'plugin-claude-cli');
    await cli.workerDetach('emp-alice');
    await cli.shutdown();
  });
});
