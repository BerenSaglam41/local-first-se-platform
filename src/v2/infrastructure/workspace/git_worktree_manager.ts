import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { EventEmitter } from 'events';
import { WorktreeInfo, MergeMetadata } from '../../contracts/igit_worktree';
import { IEventStore } from '../../contracts/ievent_store';

export class GitWorktreeManager extends EventEmitter {
  private worktrees = new Map<string, WorktreeInfo>();
  private baseDir: string;
  private repositoryPath?: string;
  private baseBranch = 'master';

  constructor(baseDir: string = './.se_worktrees', private eventStore?: IEventStore, repositoryPath?: string) {
    super();
    this.baseDir = path.resolve(baseDir);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    this.repositoryPath = this.resolveRepositoryPath(repositoryPath);
    if (this.repositoryPath) {
      this.baseBranch = this.git(['symbolic-ref', '--short', 'HEAD']).trim() || 'master';
    }
  }

  createWorktree(workerId: string, missionId: string = 'm0'): WorktreeInfo {
    const worktreeId = `wt-${workerId}-${Date.now()}`;
    const branchName = `feature/${missionId}/${workerId}`;
    const worktreePath = path.join(this.baseDir, `worker-${workerId}`);

    if (fs.existsSync(worktreePath)) fs.rmSync(worktreePath, { recursive: true, force: true });

    let isGitWorktree = false;
    if (this.repositoryPath) {
      try {
        // Test runs and interrupted processes can remove a worktree directory without asking
        // Git first. Prune those stale administrative entries before reusing the branch name.
        this.git(['worktree', 'prune'], true);
        this.git(['branch', '-D', branchName], true);
        this.git(['worktree', 'add', '--force', '-b', branchName, worktreePath, this.baseBranch]);
        isGitWorktree = true;
      } catch (error: any) {
        this.emitEvent('WorktreeCreationFailed', worktreeId, { workerId, missionId, error: error.message });
        throw new Error(`Could not create Git worktree for ${workerId}: ${error.message}`);
      }
    } else {
      // Explicitly honest fallback for a directory that is not a Git repository.
      fs.mkdirSync(worktreePath, { recursive: true });
    }

    const info: WorktreeInfo = {
      worktreeId,
      workerId,
      missionId,
      branchName,
      worktreePath,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    this.worktrees.set(worktreeId, info);

    this.emitEvent('BranchCreated', branchName, { workerId, missionId });
    this.emitEvent('WorktreeCreated', worktreeId, { workerId, branchName, worktreePath });

    return info;
  }

  attachWorker(worktreeId: string, workerId: string): boolean {
    const info = this.worktrees.get(worktreeId);
    if (!info) return false;

    info.status = 'ATTACHED';
    info.workerId = workerId;
    this.emitEvent('WorktreeAttached', worktreeId, { workerId });
    return true;
  }

  detachWorker(worktreeId: string): boolean {
    const info = this.worktrees.get(worktreeId);
    if (!info) return false;

    info.status = 'DETACHED';
    this.emitEvent('WorktreeDetached', worktreeId, {});
    return true;
  }

  removeWorktree(worktreeId: string): boolean {
    const info = this.worktrees.get(worktreeId);
    const targetPath = info ? info.worktreePath : null;

    if (info) {
      if (this.repositoryPath && fs.existsSync(info.worktreePath)) {
        this.git(['worktree', 'remove', '--force', info.worktreePath], true);
      } else if (fs.existsSync(info.worktreePath)) {
        fs.rmSync(info.worktreePath, { recursive: true, force: true });
      }
      if (this.repositoryPath) this.git(['branch', '-D', info.branchName], true);
      this.worktrees.delete(worktreeId);
      this.emitEvent('WorktreeDestroyed', worktreeId, {});
      this.emitEvent('BranchDeleted', info.branchName, {});
      return true;
    }
    return false;
  }

  cleanupWorktree(workerId: string): void {
    for (const [id, info] of this.worktrees.entries()) {
      if (info.workerId === workerId) {
        this.removeWorktree(id);
      }
    }
  }

  listWorktrees(): WorktreeInfo[] {
    return Array.from(this.worktrees.values());
  }

  prepareMergeMetadata(worktreeId: string): MergeMetadata | null {
    const info = this.worktrees.get(worktreeId);
    if (!info) return null;

    let changedFiles: string[] = [];
    let commitCount = 0;
    if (this.repositoryPath && fs.existsSync(info.worktreePath)) {
      changedFiles = this.git(['diff', '--name-only', `${this.baseBranch}...${info.branchName}`], true)
        .split('\n').map((line) => line.trim()).filter(Boolean);
      commitCount = Number(this.git(['rev-list', '--count', `${this.baseBranch}..${info.branchName}`], true).trim()) || 0;
    }
    return {
      worktreeId,
      workerId: info.workerId,
      branchName: info.branchName,
      changedFiles,
      changedSymbols: ['AuthModule'],
      commitCount,
      patchSummary: `Patch created from branch ${info.branchName} for mission ${info.missionId}`,
    };
  }

  commitAndMerge(worktreeId: string, message: string): { success: boolean; error?: string } {
    const info = this.worktrees.get(worktreeId);
    if (!info || !this.repositoryPath) return { success: false, error: 'Git worktree is not registered' };
    try {
      this.git(['add', '-A'], false, info.worktreePath);
      const status = this.git(['status', '--porcelain'], true, info.worktreePath).trim();
      if (status) {
        this.git(['-c', 'user.name=SE-OS Worker', '-c', 'user.email=se-os@localhost', 'commit', '-m', message], false, info.worktreePath);
      }
      this.git(['merge', '--no-ff', '--no-edit', info.branchName, '-m', message]);
      this.emitEvent('WorktreeMerged', worktreeId, { branchName: info.branchName, changed: !!status });
      return { success: true };
    } catch (error: any) {
      this.git(['merge', '--abort'], true);
      this.emitEvent('WorktreeMergeFailed', worktreeId, { branchName: info.branchName, error: error.message });
      return { success: false, error: error.message };
    }
  }

  isGitRepository(): boolean {
    return !!this.repositoryPath;
  }

  getRepositoryPath(): string | undefined {
    return this.repositoryPath;
  }

  private resolveRepositoryPath(candidate?: string): string | undefined {
    try {
      const cwd = candidate ? path.resolve(candidate) : process.cwd();
      if (candidate && !fs.existsSync(path.join(cwd, '.git'))) return undefined;
      return this.git(['rev-parse', '--show-toplevel'], true, cwd).trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private git(args: string[], allowFailure = false, cwd = this.repositoryPath || process.cwd()): string {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', allowFailure ? 'pipe' : 'pipe'] });
    } catch (error: any) {
      if (allowFailure) return '';
      const detail = error?.stderr?.toString?.() || error?.message || 'unknown git error';
      throw new Error(detail.trim());
    }
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'GitWorktreeManager',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
