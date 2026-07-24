import { TmuxDashboard } from '../src/infrastructure/logging/tmux_dashboard';
import * as fs from 'fs';
import * as path from 'path';

describe('TmuxDashboard', () => {
  const testDir = path.join(__dirname, 'temp_dashboard_test');
  let dashboard: TmuxDashboard;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    dashboard = new TmuxDashboard(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should initialize log directory and pane log files', async () => {
    const initialized = await dashboard.initialize('se-os-unittest');
    const logDir = path.join(testDir, 'logs', 'dashboard');
    expect(fs.existsSync(logDir)).toBe(true);

    expect(fs.existsSync(path.join(logDir, 'pane1_main.log'))).toBe(true);
    expect(fs.existsSync(path.join(logDir, 'pane2_knowledge.log'))).toBe(true);
    expect(fs.existsSync(path.join(logDir, 'pane3_provider.log'))).toBe(true);
    expect(fs.existsSync(path.join(logDir, 'pane4_verification.log'))).toBe(true);
    expect(fs.existsSync(path.join(logDir, 'pane5_git.log'))).toBe(true);
  });

  it('should append logs to appropriate pane files in real time', async () => {
    await dashboard.initialize('se-os-unittest');

    dashboard.writeMain('Main Console Message');
    dashboard.writeKnowledge('Knowledge Engine Message');
    dashboard.writeProvider('Provider Chunk');
    dashboard.writeVerification('Build Output Chunk');
    dashboard.writeGit('Git Status Line');

    const mainContent = fs.readFileSync(path.join(testDir, 'logs', 'dashboard', 'pane1_main.log'), 'utf8');
    const knowledgeContent = fs.readFileSync(path.join(testDir, 'logs', 'dashboard', 'pane2_knowledge.log'), 'utf8');
    const providerContent = fs.readFileSync(path.join(testDir, 'logs', 'dashboard', 'pane3_provider.log'), 'utf8');
    const verificationContent = fs.readFileSync(path.join(testDir, 'logs', 'dashboard', 'pane4_verification.log'), 'utf8');
    const gitContent = fs.readFileSync(path.join(testDir, 'logs', 'dashboard', 'pane5_git.log'), 'utf8');

    expect(mainContent).toContain('Main Console Message');
    expect(knowledgeContent).toContain('Knowledge Engine Message');
    expect(providerContent).toContain('Provider Chunk');
    expect(verificationContent).toContain('Build Output Chunk');
    expect(gitContent).toContain('Git Status Line');
  });

  it('should format attachment banner containing session reconnect instructions', () => {
    const banner = dashboard.attachBanner('se-os');
    expect(banner).toContain('tmux attach -t se-os');
  });
});
