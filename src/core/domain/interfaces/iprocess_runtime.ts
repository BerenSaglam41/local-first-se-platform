import { ExecutionOptions, ExecutionState, ProcessMetrics, ExecutionResult } from '../models/runtime';

export interface IExecutionHandle {
  write(data: string): Promise<void>;
  kill(signal?: string): Promise<void>;
  getState(): ExecutionState;
  getMetrics(): ProcessMetrics;
  on(event: 'stdout', listener: (chunk: string) => void): this;
  on(event: 'stderr', listener: (chunk: string) => void): this;
  on(event: 'stateChange', listener: (state: ExecutionState) => void): this;
  wait(): Promise<ExecutionResult>;
}

export interface IProcessRuntime {
  execute(options: ExecutionOptions, abortSignal?: AbortSignal): IExecutionHandle;
}
