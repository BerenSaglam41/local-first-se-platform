import { Kernel } from '../../src/v2/kernel/kernel';
import { VerificationEngine } from '../../src/v2/application/verification/verification_engine';
import { MergeEngine } from '../../src/v2/application/verification/merge_engine';
import { MergeQueue } from '../../src/v2/application/verification/merge_queue';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { createFakeClaudeSpawner, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 9 — Verification & Merge Engine Suite', () => {
  const testDbPath = './se_company_m9_test.db';
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

  it('should run verification pipeline and evaluate quality gates', async () => {
    await kernel.boot('./non_existent_config.json');
    const engine = kernel.getVerificationEngine();

    const report = await engine.verifyTask('task-auth-01', 'wt-alice', 'emp-alice', { status: 'SUCCESS' });

    expect(report.taskId).toBe('task-auth-01');
    expect(report.passed).toBe(true);
    expect(report.qualityScore).toBe(100);
    expect(report.buildPassed).toBe(true);
  });

  it('should fail quality gates if unit tests fail', async () => {
    await kernel.boot('./non_existent_config.json');
    const engine = kernel.getVerificationEngine();

    const report = await engine.verifyTask('task-auth-02', 'wt-bob', 'emp-bob', { status: 'FAILURE' });

    expect(report.passed).toBe(false);
    expect(report.testsPassed).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.qualityScore).toBeLessThan(100);
  });

  it('should perform dry-run merge inspection and prepare merge plan', () => {
    const mergeEngine = new MergeEngine();

    const planClean = mergeEngine.prepareMergePlan('task-001', 'wt-001', 'feature/m-01/alice', 'master', []);
    expect(planClean.canMerge).toBe(true);
    expect(planClean.hasConflicts).toBe(false);

    const planConflict = mergeEngine.prepareMergePlan('task-002', 'wt-002', 'feature/m-01/bob', 'master', [
      { type: 'SYMBOL_CONFLICT', file: 'src/auth.ts', description: 'Symbol AuthToken redefined' },
    ]);
    expect(planConflict.canMerge).toBe(false);
    expect(planConflict.hasConflicts).toBe(true);
  });

  it('should manage prioritized merge candidates in MergeQueue', () => {
    const queue = new MergeQueue();

    queue.enqueue('task-low', 'wt-1', 1);
    queue.enqueue('task-high', 'wt-2', 5);

    const first = queue.dequeue();
    expect(first?.taskId).toBe('task-high');

    expect(queue.list().length).toBe(1);
    expect(queue.cancel('task-low')).toBe(true);
    expect(queue.list().length).toBe(0);
  });

  it('should execute CLI verify and merge subcommands cleanly', async () => {
    const cli = new SeOsCli(createSafeTestProviderOverrides());
    await cli.boot('./non_existent_config.json');
    await cli.verifyTask('task-100');
    await cli.verifyReport('task-100');
    await cli.mergePrepare('task-100');
    await cli.mergeQueue();
    await cli.mergeInspect('task-100');
    await cli.shutdown();
  });
});
