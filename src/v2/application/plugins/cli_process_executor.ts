import { ChildProcess } from 'child_process';

/** Injectable so callers (and tests) can replace the real OS process spawn with a fake one. */
export type CliProcessSpawner = (executable: string, args: string[]) => ChildProcess;

export interface CliProcessResult {
  success: boolean;
  output: string;
  errorOutput: string;
  exitCode: number | null;
  durationMs: number;
}

/**
 * Spawns a real OS process and captures its real stdout/stderr/exit code with a timeout.
 * Shared by every CLI-backed runtime plugin (Claude, Codex, Gemini, ...) so each one doesn't
 * reimplement process lifecycle handling.
 */
export function runCliProcess(
  spawner: CliProcessSpawner,
  executable: string,
  args: string[],
  timeoutMs: number,
  onChunk?: (stream: 'stdout' | 'stderr', chunk: string) => void,
  /** Fired synchronously right after spawn with the real child handle, so a caller (e.g. a
   * plugin's cancel()) can later kill this exact in-flight process — not just a session-level
   * abstraction that never touches the real OS process. */
  onSpawn?: (child: ChildProcess) => void
): Promise<CliProcessResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    let child: ChildProcess;
    try {
      child = spawner(executable, args);
      onSpawn?.(child);
    } catch (err) {
      reject(err);
      return;
    }

    let output = '';
    let errorOutput = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({
        success: false,
        output,
        errorOutput: errorOutput || `Process timed out after ${timeoutMs}ms`,
        exitCode: null,
        durationMs: Date.now() - startTime,
      });
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      output += text;
      onChunk?.('stdout', text);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      errorOutput += text;
      onChunk?.('stderr', text);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: code === 0,
        output: output.trim(),
        errorOutput: errorOutput.trim(),
        exitCode: code,
        durationMs: Date.now() - startTime,
      });
    });
  });
}
