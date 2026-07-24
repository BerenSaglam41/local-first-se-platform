import { EventEmitter } from 'events';
import { IRuntimeSession, SessionMetadata } from '../../contracts/iruntime_session';

export class RuntimeSessionRegistry extends EventEmitter {
  private sessions = new Map<string, IRuntimeSession>();
  private workerToSessionMap = new Map<string, string>();

  registerSession(session: IRuntimeSession): void {
    this.sessions.set(session.sessionId, session);
    this.workerToSessionMap.set(session.workerId, session.sessionId);
    this.emit('registered', session.sessionId);
  }

  unregisterSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.workerToSessionMap.delete(session.workerId);
    this.sessions.delete(sessionId);
    this.emit('unregistered', sessionId);
    return true;
  }

  getSession(sessionId: string): IRuntimeSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionForWorker(workerId: string): IRuntimeSession | undefined {
    const sessionId = this.workerToSessionMap.get(workerId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  listSessions(): IRuntimeSession[] {
    return Array.from(this.sessions.values());
  }

  listMetadata(): SessionMetadata[] {
    return Array.from(this.sessions.values()).map((s) => s.metadata);
  }

  clear(): void {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
    this.workerToSessionMap.clear();
  }
}
