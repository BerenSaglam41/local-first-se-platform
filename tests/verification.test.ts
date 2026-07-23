import { VerificationRunner } from '../src/core/application/services/verification_runner';
import { IProcessRuntime } from '../src/core/domain/interfaces/iprocess_runtime';
import { EventEmitter } from 'events';

describe('VerificationRunner Service', () => {
  let mockRuntime: jest.Mocked<IProcessRuntime>;
  let mockHandle: any;

  beforeEach(() => {
    mockHandle = new EventEmitter();
    mockHandle.wait = jest.fn();
    mockRuntime = {
      execute: jest.fn().mockReturnValue(mockHandle),
    };
  });

  it('should run build command successfully', async () => {
    const runner = new VerificationRunner(mockRuntime);

    mockHandle.wait.mockResolvedValue({
      state: 'FINISHED',
      exitCode: 0,
      metrics: { durationMs: 45, pid: 123 },
    });

    const result = await runner.run(['npm run build']);

    expect(result.success).toBe(true);
    expect(result.buildPassed).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.steps.length).toBe(1);
    expect(result.steps[0].command).toBe('npm run build');
    expect(result.steps[0].success).toBe(true);
    expect(mockRuntime.execute).toHaveBeenCalledWith({
      executable: 'npm',
      args: ['run', 'build'],
    });
  });

  it('should stop sequential execution when build command fails', async () => {
    const runner = new VerificationRunner(mockRuntime);

    mockHandle.wait.mockResolvedValue({
      state: 'FINISHED',
      exitCode: 1,
      metrics: { durationMs: 30, pid: 124 },
    });

    const result = await runner.run(['npm run build', 'npm test']);

    expect(result.success).toBe(false);
    expect(result.buildPassed).toBe(false);
    expect(result.testsPassed).toBe(false);
    expect(result.steps.length).toBe(1);
    expect(mockRuntime.execute).toHaveBeenCalledTimes(1);
  });

  it('should run build and test successfully', async () => {
    const runner = new VerificationRunner(mockRuntime);

    mockHandle.wait.mockResolvedValue({
      state: 'FINISHED',
      exitCode: 0,
      metrics: { durationMs: 40, pid: 125 },
    });

    const result = await runner.run(['npm run build', 'npm test']);

    expect(result.success).toBe(true);
    expect(result.buildPassed).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.steps.length).toBe(2);
    expect(mockRuntime.execute).toHaveBeenCalledTimes(2);
  });
});
