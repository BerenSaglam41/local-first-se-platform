import { Kernel } from '../../src/v2/kernel/kernel';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { createFakeClaudeSpawner, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';
import { SeOsApiService } from '../../dashboard/src/services/se_os_api';
import { DashboardState } from '../../dashboard/src/types/dashboard';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 22 — Mission Control Dashboard Suite', () => {
  const testDbPath = './se_company_m22_test.db';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  // ─── 1. Dashboard State Model Integrity ───────────────────────────

  it('should initialize complete DashboardState telemetry matching SE-OS backend models', () => {
    const state: DashboardState = SeOsApiService.fetchDashboardState();

    expect(state.projectId).toBeDefined();
    expect(state.businessGoal).toContain('REST API');
    expect(state.tasks.length).toBe(6);
    expect(state.workers.length).toBe(3);
    expect(state.aiSessions.length).toBe(3);
    expect(state.eventStream.length).toBeGreaterThan(0);
    expect(state.fileChanges.length).toBeGreaterThan(0);
    expect(state.systemConsoleLogs.length).toBeGreaterThan(0);
    expect(state.verification.qualityScore).toBe(100);
  });

  // ─── 2. AI Session Monitor Data Structure ──────────────────────────

  it('should format AI session data with streaming output and provider neutrality', () => {
    const state: DashboardState = SeOsApiService.fetchDashboardState();
    const claudeSession = state.aiSessions.find((s) => s.providerName.includes('Claude Code'));

    expect(claudeSession).toBeDefined();
    expect(claudeSession?.streamingOutput.length).toBeGreaterThan(0);
    expect(claudeSession?.tokenUsage).toBeGreaterThan(0);
    expect(claudeSession?.status).toBe('STREAMING');
  });

  // ─── 3. Dashboard Web Files Structure ──────────────────────────────

  it('should maintain dashboard HTML, Vite config, and package.json files', () => {
    expect(fs.existsSync('./dashboard/package.json')).toBe(true);
    expect(fs.existsSync('./dashboard/vite.config.ts')).toBe(true);
    expect(fs.existsSync('./dashboard/index.html')).toBe(true);
    expect(fs.existsSync('./dashboard/src/App.tsx')).toBe(true);
  });

  // ─── 4. CLI Integration ──────────────────────────────────────────

  it('should execute CLI dashboard subcommand cleanly', async () => {
    const cli = new SeOsCli(createSafeTestProviderOverrides());
    await cli.boot('./non_existent_config.json');

    await cli.dashboardLaunch();

    await cli.shutdown();
  });
});
