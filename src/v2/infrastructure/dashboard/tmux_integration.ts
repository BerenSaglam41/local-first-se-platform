import { spawnSync } from 'child_process';
import * as fs from 'fs';
import { WorkerTerminalLog } from '../../application/worker/worker_terminal_log';

export interface TmuxPaneConfig {
  paneIndex: number;
  title: string;
  /** When set, the pane tails this worker's real terminal log file. */
  workerId?: string;
}

/**
 * Real tmux integration: creates an actual detached tmux session and one real window per worker,
 * each tailing that worker's real terminal log (WorkerTerminalLog) — `tmux attach` shows genuine
 * process output, not a fabricated pane. All commands use spawnSync with an argument array (never
 * shell-interpolated strings) so paths/titles containing spaces or special characters can't break
 * or inject into the command.
 */
export class TmuxIntegration {
  private sessionName: string;
  private panes = new Map<number, TmuxPaneConfig>();
  private terminalLog: WorkerTerminalLog;

  constructor(sessionName: string = 'se-os-company', terminalLog?: WorkerTerminalLog) {
    this.sessionName = sessionName;
    this.terminalLog = terminalLog || new WorkerTerminalLog();
  }

  isAvailable(): boolean {
    const res = spawnSync('tmux', ['-V'], { stdio: 'ignore' });
    return res.status === 0;
  }

  private hasSession(): boolean {
    const res = spawnSync('tmux', ['has-session', '-t', this.sessionName], { stdio: 'ignore' });
    return res.status === 0;
  }

  /** Creates the tmux session if it doesn't already exist. Returns false (never throws) if tmux
   * isn't installed — callers can fall back to the in-TUI terminal view. */
  ensureSession(): boolean {
    if (!this.isAvailable()) return false;
    if (this.hasSession()) return true;
    const res = spawnSync('tmux', ['new-session', '-d', '-s', this.sessionName, '-n', 'control']);
    return res.status === 0;
  }

  createLayout(paneConfigs: TmuxPaneConfig[]): boolean {
    if (!this.ensureSession()) return false;

    for (const config of paneConfigs) {
      this.panes.set(config.paneIndex, config);
      if (!config.workerId) continue;

      const logPath = this.terminalLog.getLogPath(config.workerId);
      if (!fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, '');
      }
      // A window per worker, each just tailing that worker's real log file in real time.
      spawnSync('tmux', ['new-window', '-t', this.sessionName, '-n', config.title, 'tail', '-f', '-n', '+1', logPath]);
    }
    return true;
  }

  /** Sends real keystrokes into a worker's pane (e.g. a note or an interactive command). */
  writePane(paneIndex: number, text: string): boolean {
    const pane = this.panes.get(paneIndex);
    if (!pane) return false;
    const res = spawnSync('tmux', ['send-keys', '-t', `${this.sessionName}:${pane.title}`, text, 'Enter']);
    return res.status === 0;
  }

  clearPane(paneIndex: number): boolean {
    const pane = this.panes.get(paneIndex);
    if (!pane) return false;
    const res = spawnSync('tmux', ['send-keys', '-t', `${this.sessionName}:${pane.title}`, 'clear', 'Enter']);
    return res.status === 0;
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
