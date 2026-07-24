import { EventEmitter } from 'events';
import { RuntimeSessionRegistry } from './runtime_session_registry';
import { SessionLifecycleManager } from './session_lifecycle_manager';
import { IRuntimeSession, SessionMetadata, RuntimeHealthStatus } from '../../contracts/iruntime_session';
import { TransportType } from '../../contracts/iruntime_transport';
import { IEventStore } from '../../contracts/ievent_store';

export class RuntimeSessionManager extends EventEmitter {
  private registry = new RuntimeSessionRegistry();
  private lifecycleManager: SessionLifecycleManager;
  private monitorTimer?: NodeJS.Timeout;
  private idleTimeoutMs = 300000; // 5 minutes default

  constructor(private eventStore?: IEventStore) {
    super();
    this.lifecycleManager = new SessionLifecycleManager(this.registry);
    this.startHealthMonitor();
  }

  startHealthMonitor(): void {
    if (this.monitorTimer) return;
    this.monitorTimer = setInterval(() => this.runHealthCheck(), 2000);
  }

  stopHealthMonitor(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }
  }

  createSession(workerId: string, pluginId: string = 'reference-plugin', transportType: TransportType = 'PTY'): IRuntimeSession {
    const session = this.lifecycleManager.createSession(workerId, pluginId, transportType);
    this.emitEvent('SessionCreated', session.sessionId, { workerId, pluginId, transportType });

    session.on('stateChange', ({ oldState, newState }) => {
      if (newState === 'Ready') {
        this.emitEvent('SessionReady', session.sessionId, { workerId });
      } else if (newState === 'Busy') {
        this.emitEvent('SessionBusy', session.sessionId, { workerId });
      } else if (newState === 'Stopped') {
        this.emitEvent('SessionStopped', session.sessionId, { workerId });
      } else if (newState === 'Failed') {
        this.emitEvent('SessionFailed', session.sessionId, { workerId });
      }
    });

    return session;
  }

  startSession(sessionId: string): boolean {
    const ok = this.lifecycleManager.startSession(sessionId);
    if (ok) {
      this.emitEvent('SessionStarted', sessionId, {});
    }
    return ok;
  }

  getOrCreateSessionForWorker(workerId: string, pluginId: string = 'reference-plugin'): IRuntimeSession {
    const existing = this.lifecycleManager.reuseSession(workerId);
    if (existing) {
      return existing;
    }
    return this.createSession(workerId, pluginId);
  }

  stopSession(sessionId: string): boolean {
    const ok = this.lifecycleManager.stopSession(sessionId);
    if (ok) {
      this.emitEvent('SessionDestroyed', sessionId, {});
    }
    return ok;
  }

  restartSession(sessionId: string): IRuntimeSession | null {
    const newSession = this.lifecycleManager.restartSession(sessionId);
    if (newSession) {
      this.emitEvent('SessionRestarted', newSession.sessionId, { oldSessionId: sessionId });
    }
    return newSession;
  }

  recoverSession(sessionId: string): IRuntimeSession | null {
    const recovered = this.lifecycleManager.recoverSession(sessionId);
    if (recovered) {
      this.emitEvent('SessionRecovered', recovered.sessionId, {});
    }
    return recovered;
  }

  getRegistry(): RuntimeSessionRegistry {
    return this.registry;
  }

  getLifecycleManager(): SessionLifecycleManager {
    return this.lifecycleManager;
  }

  getHealthReport(): Record<string, RuntimeHealthStatus> {
    const report: Record<string, RuntimeHealthStatus> = {};
    for (const meta of this.registry.listMetadata()) {
      report[meta.sessionId] = meta.healthStatus;
    }
    return report;
  }

  private runHealthCheck(): void {
    const now = Date.now();
    for (const session of this.registry.listSessions()) {
      const lastAct = new Date(session.metadata.lastActivityAt).getTime();
      if (now - lastAct > this.idleTimeoutMs && session.getState() === 'Idle') {
        // Idle timeout graceful stop
        this.stopSession(session.sessionId);
      }
    }
  }

  shutdown(): void {
    this.stopHealthMonitor();
    this.registry.clear();
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'RuntimeSessionManager',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
