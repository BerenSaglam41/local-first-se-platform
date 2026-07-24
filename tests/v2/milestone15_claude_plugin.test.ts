import { Kernel } from '../../src/v2/kernel/kernel';
import { ClaudeCliDetector } from '../../src/v2/application/plugins/claude/claude_cli_detector';
import { ClaudeCodeRuntimePlugin } from '../../src/v2/application/plugins/claude/claude_code_runtime_plugin';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
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
    expect(meta.supportedTransports).toContain('PTY');
    expect(plugin.capabilities()).toContain('Reasoning');
    expect(plugin.capabilities()).toContain('Streaming');
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

  // ─── 4. Session Attachment & Detachment ────────────────────────────

  it('should attach and detach IRuntimeSession instances', async () => {
    await kernel.boot('./non_existent_config.json');
    const sessionManager = kernel.getRuntimeSessionManager();
    const session = sessionManager.createSession('emp-bob');

    const plugin = new ClaudeCodeRuntimePlugin();
    await plugin.initialize();

    const attached = await plugin.attachSession(session);
    expect(attached).toBe(true);

    const detached = await plugin.detachSession(session.sessionId);
    expect(detached).toBe(true);

    await plugin.shutdown();
    session.close();
  });

  // ─── 5. Task Execution ─────────────────────────────────────────────

  it('should execute prompts and return structured result', async () => {
    const plugin = new ClaudeCodeRuntimePlugin();
    await plugin.initialize();

    const result = await plugin.execute({ prompt: 'Write a typescript interface' });
    expect(result.success).toBe(true);
    expect(result.pluginId).toBe('plugin-claude-code');
    expect(result.output).toContain('Write a typescript interface');

    await plugin.shutdown();
  });

  // ─── 6. Output Streaming & Cancellation ─────────────────────────────

  it('should stream prompt output and support cancellation via attached session', async () => {
    await kernel.boot('./non_existent_config.json');
    const sessionManager = kernel.getRuntimeSessionManager();
    const session = sessionManager.createSession('emp-alice');

    const plugin = new ClaudeCodeRuntimePlugin();
    await plugin.initialize();
    await plugin.attachSession(session);

    const chunks: string[] = [];
    const streamResult = await plugin.stream(session.sessionId, 'Refactor module', {
      onStdoutChunk: (chunk) => chunks.push(chunk),
      timeoutMs: 100,
    });

    expect(streamResult.completed).toBe(true);

    const cancelResult = await plugin.cancel(session.sessionId);
    expect(cancelResult).toBe(true);

    await plugin.shutdown();
    session.close();
  });

  // ─── 7. Domain Event Persistence ───────────────────────────────────

  it('should emit generic Runtime* domain events with pluginId payload', async () => {
    const events: string[] = [];
    const plugin = new ClaudeCodeRuntimePlugin();
    await plugin.initialize();

    plugin.on('RuntimePluginAttached', () => events.push('RuntimePluginAttached'));
    plugin.on('RuntimeExecutionStarted', () => events.push('RuntimeExecutionStarted'));
    plugin.on('RuntimeExecutionCompleted', () => events.push('RuntimeExecutionCompleted'));
    plugin.on('RuntimePluginDetached', () => events.push('RuntimePluginDetached'));

    await kernel.boot('./non_existent_config.json');
    const sessionManager = kernel.getRuntimeSessionManager();
    const session = sessionManager.createSession('emp-charlie');

    await plugin.attachSession(session);
    await plugin.execute({ prompt: 'Test event emission' });
    await plugin.detachSession(session.sessionId);

    expect(events).toEqual([
      'RuntimePluginAttached',
      'RuntimeExecutionStarted',
      'RuntimeExecutionCompleted',
      'RuntimePluginDetached',
    ]);

    await plugin.shutdown();
    session.close();
  });

  // ─── 8. CLI Subcommands ──────────────────────────────────────────

  it('should execute CLI claude subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');

    await cli.claudeStatus();
    await cli.claudeHealth();
    await cli.claudeExecute('Test CLI Prompt');
    await cli.claudeStream('Test Stream CLI Prompt');

    await cli.shutdown();
  });
});
