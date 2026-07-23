import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { IExecutionHandle, IProcessRuntime } from '../../core/domain/interfaces/iprocess_runtime';
import { ExecutionOptions, ExecutionState, ProcessMetrics, ExecutionResult } from '../../core/domain/models/runtime';
import { ValidationException, StorageException } from '../../core/domain/errors/exceptions';

export class ExecutionHandle extends EventEmitter implements IExecutionHandle {
  private state: ExecutionState = ExecutionState.CREATED;
  private metrics: ProcessMetrics;
  private childProcess?: ChildProcess;
  private resolvePromise?: (result: ExecutionResult) => void;
  private resultPromise: Promise<ExecutionResult>;
  private timeoutTimer?: NodeJS.Timeout;

  constructor(private options: ExecutionOptions, abortSignal?: AbortSignal) {
    super();
    this.metrics = {
      startTime: Date.now(),
    };

    this.resultPromise = new Promise<ExecutionResult>((resolve) => {
      this.resolvePromise = resolve;
    });

    if (abortSignal) {
      if (abortSignal.aborted) {
        this.state = ExecutionState.CANCELLED;
      } else {
        abortSignal.addEventListener('abort', () => this.cancel());
      }
    }
  }

  private transitionTo(newState: ExecutionState) {
    if (this.state === newState) return;
    this.state = newState;
    this.emit('stateChange', newState);
  }

  getState(): ExecutionState {
    return this.state;
  }

  getMetrics(): ProcessMetrics {
    if (this.childProcess) {
      this.metrics.pid = this.childProcess.pid;
    }
    this.metrics.durationMs = Date.now() - this.metrics.startTime;
    return this.metrics;
  }

  async start(): Promise<void> {
    if (this.state === ExecutionState.CANCELLED) {
      this.complete(ExecutionState.CANCELLED, null, null);
      return;
    }

    this.transitionTo(ExecutionState.STARTING);

    // Validate options to prevent injection
    if (!this.options.executable || this.options.executable.trim() === '') {
      throw new ValidationException('Executable path cannot be empty');
    }

    try {
      this.childProcess = spawn(this.options.executable, this.options.args, {
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: 'pipe',
      });

      this.metrics.pid = this.childProcess.pid;
      this.transitionTo(ExecutionState.RUNNING);

      // Setup timeout
      if (this.options.timeoutMs && this.options.timeoutMs > 0) {
        this.timeoutTimer = setTimeout(() => {
          this.handleTimeout();
        }, this.options.timeoutMs);
      }

      // Stream stdout
      this.childProcess.stdout?.on('data', (chunk: Buffer) => {
        this.emit('stdout', chunk.toString('utf8'));
      });

      // Stream stderr
      this.childProcess.stderr?.on('data', (chunk: Buffer) => {
        this.emit('stderr', chunk.toString('utf8'));
      });

      // Error event (spawn failure, etc.)
      this.childProcess.on('error', (err) => {
        this.cleanup();
        this.transitionTo(ExecutionState.FAILED);
        this.metrics.endTime = Date.now();
        this.metrics.durationMs = this.metrics.endTime - this.metrics.startTime;
        this.resolvePromise?.({
          state: ExecutionState.FAILED,
          exitCode: null,
          signal: null,
          metrics: this.metrics,
          error: err,
        });
      });

      // Exit event
      this.childProcess.on('close', (code, signal) => {
        this.cleanup();
        
        if (
          this.state === ExecutionState.TIMEOUT ||
          this.state === ExecutionState.CANCELLED ||
          this.state === ExecutionState.FINISHED ||
          this.state === ExecutionState.FAILED
        ) {
          return;
        }

        const finalState = code === 0 ? ExecutionState.FINISHED : ExecutionState.FAILED;
        this.complete(finalState, code, signal);
      });

    } catch (err: any) {
      this.transitionTo(ExecutionState.FAILED);
      this.resolvePromise?.({
        state: ExecutionState.FAILED,
        exitCode: null,
        signal: null,
        metrics: this.metrics,
        error: err,
      });
    }
  }

  async write(data: string): Promise<void> {
    if (this.state !== ExecutionState.RUNNING || !this.childProcess?.stdin) {
      throw new StorageException('Process is not running or stdin is unavailable');
    }
    return new Promise<void>((resolve, reject) => {
      this.childProcess!.stdin!.write(data, 'utf8', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async kill(signal: string = 'SIGTERM'): Promise<void> {
    if (!this.childProcess) return;
    this.transitionTo(ExecutionState.STOPPING);
    
    return new Promise<void>((resolve) => {
      if (this.childProcess!.killed) {
        resolve();
        return;
      }
      this.childProcess!.kill(signal as NodeJS.Signals);
      resolve();
    });
  }

  private cancel() {
    if (this.state === ExecutionState.FINISHED || this.state === ExecutionState.FAILED || this.state === ExecutionState.TIMEOUT) {
      return;
    }
    this.transitionTo(ExecutionState.STOPPING);
    this.kill('SIGKILL').then(() => {
      this.complete(ExecutionState.CANCELLED, null, 'SIGKILL');
    });
  }

  private handleTimeout() {
    if (this.state === ExecutionState.FINISHED || this.state === ExecutionState.FAILED || this.state === ExecutionState.CANCELLED) {
      return;
    }
    this.transitionTo(ExecutionState.STOPPING);
    this.kill('SIGKILL').then(() => {
      this.complete(ExecutionState.TIMEOUT, null, 'SIGKILL');
    });
  }

  private complete(finalState: ExecutionState, exitCode: number | null, signal: string | null) {
    this.cleanup();
    this.transitionTo(finalState);
    this.metrics.endTime = Date.now();
    this.metrics.durationMs = this.metrics.endTime - this.metrics.startTime;
    this.metrics.exitCode = exitCode;
    this.metrics.signal = signal;

    this.resolvePromise?.({
      state: finalState,
      exitCode,
      signal,
      metrics: this.metrics,
    });
  }

  private cleanup() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
  }

  wait(): Promise<ExecutionResult> {
    return this.resultPromise;
  }
}

export class ProcessRuntime implements IProcessRuntime {
  execute(options: ExecutionOptions, abortSignal?: AbortSignal): IExecutionHandle {
    const handle = new ExecutionHandle(options, abortSignal);
    process.nextTick(() => {
      handle.start().catch((err) => {
        // Suppress or handle unhandled startup rejections
      });
    });
    return handle;
  }
}
