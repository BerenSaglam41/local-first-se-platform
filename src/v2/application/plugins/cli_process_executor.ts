import { ChildProcess, spawn as realSpawn } from 'child_process';

/** Injectable so callers (and tests) can replace the real OS process spawn with a fake one. */
export interface CliSpawnOptions {
  cwd?: string;
}

export type CliProcessSpawner = (executable: string, args: string[], options?: CliSpawnOptions) => ChildProcess;

/**
 * The real default spawner every plugin uses. `detached: true` makes the child the leader of its
 * own new OS process group instead of sharing SE-OS's — required for killProcessGroup() below to
 * be able to kill it. See ADR-0010: a real CLI's own entry point is frequently a wrapper that
 * forks the actual work as a grandchild (verified: the installed `codex` CLI is a Node launcher
 * script that spawns the real native binary as its child) — killing only the direct child left
 * that grandchild running, invisible to SE-OS, for as long as the real UAT observed it (minutes).
 */
export const defaultCliProcessSpawner: CliProcessSpawner = (executable, args, options) =>
  // stdin explicitly closed ('ignore'): SE-OS never pipes anything to a spawned CLI's stdin, but
  // leaving it open (Node's default) makes some CLIs (verified: the real `claude` CLI) print a
  // confusing "no stdin data received in 3s, proceeding without it" warning into every real
  // execution's terminal log — noise that looks like a real problem but isn't (see M29.1 Fix #3 /
  // ADR-0012). Closing it outright removes the warning at the source instead of just tolerating it.
  realSpawn(executable, args, { detached: true, cwd: options?.cwd, stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * Kills a real spawned process AND every descendant it forked, not just the single process
 * SE-OS's ChildProcess handle refers to. Requires the child to have been spawned with
 * `detached: true` (see defaultCliProcessSpawner) so it is its own process group leader — sending
 * a signal to the negative of its PID signals the whole group. Falls back to a direct kill of just
 * the one process if the child has no PID (a fake/mocked child in tests) or the group is already
 * gone.
 */
export function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals = 'SIGKILL'): void {
  if (!child.pid) {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (err: any) {
    if (err?.code !== 'ESRCH') {
      try {
        child.kill(signal);
      } catch {
        // The process is already gone one way or another — nothing left to do.
      }
    }
  }
}

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
  onSpawn?: (child: ChildProcess) => void,
  options?: CliSpawnOptions
): Promise<CliProcessResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    let child: ChildProcess;
    try {
      child = spawner(executable, args, options);
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
      killProcessGroup(child, 'SIGKILL');
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
