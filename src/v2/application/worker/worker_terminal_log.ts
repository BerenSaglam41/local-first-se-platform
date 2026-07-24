import * as fs from 'fs';
import * as path from 'path';

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

  append(workerId: string, text: string): void {
    if (!text) return;
    fs.appendFileSync(this.getLogPath(workerId), text, 'utf8');
  }

  writeLine(workerId: string, line: string): void {
    this.append(workerId, `${line}\n`);
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
}
