import { IProvider, ProviderResult } from '../../core/domain/interfaces/iprovider';
import { IProcessRuntime, IExecutionHandle } from '../../core/domain/interfaces/iprocess_runtime';

export class ClaudeProvider implements IProvider {
  private activeHandle?: IExecutionHandle;
  private executablePath: string = 'claude';

  constructor(private runtime: IProcessRuntime, executable?: string) {
    if (executable) {
      this.executablePath = executable;
    }
  }

  providerName(): string {
    return 'claude';
  }

  async execute(prompt: string): Promise<ProviderResult> {
    return this.stream(prompt, () => {});
  }

  async stream(prompt: string, onChunk: (chunk: string) => void): Promise<ProviderResult> {
    const handle = this.runtime.execute({
      executable: this.executablePath,
      args: ['-p', prompt, '--tools', ''],
    });
    this.activeHandle = handle;

    let output = '';
    handle.on('stdout', (chunk) => {
      output += chunk;
      onChunk(chunk);
    });

    let errorOutput = '';
    handle.on('stderr', (chunk) => {
      errorOutput += chunk;
    });

    const result = await handle.wait();
    this.activeHandle = undefined;

    return {
      success: result.exitCode === 0,
      output: output.trim(),
      error: errorOutput ? errorOutput.trim() : undefined,
      exitCode: result.exitCode,
      durationMs: result.metrics.durationMs || 0,
    };
  }

  cancel(): void {
    if (this.activeHandle) {
      this.activeHandle.kill('SIGKILL');
      this.activeHandle = undefined;
    }
  }
}
