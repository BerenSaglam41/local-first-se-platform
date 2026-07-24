import { IProcessRuntime } from '../../domain/interfaces/iprocess_runtime';

export interface VerificationStepResult {
  command: string;
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface VerificationRunnerResult {
  success: boolean;
  steps: VerificationStepResult[];
  logs: string;
  buildPassed: boolean;
  testsPassed: boolean;
  durationMs: number;
}

export class VerificationRunner {
  constructor(private runtime: IProcessRuntime) {}

  async run(commands: string[], onStream?: (chunk: string, type: 'stdout' | 'stderr') => void): Promise<VerificationRunnerResult> {
    const startTime = Date.now();
    const steps: VerificationStepResult[] = [];
    let overallSuccess = true;
    let logs = '';
    let buildPassed = false;
    let testsPassed = false;

    for (const cmd of commands) {
      const parts = cmd.split(/\s+/).filter(Boolean);
      if (parts.length === 0) continue;

      const executable = parts[0];
      const args = parts.slice(1);

      let stdout = '';
      let stderr = '';

      const handle = this.runtime.execute({
        executable,
        args,
      });

      handle.on('stdout', (chunk) => {
        stdout += chunk;
        logs += chunk;
        onStream?.(chunk, 'stdout');
      });

      handle.on('stderr', (chunk) => {
        stderr += chunk;
        logs += chunk;
        onStream?.(chunk, 'stderr');
      });

      const result = await handle.wait();
      const stepSuccess = result.exitCode === 0;

      steps.push({
        command: cmd,
        success: stepSuccess,
        exitCode: result.exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: result.metrics.durationMs || 0,
      });

      if (cmd.includes('build')) {
        buildPassed = stepSuccess;
      }
      if (cmd.includes('test')) {
        testsPassed = stepSuccess;
      }

      if (!stepSuccess) {
        overallSuccess = false;
        break;
      }
    }

    if (!commands.some(c => c.includes('build'))) {
      buildPassed = true;
    }
    if (!commands.some(c => c.includes('test'))) {
      testsPassed = true;
    }

    return {
      success: overallSuccess,
      steps,
      logs: logs.trim(),
      buildPassed,
      testsPassed,
      durationMs: Date.now() - startTime,
    };
  }
}
