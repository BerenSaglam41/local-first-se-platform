import { spawn } from 'child_process';
import * as fs from 'fs';
import { WorkerTerminalLog } from '../../application/worker/worker_terminal_log';

export interface TmuxPaneConfig {
  paneIndex: number;
  title: string;
  /** When set, the pane tails this worker's real terminal log file. */
  workerId?: string;
}

function runTmux(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('tmux', args, { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Real tmux integration: creates an actual detached tmux session and one real window per worker,
 * each tailing that worker's real terminal log (WorkerTerminalLog) — `tmux attach` shows genuine
 * process output, not a fabricated pane. All commands use spawn with an argument array (never
 * shell-interpolated strings) so paths/titles containing spaces or special characters can't break
 * or inject into the command.
 *
 * Every tmux invocation is async (`spawn`, not `spawnSync` — see ADR-0006): at the project's
 * target scale (1000+ workers), `createLayout()` runs one `tmux new-window` per worker. A
 * synchronous spawn there would freeze the entire Node.js process — including every other
 * worker's in-flight I/O — for as long as it takes tmux to create a thousand windows serially.
 * Awaiting an async spawn yields the event loop between each call instead.
 */
export class TmuxIntegration {
  private sessionName: string;
  private panes = new Map<number, TmuxPaneConfig>();
  private terminalLog: WorkerTerminalLog;

  constructor(sessionName: string = 'se-os-company', terminalLog?: WorkerTerminalLog) {
    this.sessionName = sessionName;
    this.terminalLog = terminalLog || new WorkerTerminalLog();
  }

  async isAvailable(): Promise<boolean> {
    return runTmux(['-V']);
  }

  private async hasSession(): Promise<boolean> {
    return runTmux(['has-session', '-t', this.sessionName]);
  }

  /** Creates the tmux session if it doesn't already exist. Resolves false (never throws) if tmux
   * isn't installed — callers can fall back to the in-TUI terminal view. */
  async ensureSession(): Promise<boolean> {
    if (!(await this.isAvailable())) return false;
    if (await this.hasSession()) return true;
    return runTmux(['new-session', '-d', '-s', this.sessionName, '-n', 'control']);
  }

  async createLayout(paneConfigs: TmuxPaneConfig[]): Promise<boolean> {
    if (!(await this.ensureSession())) return false;

    for (const config of paneConfigs) {
      this.panes.set(config.paneIndex, config);
      if (!config.workerId) continue;

      const logPath = this.terminalLog.getLogPath(config.workerId);
      if (!fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, '');
      }
      // A window per worker, each just tailing that worker's real log file in real time.
      await runTmux(['new-window', '-t', this.sessionName, '-n', config.title, 'tail', '-f', '-n', '+1', logPath]);
    }
    return true;
  }

  /** Sends real keystrokes into a worker's pane (e.g. a note or an interactive command). */
  async writePane(paneIndex: number, text: string): Promise<boolean> {
    const pane = this.panes.get(paneIndex);
    if (!pane) return false;
    return runTmux(['send-keys', '-t', `${this.sessionName}:${pane.title}`, text, 'Enter']);
  }

  async clearPane(paneIndex: number): Promise<boolean> {
    const pane = this.panes.get(paneIndex);
    if (!pane) return false;
    return runTmux(['send-keys', '-t', `${this.sessionName}:${pane.title}`, 'clear', 'Enter']);
  }

  /** The real command a user can run to watch every worker live. */
  attachCommand(): string {
    return `tmux attach -t ${this.sessionName}`;
  }

  getSessionName(): string {
    return this.sessionName;
  }

  getPanes(): TmuxPaneConfig[] {
    return Array.from(this.panes.values());
  }
}
