import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { IDashboard } from '../../core/domain/interfaces/idashboard';

export class TmuxDashboard implements IDashboard {
  private logDir: string;
  private p1Main: string;
  private p2Knowledge: string;
  private p3Provider: string;
  private p4Verification: string;
  private p5Git: string;
  private isTmuxActive: boolean = false;

  constructor(baseDir: string = process.cwd()) {
    this.logDir = path.join(baseDir, 'logs', 'dashboard');
    this.p1Main = path.join(this.logDir, 'pane1_main.log');
    this.p2Knowledge = path.join(this.logDir, 'pane2_knowledge.log');
    this.p3Provider = path.join(this.logDir, 'pane3_provider.log');
    this.p4Verification = path.join(this.logDir, 'pane4_verification.log');
    this.p5Git = path.join(this.logDir, 'pane5_git.log');
  }

  async initialize(sessionName: string = 'se-os'): Promise<boolean> {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Initialize / truncate log files for each pane
      fs.writeFileSync(this.p1Main, `====================================================\n PANE 1: SE-OS MAIN CONSOLE & PROGRESS SUMMARY\n====================================================\n\n`);
      fs.writeFileSync(this.p2Knowledge, `====================================================\n PANE 2: KNOWLEDGE ENGINE & AST CONTEXT LOGS\n====================================================\n\n`);
      fs.writeFileSync(this.p3Provider, `====================================================\n PANE 3: CLAUDE PROVIDER LIVE STREAM\n====================================================\n\n`);
      fs.writeFileSync(this.p4Verification, `====================================================\n PANE 4: VERIFICATION RUNNER LOGS (BUILD & TEST)\n====================================================\n\n`);
      fs.writeFileSync(this.p5Git, `====================================================\n PANE 5: GIT INTEGRATION & REPOSITORY STATUS\n====================================================\n\n`);

      // Check if tmux is installed
      try {
        execSync('which tmux', { stdio: 'ignore' });
      } catch {
        this.isTmuxActive = false;
        return false;
      }

      // Kill previous session if running
      try {
        execSync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);
      } catch {}

      // Create 5-pane tmux session
      execSync(`tmux new-session -d -s ${sessionName} -n "SE-OS Dashboard" "tail -f '${this.p1Main}'"`);
      execSync(`tmux split-window -h -t ${sessionName}:0.0 "tail -f '${this.p2Knowledge}'"`);
      execSync(`tmux split-window -v -t ${sessionName}:0.0 "tail -f '${this.p3Provider}'"`);
      execSync(`tmux split-window -v -t ${sessionName}:0.1 "tail -f '${this.p4Verification}'"`);
      execSync(`tmux split-window -v -t ${sessionName}:0.2 "tail -f '${this.p5Git}'"`);
      execSync(`tmux select-layout -t ${sessionName}:0 tiled`);

      // Configure pane titles
      try {
        execSync(`tmux set-option -t ${sessionName} pane-border-status top 2>/dev/null || true`);
        execSync(`tmux select-pane -t ${sessionName}:0.0 -T "Pane 1: Main Console" 2>/dev/null || true`);
        execSync(`tmux select-pane -t ${sessionName}:0.1 -T "Pane 2: Knowledge Engine" 2>/dev/null || true`);
        execSync(`tmux select-pane -t ${sessionName}:0.2 -T "Pane 3: Provider (Claude)" 2>/dev/null || true`);
        execSync(`tmux select-pane -t ${sessionName}:0.3 -T "Pane 4: Verification" 2>/dev/null || true`);
        execSync(`tmux select-pane -t ${sessionName}:0.4 -T "Pane 5: Git" 2>/dev/null || true`);
      } catch {}

      this.isTmuxActive = true;
      return true;
    } catch (err) {
      this.isTmuxActive = false;
      return false;
    }
  }

  writeMain(text: string): void {
    this.appendLog(this.p1Main, text);
  }

  writeKnowledge(text: string): void {
    this.appendLog(this.p2Knowledge, text);
  }

  writeProvider(text: string): void {
    this.appendLog(this.p3Provider, text);
  }

  writeVerification(text: string): void {
    this.appendLog(this.p4Verification, text);
  }

  writeGit(text: string): void {
    this.appendLog(this.p5Git, text);
  }

  attachBanner(sessionName: string = 'se-os'): string {
    return `
====================================================
 LIVE MULTI-PANE DASHBOARD PERSISTENCE ACTIVE
====================================================
 tmux session '${sessionName}' is running in the background.
 Every pane updates in real time.
 To reconnect and inspect live outputs, stdout, and stderr:

   tmux attach -t ${sessionName}
====================================================\n`;
  }

  private appendLog(file: string, text: string): void {
    try {
      fs.appendFileSync(file, text.endsWith('\n') ? text : text + '\n');
    } catch {}
  }
}
