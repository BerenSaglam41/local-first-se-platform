import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { killProcessGroup, defaultCliProcessSpawner } from '../../../src/v2/application/plugins/cli_process_executor';
import { CliRuntimePlugin } from '../../../src/v2/application/plugins/cli_runtime_plugin';
import { FakeCliDetector } from '../helpers/fake_claude_process';

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Mirrors the real UAT finding exactly: `codex`'s own CLI entry point is a Node wrapper that
 * forks the real native binary as a grandchild. This script reproduces that shape — a parent
 * process that forks a grandchild which does the real, observable work (writing heartbeats),
 * while the parent just stays alive coordinating it. */
function grandchildScript(heartbeatPath: string): string {
  return `
    const { spawn } = require('child_process');
    const grandchild = spawn(process.execPath, ['-e', \`
      const fs = require('fs');
      setInterval(() => { fs.appendFileSync(${JSON.stringify(heartbeatPath)}, 'x'); }, 50);
    \`]);
    setInterval(() => {}, 1000); // keep the parent alive, doing nothing itself
  `;
}

describe('SE-OS v2.0 M29.1 Fix #2 — real process-group kill (interrupt kills real descendants)', () => {
  let heartbeatPath: string;

  beforeEach(() => {
    heartbeatPath = path.join(os.tmpdir(), `se-os-heartbeat-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(heartbeatPath, '');
  });

  afterEach(() => {
    if (fs.existsSync(heartbeatPath)) fs.rmSync(heartbeatPath, { force: true });
  });

  it('killProcessGroup should really kill a grandchild process a wrapper forked, not just the direct child', async () => {
    const child = defaultCliProcessSpawner(process.execPath, ['-e', grandchildScript(heartbeatPath)]);
    expect(child.pid).toBeDefined();

    // Wait for real, observable proof the grandchild is genuinely running.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const sizeBeforeKill = fs.statSync(heartbeatPath).size;
    expect(sizeBeforeKill).toBeGreaterThan(0);

    killProcessGroup(child, 'SIGKILL');

    // Give the OS a moment to actually tear the processes down.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const sizeRightAfterKill = fs.statSync(heartbeatPath).size;

    // If the grandchild were still alive, it would have appended more heartbeats by now.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const sizeLater = fs.statSync(heartbeatPath).size;

    expect(sizeLater).toBe(sizeRightAfterKill);
    expect(isPidAlive(child.pid!)).toBe(false);
  }, 10000);

  it('a plain child.kill() on the direct process (the pre-fix behavior) would leave the grandchild running — proving the bug was real', async () => {
    // Spawned WITHOUT detached:true, reproducing the exact pre-fix behavior, to prove this is a
    // real, reproducible bug and not a hypothetical one.
    const child = spawn(process.execPath, ['-e', grandchildScript(heartbeatPath)]);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const sizeBeforeKill = fs.statSync(heartbeatPath).size;
    expect(sizeBeforeKill).toBeGreaterThan(0);

    child.kill('SIGKILL'); // the old, insufficient behavior

    await new Promise((resolve) => setTimeout(resolve, 300));
    const sizeRightAfterKill = fs.statSync(heartbeatPath).size;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const sizeLater = fs.statSync(heartbeatPath).size;

    // The grandchild really does keep writing — this is the bug the fix closes.
    expect(sizeLater).toBeGreaterThan(sizeRightAfterKill);

    // Manual cleanup since this test deliberately doesn't use the real fix.
    killProcessGroup(child, 'SIGKILL');
  }, 10000);

  it('CliRuntimePlugin.cancel() should really kill a real spawned process end-to-end', async () => {
    const plugin = new CliRuntimePlugin(
      {
        id: 'plugin-test-real-cancel',
        name: 'Test Real Cancel',
        command: process.execPath,
        buildArgs: (p) => ['-e', p],
      },
      undefined,
      (executable, args) => defaultCliProcessSpawner(executable, args),
      new FakeCliDetector({ available: true, executablePath: process.execPath, version: 'test' })
    );
    await plugin.initialize();

    const pending = plugin.execute({
      prompt: grandchildScript(heartbeatPath),
      workerId: 'emp-real-cancel-test',
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fs.statSync(heartbeatPath).size).toBeGreaterThan(0);

    const cancelled = await plugin.cancel('emp-real-cancel-test');
    expect(cancelled).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const sizeRightAfterCancel = fs.statSync(heartbeatPath).size;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fs.statSync(heartbeatPath).size).toBe(sizeRightAfterCancel);

    await plugin.shutdown();
  }, 10000);
});
