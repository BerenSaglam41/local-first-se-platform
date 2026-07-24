import { Kernel } from '../../src/v2/kernel/kernel';
import { TelemetryAggregator } from '../../src/v2/application/telemetry/telemetry_aggregator';
import { ScreenManager } from '../../src/v2/ui/tui/managers/screen_manager';
import { LayoutManager } from '../../src/v2/ui/tui/managers/layout_manager';
import { IPanel } from '../../src/v2/ui/tui/contracts/ipanel';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 23 — Core TUI Framework & Telemetry Layer Suite', () => {
  const testDbPath = './se_company_m23_test.db';
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

  // ─── 1. TelemetryAggregator & Read-only TelemetrySnapshot ─────────────

  it('should initialize TelemetryAggregator and generate comprehensive TelemetrySnapshot', async () => {
    await kernel.boot('./non_existent_config.json');
    const aggregator = kernel.getTelemetryAggregator();

    const snapshot = aggregator.getSnapshot();
    expect(snapshot.metrics.kernelStatus).toBe('ONLINE');
    expect(snapshot.runtimeProviders.length).toBeGreaterThan(0);
    expect(snapshot.workers.length).toBeGreaterThan(0);
    expect(snapshot.aiSessions.length).toBeGreaterThan(0);
    expect(snapshot.systemConsoleLogs.length).toBeGreaterThan(0);

    aggregator.setActiveRuntimeProvider('ollama-local');
    const updated = aggregator.getSnapshot();
    expect(updated.activeRuntimeProviderId).toBe('ollama-local');
  });

  // ─── 2. ScreenManager Transitions ─────────────────────────────────

  it('should manage screen state transitions cleanly via ScreenManager', () => {
    const screenManager = new ScreenManager();
    expect(screenManager.getCurrentScreen()).toBe('STARTUP');

    screenManager.navigateTo('RUNTIME_SELECTION');
    expect(screenManager.getCurrentScreen()).toBe('RUNTIME_SELECTION');

    screenManager.navigateTo('MAIN_MENU');
    expect(screenManager.getCurrentScreen()).toBe('MAIN_MENU');

    screenManager.goBack();
    expect(screenManager.getCurrentScreen()).toBe('RUNTIME_SELECTION');
  });

  // ─── 3. LayoutManager Responsiveness ──────────────────────────────

  it('should track terminal dimensions in LayoutManager', () => {
    const layout = new LayoutManager();
    const dims = layout.getDimensions();

    expect(dims.columns).toBeGreaterThan(0);
    expect(dims.rows).toBeGreaterThan(0);

    layout.updateDimensions(160, 50);
    expect(layout.getDimensions()).toEqual({ columns: 160, rows: 50 });
  });

  // ─── 4. IPanel Contract Verification ──────────────────────────────

  it('should conform to IPanel abstraction contract', () => {
    let focusCalled = false;
    let blurCalled = false;

    const mockPanel: IPanel = {
      id: 'p-test',
      title: 'Test Panel',
      isFocused: false,
      isFullscreen: false,
      focus: () => { focusCalled = true; },
      blur: () => { blurCalled = true; },
      toggleFullscreen: () => {},
      handleInput: () => {},
    };

    mockPanel.focus();
    expect(focusCalled).toBe(true);

    mockPanel.blur();
    expect(blurCalled).toBe(true);
  });

  // ─── 5. CLI TUI Launcher ──────────────────────────────────────────

  it('should boot Kernel and resolve TelemetryAggregator for CLI TUI launcher', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');

    const aggregator = cli['kernel'].getTelemetryAggregator();
    expect(aggregator).toBeInstanceOf(TelemetryAggregator);

    await cli.shutdown();
  });
});
