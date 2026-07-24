import * as fs from 'fs';
import * as path from 'path';

/** Once a worker's real log passes this size, it rotates to a single `.1` backup rather than
 * growing forever — see ADR-0007. Bounds each worker's on-disk footprint to ~2x this size for the
 * project's target scale (1000+ workers, months-long sessions). */
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Real, append-only, per-worker terminal output. This is the single backing store for both the
 * in-TUI Terminals tab and the real tmux panes (TmuxIntegration tails these same files) — one
 * real source of truth for "what did this worker's process actually print," never fabricated.
 */
export class WorkerTerminalLog {
  constructor(private baseDir: string = './.se_workspaces/logs') {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  getLogPath(workerId: string): string {
    return path.join(this.baseDir, `${workerId}.log`);
  }

  private getRotatedLogPath(workerId: string): string {
    return path.join(this.baseDir, `${workerId}.log.1`);
  }

  append(workerId: string, text: string): void {
    if (!text) return;
    const logPath = this.getLogPath(workerId);
    this.rotateIfOversized(workerId, logPath);
    fs.appendFileSync(logPath, text, 'utf8');
  }

  writeLine(workerId: string, line: string): void {
    this.append(workerId, `${line}\n`);
  }

  /** A `tail -f`'d file (real tmux panes tail these live) must never be truncated in place — that
   * would desync a follower mid-read. Rotation renames the full file out to `.1` and starts a
   * fresh one instead, exactly like standard log rotation (logrotate, etc.). */
  private rotateIfOversized(workerId: string, logPath: string): void {
    let size = 0;
    try {
      size = fs.statSync(logPath).size;
    } catch {
      return; // File doesn't exist yet — nothing to rotate.
    }
    if (size < MAX_LOG_SIZE_BYTES) return;

    const rotatedPath = this.getRotatedLogPath(workerId);
    try {
      fs.rmSync(rotatedPath, { force: true });
    } catch {
      // Ignore — best-effort cleanup of the previous backup.
    }
    fs.renameSync(logPath, rotatedPath);
  }

  readTail(workerId: string, maxLines: number = 200): string[] {
    const logPath = this.getLogPath(workerId);
    if (!fs.existsSync(logPath)) return [];
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.length > 0);
    return lines.slice(-maxLines);
  }

  clear(workerId: string): void {
    fs.writeFileSync(this.getLogPath(workerId), '', 'utf8');
  }

  /** Permanently deletes a worker's real log files (both the active log and any rotated backup).
   * Called only on genuine worker removal (see ADR-0007) — never on a restart, which reuses the
   * same worker id and must keep its real history intact. */
  remove(workerId: string): void {
    for (const logPath of [this.getLogPath(workerId), this.getRotatedLogPath(workerId)]) {
      try {
        fs.rmSync(logPath, { force: true });
      } catch {
        // Best-effort: a log that was never created has nothing to remove.
      }
    }
  }
}
