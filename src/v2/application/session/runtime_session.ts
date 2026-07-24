import { EventEmitter } from 'events';
import {
  IRuntimeSession,
  SessionState,
  SessionMetadata,
  SessionStreamOptions,
  SessionStreamResult,
  RuntimeHealthStatus,
} from '../../contracts/iruntime_session';
import { IRuntimeTransport } from '../../contracts/iruntime_transport';

export class RuntimeSession extends EventEmitter implements IRuntimeSession {
  readonly sessionId: string;
  readonly workerId: string;
  readonly pluginId: string;
  readonly metadata: SessionMetadata;

  private state: SessionState = 'Starting';
  private activeAbortController?: AbortController;
  private startTime = Date.now();
  private errorCount = 0;

  constructor(
    sessionId: string,
    workerId: string,
    pluginId: string,
    private transport: IRuntimeTransport,
  ) {
    super();
    this.sessionId = sessionId;
    this.workerId = workerId;
    this.pluginId = pluginId;

    const now = new Date().toISOString();
    this.metadata = {
      sessionId,
      workerId,
      pluginId,
      transportType: transport.transportType,
      state: 'Starting',
      createdAt: now,
      lastActivityAt: now,
      missionCount: 0,
      healthStatus: {
        status: 'HEALTHY',
        cpuPercent: 0,
        memoryMb: 12,
        errorCount: 0,
        uptimeSec: 0,
        lastHeartbeat: now,
      },
    };

    // Bind to generic transport events
    this.transport.on('data', (data: string) => {
      this.touchActivity();
      this.emit('stdout', data);
    });

    this.transport.on('error', (errText: string) => {
      this.errorCount++;
      this.metadata.healthStatus.errorCount = this.errorCount;
      this.touchActivity();
      this.emit('stderr', errText);
    });

    this.transport.on('close', () => {
      this.transitionState('Stopped');
    });

    // Move to Ready state once initialized
    this.transitionState('Ready');
  }

  getState(): SessionState {
    return this.state;
  }

  write(input: string): boolean {
    this.touchActivity();
    return this.transport.write(input);
  }

  async executeStream(input: string, options?: SessionStreamOptions): Promise<SessionStreamResult> {
    if (this.state === 'Stopped' || this.state === 'Failed' || this.state === 'Stopping') {
      throw new Error(`Cannot execute stream on session ${this.sessionId} in state '${this.state}'`);
    }

    this.transitionState('Busy');
    this.touchActivity();
    this.metadata.missionCount++;

    const startMs = Date.now();
    let outputBuf = '';
    let errorBuf = '';
    let isCancelled = false;

    this.activeAbortController = new AbortController();
    const abortSignal = options?.cancellationSignal || this.activeAbortController.signal;

    return new Promise<SessionStreamResult>((resolve) => {
      let timeoutTimer: NodeJS.Timeout | undefined;

      const onData = (data: string) => {
        outputBuf += data;
        if (options?.onStdoutChunk) {
          options.onStdoutChunk(data);
        }
      };

      const onError = (err: string) => {
        errorBuf += err;
        if (options?.onStderrChunk) {
          options.onStderrChunk(err);
        }
      };

      const cleanup = () => {
        this.off('stdout', onData);
        this.off('stderr', onError);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this.activeAbortController = undefined;
      };

      const onAbort = () => {
        isCancelled = true;
        cleanup();
        this.transitionState('Idle');
        resolve({
          completed: false,
          cancelled: true,
          output: outputBuf,
          errorOutput: errorBuf,
          durationMs: Date.now() - startMs,
        });
      };

      if (abortSignal.aborted) {
        onAbort();
        return;
      }

      abortSignal.addEventListener('abort', onAbort, { once: true });

      this.on('stdout', onData);
      this.on('stderr', onError);

      if (options?.timeoutMs) {
        timeoutTimer = setTimeout(() => {
          cleanup();
          this.transitionState('Idle');
          resolve({
            completed: true,
            cancelled: false,
            output: outputBuf,
            errorOutput: errorBuf + '\n[Stream timeout reached]',
            durationMs: Date.now() - startMs,
          });
        }, options.timeoutMs);
      }

      // Write input to transport
      const success = this.write(input);
      if (!success) {
        cleanup();
        this.transitionState('Idle');
        resolve({
          completed: false,
          cancelled: false,
          output: outputBuf,
          errorOutput: 'Failed to write input to transport',
          durationMs: Date.now() - startMs,
        });
        return;
      }

      // Short async completion cycle for streaming simulation / completion
      setTimeout(() => {
        if (!isCancelled && !abortSignal.aborted) {
          cleanup();
          this.transitionState('Idle');
          resolve({
            completed: true,
            cancelled: false,
            output: outputBuf,
            errorOutput: errorBuf,
            durationMs: Date.now() - startMs,
          });
        }
      }, 50);
    });
  }

  cancelStream(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
  }

  pause(): boolean {
    if (this.state === 'Busy' || this.state === 'Ready' || this.state === 'Idle') {
      this.transitionState('Waiting');
      return true;
    }
    return false;
  }

  resume(): boolean {
    if (this.state === 'Waiting') {
      this.transitionState('Idle');
      return true;
    }
    return false;
  }

  close(): void {
    this.transitionState('Stopping');
    this.cancelStream();
    this.transport.close();
    this.transitionState('Stopped');
  }

  touchActivity(): void {
    const now = new Date().toISOString();
    this.metadata.lastActivityAt = now;
    this.metadata.healthStatus.lastHeartbeat = now;
    this.metadata.healthStatus.uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
  }

  private transitionState(newState: SessionState): void {
    const oldState = this.state;
    this.state = newState;
    this.metadata.state = newState;
    this.emit('stateChange', { oldState, newState });
  }
}
