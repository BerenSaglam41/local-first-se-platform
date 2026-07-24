import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { RuntimeSessionRegistry } from './runtime_session_registry';
import { RuntimeSession } from './runtime_session';
import { IRuntimeSession, SessionState } from '../../contracts/iruntime_session';
import { TransportType } from '../../contracts/iruntime_transport';
import { PtyEngine } from '../../infrastructure/pty/pty_engine';
import { PtyTransport } from '../../infrastructure/transport/pty_transport';

export class SessionLifecycleManager extends EventEmitter {
  constructor(private registry: RuntimeSessionRegistry) {
    super();
  }

  createSession(
    workerId: string,
    pluginId: string = 'reference-plugin',
    transportType: TransportType = 'PTY',
    executable: string = process.execPath,
    args: string[] = ['-e', 'setInterval(() => {}, 1000)']
  ): IRuntimeSession {
    // Check if reusable session exists for worker
    const existing = this.registry.getSessionForWorker(workerId);
    if (existing && existing.getState() !== 'Stopped' && existing.getState() !== 'Failed') {
      return existing;
    }

    const sessionId = `session-${workerId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const ptyEngine = new PtyEngine(child);
    const transport = new PtyTransport(ptyEngine);

    const session = new RuntimeSession(sessionId, workerId, pluginId, transport);
    this.registry.registerSession(session);

    this.emit('created', session);
    return session;
  }

  startSession(sessionId: string): boolean {
    const session = this.registry.getSession(sessionId);
    if (!session) return false;
    session.touchActivity();
    this.emit('started', session);
    return true;
  }

  reuseSession(workerId: string): IRuntimeSession | null {
    const existing = this.registry.getSessionForWorker(workerId);
    if (existing && existing.getState() !== 'Stopped' && existing.getState() !== 'Failed') {
      existing.touchActivity();
      this.emit('reused', existing);
      return existing;
    }
    return null;
  }

  stopSession(sessionId: string): boolean {
    const session = this.registry.getSession(sessionId);
    if (!session) return false;

    session.close();
    this.registry.unregisterSession(sessionId);
    this.emit('stopped', sessionId);
    return true;
  }

  restartSession(sessionId: string): IRuntimeSession | null {
    const session = this.registry.getSession(sessionId);
    if (!session) return null;

    const workerId = session.workerId;
    const pluginId = session.pluginId;

    this.stopSession(sessionId);
    const newSession = this.createSession(workerId, pluginId);
    this.emit('restarted', newSession);
    return newSession;
  }

  recoverSession(sessionId: string): IRuntimeSession | null {
    const session = this.registry.getSession(sessionId);
    if (!session) return null;

    if (session.getState() === 'Failed' || session.getState() === 'Stopped') {
      return this.restartSession(sessionId);
    }
    return session;
  }
}
