import { IProvider, ProviderResult } from '../../core/domain/interfaces/iprovider';
import { IProcessRuntime, IExecutionHandle } from '../../core/domain/interfaces/iprocess_runtime';

export class MockProvider implements IProvider {
  private activeHandle?: IExecutionHandle;

  constructor(private runtime: IProcessRuntime) {}

  providerName(): string {
    return 'mock';
  }

  async execute(prompt: string): Promise<ProviderResult> {
    return this.stream(prompt, () => {});
  }

  async stream(prompt: string, onChunk: (chunk: string) => void): Promise<ProviderResult> {
    // Escape backticks within the template literal to avoid premature termination of the string literal
    const mockProviderScript = `
      process.stdin.on('data', (data) => {
        const promptText = data.toString().trim();
        console.log('\\n[Mock Provider stdout] Received context slice. Generating response...');
        console.log('[Mock Provider stdout] RESPONSE:');
        if (promptText.includes('conversational')) {
          console.log('I see the contents of math_helper.ts, but there is no specific instruction — what would you like me to do with it?');
        } else if (promptText.includes('retry-simulation')) {
          if (promptText.includes('self-repair')) {
            console.log('Here is the corrected refactored code:');
            console.log('\`\`\`typescript');
            console.log('export class MathHelper {');
            console.log('  add(a: number, b: number): number {');
            console.log('    return a + b;');
            console.log('  }');
            console.log('}');
            console.log('\`\`\`');
          } else {
            console.log('Here is the refactored math helper file:');
            console.log('\`\`\`typescript');
            console.log('export class MathHelper {');
            console.log('  add(a: number, b: number): number {');
            console.log('    return a +');
            console.log('\`\`\`');
          }
        } else {
          console.log('Here is the refactored math helper file:');
          console.log('\`\`\`typescript');
          console.log('export class MathHelper {');
          console.log('  add(a: number, b: number): number {');
          console.log('    console.log(\\'Adding: \\' + a + \\' and \\' + b);');
          console.log('    return a + b;');
          console.log('  }');
          console.log('}');
          console.log('\`\`\`');
        }
        process.exit(0);
      });
    `;

    const handle = this.runtime.execute({
      executable: process.execPath,
      args: ['-e', mockProviderScript],
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

    // Brief deferral to ensure process is spawned before writing to stdin
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      await handle.write(prompt);
    } catch (e) {
      // Handle write failure if process exits instantly
    }

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
