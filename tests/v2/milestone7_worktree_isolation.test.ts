import { Kernel } from '../../src/v2/kernel/kernel';
import { GitWorktreeManager } from '../../src/v2/infrastructure/workspace/git_worktree_manager';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 7 — Git Worktree Isolation Suite', () => {
  const testDbPath = './se_company_m7_test.db';
  const testWorktreesDir = './.se_worktrees_m7_test';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testWorktreesDir)) fs.rmSync(testWorktreesDir, { recursive: true, force: true });
    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testWorktreesDir)) fs.rmSync(testWorktreesDir, { recursive: true, force: true });
  });

  it('should create isolated Git worktree and dedicated branch for worker', () => {
    const manager = new GitWorktreeManager(testWorktreesDir);

    const wt = manager.createWorktree('alice', 'mission-101');

    expect(wt.workerId).toBe('alice');
    expect(wt.branchName).toBe('feature/mission-101/alice');
    expect(wt.status).toBe('ACTIVE');
    expect(fs.existsSync(wt.worktreePath)).toBe(true);
  });

  it('should support worker attach and detach lifecycle transitions', () => {
    const manager = new GitWorktreeManager(testWorktreesDir);

    const wt = manager.createWorktree('bob', 'mission-102');

    expect(manager.attachWorker(wt.worktreeId, 'bob')).toBe(true);
    expect(manager.listWorktrees()[0].status).toBe('ATTACHED');

    expect(manager.detachWorker(wt.worktreeId)).toBe(true);
    expect(manager.listWorktrees()[0].status).toBe('DETACHED');
  });

  it('should clean up worktrees and remove filesystems upon removal', () => {
    const manager = new GitWorktreeManager(testWorktreesDir);

    const wt = manager.createWorktree('charlie', 'mission-103');
    expect(fs.existsSync(wt.worktreePath)).toBe(true);

    const removed = manager.removeWorktree(wt.worktreeId);
    expect(removed).toBe(true);
    expect(fs.existsSync(wt.worktreePath)).toBe(false);
    expect(manager.listWorktrees().length).toBe(0);
  });

  it('should prepare merge metadata for completed worker branch', () => {
    const manager = new GitWorktreeManager(testWorktreesDir);

    const wt = manager.createWorktree('dave', 'mission-104');
    const metadata = manager.prepareMergeMetadata(wt.worktreeId);

    expect(metadata).toBeDefined();
    expect(metadata?.workerId).toBe('dave');
    expect(metadata?.branchName).toBe('feature/mission-104/dave');
    expect(metadata?.changedFiles).toContain('src/main.ts');
  });

  it('should execute CLI worktree list, create, destroy, attach, detach, and branches subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');
    await cli.worktreeCreate('alice', 'm99');
    const list = (cli as any).kernel.getWorkspaceEngine().getGitWorktreeManager().listWorktrees();
    const wtId = list[0].worktreeId;

    await cli.worktreeList();
    await cli.branches();
    await cli.worktreeAttach(wtId, 'alice');
    await cli.worktreeDetach(wtId);
    await cli.worktreeDestroy(wtId);
    await cli.shutdown();
  });
});
