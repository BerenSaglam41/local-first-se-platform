import * as fs from 'fs';
import { Kernel } from '../../../src/v2/kernel/kernel';

describe('SE-OS v2.0 Milestone 29 Workstream A — Kernel shutdown & lifecycle wiring', () => {
  const testDbPath = './se_company_m29a_test.db';
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

  it('should NOT delete worker terminal logs on a clean process shutdown (regression: §1.3 conflation)', async () => {
    await kernel.boot('./non_existent_config.json');

    const terminalLog = kernel.getWorkerTerminalLog();
    const workers = kernel.getWorkerStore().list();
    expect(workers.length).toBeGreaterThan(0);

    for (const w of workers) {
      terminalLog.writeLine(w.id, 'real output written before shutdown');
    }
    const logPaths = workers.map((w) => terminalLog.getLogPath(w.id));
    for (const p of logPaths) {
      expect(fs.existsSync(p)).toBe(true);
    }

    await kernel.shutdown();

    // The whole company closing for the night must preserve every worker's real history — only
    // an explicit, individual removal (workerStop/workerKill) should ever delete a log.
    for (const p of logPaths) {
      expect(fs.existsSync(p)).toBe(true);
    }

    for (const p of logPaths) {
      fs.rmSync(p, { force: true });
    }
  });

  it('should expose a real, wired WorkerLifecyclePolicy from a booted kernel', async () => {
    await kernel.boot('./non_existent_config.json');

    const policy = kernel.getWorkerLifecyclePolicy();
    expect(policy).toBeDefined();

    const workers = kernel.getWorkerStore().list();
    const targetId = workers[0].id;
    expect(policy.isQuarantined(targetId)).toBe(false);
    expect(policy.getCrashCount(targetId)).toBe(0);
  });
});
