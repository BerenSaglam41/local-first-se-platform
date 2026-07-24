import { Kernel } from '../../src/v2/kernel/kernel';
import { RuntimeSessionManager } from '../../src/v2/application/session/runtime_session_manager';
import { SessionLifecycleManager } from '../../src/v2/application/session/session_lifecycle_manager';
import { RuntimeSessionRegistry } from '../../src/v2/application/session/runtime_session_registry';
import { RuntimeSession } from '../../src/v2/application/session/runtime_session';
import { PtyTransport } from '../../src/v2/infrastructure/transport/pty_transport';
import { PtyEngine } from '../../src/v2/infrastructure/pty/pty_engine';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { spawn } from 'child_process';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 13 — Runtime Session Manager Suite', () => {
  const testDbPath = './se_company_m13_test.db';
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

  // ─── 1. Transport Abstraction & PtyTransport Binding ─────────────

  it('should instantiate PtyTransport implementing IRuntimeTransport contract', () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    const ptyEngine = new PtyEngine(child);
    const transport = new PtyTransport(ptyEngine);

    expect(transport.transportType).toBe('PTY');
    expect(transport.write).toBeDefined();
    expect(transport.resize).toBeDefined();
    expect(transport.getDimensions().cols).toBe(80);

    transport.close();
  });

  // ─── 2. Session Creation & State Machine ───────────────────────────

  it('should manage RuntimeSession state transitions cleanly', () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    const ptyEngine = new PtyEngine(child);
    const transport = new PtyTransport(ptyEngine);

    const session = new RuntimeSession('sess-01', 'emp-alice', 'reference-plugin', transport);
    expect(session.sessionId).toBe('sess-01');
    expect(session.workerId).toBe('emp-alice');
    expect(session.getState()).toBe('Ready');

    session.pause();
    expect(session.getState()).toBe('Waiting');

    session.resume();
    expect(session.getState()).toBe('Idle');

    session.close();
    expect(session.getState()).toBe('Stopped');
  });

  // ─── 3. Incremental Streaming & Stream Completion ───────────────────

  it('should stream stdout chunks and complete execution streams', async () => {
    const child = spawn(process.execPath, ['-e', 'console.log("hello world"); setInterval(() => {}, 1000)']);
    const ptyEngine = new PtyEngine(child);
    const transport = new PtyTransport(ptyEngine);
    const session = new RuntimeSession('sess-stream', 'emp-bob', 'reference-plugin', transport);

    const stdoutChunks: string[] = [];
    const result = await session.executeStream('echo test\n', {
      onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
      timeoutMs: 100,
    });

    expect(result.completed).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    session.close();
  });

  // ─── 4. Stream Cancellation ────────────────────────────────────────

  it('should support canceling active execution streams', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    const ptyEngine = new PtyEngine(child);
    const transport = new PtyTransport(ptyEngine);
    const session = new RuntimeSession('sess-cancel', 'emp-bob', 'reference-plugin', transport);

    const controller = new AbortController();
    const promise = session.executeStream('long running task', { cancellationSignal: controller.signal });

    controller.abort();
    const result = await promise;

    expect(result.cancelled).toBe(true);
    expect(result.completed).toBe(false);
    session.close();
  });

  // ─── 5. Worker Isolation ───────────────────────────────────────────

  it('should enforce worker isolation across separate runtime sessions', () => {
    const registry = new RuntimeSessionRegistry();
    const lifecycle = new SessionLifecycleManager(registry);

    const s1 = lifecycle.createSession('emp-alice', 'plugin-a');
    const s2 = lifecycle.createSession('emp-bob', 'plugin-b');

    expect(s1.sessionId).not.toBe(s2.sessionId);
    expect(s1.workerId).toBe('emp-alice');
    expect(s2.workerId).toBe('emp-bob');

    expect(registry.getSessionForWorker('emp-alice')?.sessionId).toBe(s1.sessionId);
    expect(registry.getSessionForWorker('emp-bob')?.sessionId).toBe(s2.sessionId);

    s1.close();
    s2.close();
  });

  // ─── 6. Session Reuse Across Missions ──────────────────────────────

  it('should reuse existing active sessions for the same worker', () => {
    const registry = new RuntimeSessionRegistry();
    const lifecycle = new SessionLifecycleManager(registry);

    const s1 = lifecycle.createSession('emp-alice', 'plugin-a');
    const s2 = lifecycle.createSession('emp-alice', 'plugin-a'); // reuse attempt

    expect(s1.sessionId).toBe(s2.sessionId);
    expect(s2.metadata.missionCount).toBe(0);

    s1.close();
  });

  // ─── 7. Stop & Restart Lifecycles ──────────────────────────────────

  it('should stop, restart, and recover runtime sessions', () => {
    const registry = new RuntimeSessionRegistry();
    const lifecycle = new SessionLifecycleManager(registry);

    const s1 = lifecycle.createSession('emp-charlie', 'plugin-qa');
    const origId = s1.sessionId;

    const restarted = lifecycle.restartSession(origId);
    expect(restarted).toBeDefined();
    expect(restarted!.sessionId).not.toBe(origId);
    expect(restarted!.workerId).toBe('emp-charlie');

    restarted!.close();
  });

  // ─── 8. Health Monitoring & Reports ────────────────────────────────

  it('should track runtime health status and generate health reports', () => {
    const manager = new RuntimeSessionManager();
    const session = manager.createSession('emp-devops', 'plugin-devops');

    const report = manager.getHealthReport();
    expect(report[session.sessionId]).toBeDefined();
    expect(report[session.sessionId].status).toBe('HEALTHY');
    expect(report[session.sessionId].errorCount).toBe(0);

    manager.shutdown();
  });

  // ─── 9. Domain Event Emissions ─────────────────────────────────────

  it('should emit and persist all session domain events', () => {
    const manager = new RuntimeSessionManager();
    const events: string[] = [];

    manager.on('SessionCreated', () => events.push('SessionCreated'));
    manager.on('SessionStarted', () => events.push('SessionStarted'));
    manager.on('SessionReady', () => events.push('SessionReady'));
    manager.on('SessionBusy', () => events.push('SessionBusy'));
    manager.on('SessionDestroyed', () => events.push('SessionDestroyed'));

    const session = manager.createSession('emp-alice');
    manager.startSession(session.sessionId);
    manager.stopSession(session.sessionId);

    expect(events).toContain('SessionCreated');
    expect(events).toContain('SessionStarted');
    expect(events).toContain('SessionDestroyed');

    manager.shutdown();
  });

  // ─── 10. CLI Integration ──────────────────────────────────────────

  it('should execute CLI runtime subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');

    await cli.runtimeStart('emp-bob');
    await cli.runtimeSessions();
    await cli.runtimeStatus();
    
    const mgr = cli['kernel'].getRuntimeSessionManager();
    const sessions = mgr.getRegistry().listSessions();
    expect(sessions.length).toBeGreaterThan(0);
    const sid = sessions[0].sessionId;

    await cli.runtimeInspect(sid);
    await cli.runtimeRestart(sid);
    
    const newSessions = mgr.getRegistry().listSessions();
    if (newSessions.length > 0) {
      await cli.runtimeStop(newSessions[0].sessionId);
    }

    await cli.shutdown();
  });
});
