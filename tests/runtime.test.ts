import { ProcessRuntime } from '../src/infrastructure/runtime/process_runtime';
import { ExecutionState } from '../src/core/domain/models/runtime';

describe('Process Runtime Kernel', () => {
  let runtime: ProcessRuntime;

  beforeEach(() => {
    runtime = new ProcessRuntime();
  });

  it('should successfully run a process to completion, capturing exit code and stdout streaming', async () => {
    const handle = runtime.execute({
      executable: process.execPath,
      args: ['-e', "console.log('first'); setTimeout(() => console.log('second'), 50);"],
    });

    const stdoutChunks: string[] = [];
    handle.on('stdout', (chunk) => {
      stdoutChunks.push(chunk);
    });

    const stateChanges: ExecutionState[] = [];
    handle.on('stateChange', (state) => {
      stateChanges.push(state);
    });

    expect([ExecutionState.CREATED, ExecutionState.STARTING, ExecutionState.RUNNING]).toContain(handle.getState());

    const result = await handle.wait();

    expect(result.state).toBe(ExecutionState.FINISHED);
    expect(result.exitCode).toBe(0);
    expect(result.metrics.pid).toBeGreaterThan(0);
    expect(result.metrics.durationMs).toBeGreaterThanOrEqual(50);
    expect(stdoutChunks.join('')).toContain('first\nsecond\n');
    expect(stateChanges).toContain(ExecutionState.STARTING);
    expect(stateChanges).toContain(ExecutionState.RUNNING);
    expect(stateChanges).toContain(ExecutionState.FINISHED);
  });

  it('should stream stderr and fail when a process exits with a non-zero code', async () => {
    const handle = runtime.execute({
      executable: process.execPath,
      args: ['-e', "console.error('some error'); process.exit(13);"],
    });

    const stderrChunks: string[] = [];
    handle.on('stderr', (chunk) => {
      stderrChunks.push(chunk);
    });

    const result = await handle.wait();

    expect(result.state).toBe(ExecutionState.FAILED);
    expect(result.exitCode).toBe(13);
    expect(stderrChunks.join('')).toContain('some error');
  });

  it('should support interactive stdin communication', async () => {
    const handle = runtime.execute({
      executable: process.execPath,
      args: ['-e', "process.stdin.on('data', d => { console.log('echo:' + d.toString().trim()); process.exit(0); });"],
    });

    const stdoutChunks: string[] = [];
    handle.on('stdout', (chunk) => {
      stdoutChunks.push(chunk);
    });

    // Wait a tiny bit for process to start
    await new Promise((resolve) => setTimeout(resolve, 50));
    await handle.write('ping\n');

    const result = await handle.wait();
    expect(stdoutChunks.join('')).toContain('echo:ping');
    expect(result.state).toBe(ExecutionState.FINISHED);
  });

  it('should timeout and kill the process if it exceeds execution limit', async () => {
    const handle = runtime.execute({
      executable: process.execPath,
      args: ['-e', "setTimeout(() => console.log('should not print'), 5000);"],
      timeoutMs: 150,
    });

    const result = await handle.wait();

    expect(result.state).toBe(ExecutionState.TIMEOUT);
    expect(result.metrics.signal).toBe('SIGKILL');
  });

  it('should abort immediately and kill process when AbortController triggers cancellation', async () => {
    const controller = new AbortController();
    const handle = runtime.execute(
      {
        executable: process.execPath,
        args: ['-e', "setTimeout(() => console.log('cancelled'), 5000);"],
      },
      controller.signal
    );

    // Cancel after 50ms
    setTimeout(() => {
      controller.abort();
    }, 50);

    const result = await handle.wait();

    expect(result.state).toBe(ExecutionState.CANCELLED);
    expect(result.metrics.signal).toBe('SIGKILL');
  });

  it('should handle multiple concurrent process executions independently without shared state', async () => {
    const runProcess = async (val: string, delay: number) => {
      const handle = runtime.execute({
        executable: process.execPath,
        args: ['-e', `setTimeout(() => console.log('${val}'), ${delay});`],
      });
      const chunks: string[] = [];
      handle.on('stdout', (c) => chunks.push(c));
      const res = await handle.wait();
      return { res, output: chunks.join('').trim() };
    };

    const [p1, p2] = await Promise.all([
      runProcess('procA', 40),
      runProcess('procB', 80),
    ]);

    expect(p1.res.state).toBe(ExecutionState.FINISHED);
    expect(p1.output).toBe('procA');

    expect(p2.res.state).toBe(ExecutionState.FINISHED);
    expect(p2.output).toBe('procB');
  });

  it('should transition to FAILED if executing a non-existent binary', async () => {
    const handle = runtime.execute({
      executable: 'invalid_binary_name_xyz',
      args: [],
    });

    const result = await handle.wait();
    expect(result.state).toBe(ExecutionState.FAILED);
    expect(result.error).toBeDefined();
  });
});
