import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { WorkspaceInfo } from '../../contracts/icontext_package';
import { IEventStore } from '../../contracts/ievent_store';
import { GitWorktreeManager } from '../../infrastructure/workspace/git_worktree_manager';
import { WorktreeInfo } from '../../contracts/igit_worktree';
import { execFileSync } from 'child_process';

export class WorkspaceEngine extends EventEmitter {
  private activeWorkspaces = new Map<string, WorkspaceInfo>();
  private gitWorktreeManager: GitWorktreeManager;
  private projectGitManagers = new Map<string, GitWorktreeManager>();
  private baseDir: string;

  constructor(baseDir: string = './.se_workspaces', private eventStore?: IEventStore) {
    super();
    this.baseDir = path.resolve(baseDir);
    this.gitWorktreeManager = new GitWorktreeManager(path.join(this.baseDir, 'worktrees'), eventStore);
  }

  createWorkspace(taskId: string): WorkspaceInfo {
    const workspaceId = `ws-${taskId}-${Date.now()}`;
    const isolatedPath = path.join(this.baseDir, workspaceId);

    if (!fs.existsSync(isolatedPath)) {
      fs.mkdirSync(isolatedPath, { recursive: true });
    }

    const info: WorkspaceInfo = {
      workspaceId,
      taskId,
      isolatedPath,
      createdAt: new Date().toISOString(),
    };

    this.activeWorkspaces.set(workspaceId, info);
    this.emitEvent('WorkspaceCreated', workspaceId, { taskId, isolatedPath });
    return info;
  }

  /** Create one shared staging workspace for a whole project, seeded from its target folder. */
  createProjectWorkspace(projectId: string, targetPath?: string): WorkspaceInfo {
    const workspaceId = `project-${projectId}`;
    const isolatedPath = path.join(this.baseDir, workspaceId);
    fs.mkdirSync(isolatedPath, { recursive: true });
    if (targetPath && fs.existsSync(targetPath)) {
      this.copyTree(targetPath, isolatedPath, true);
    }
    this.ensureGitRepository(isolatedPath);
    const info: WorkspaceInfo = {
      workspaceId,
      taskId: projectId,
      isolatedPath,
      createdAt: new Date().toISOString(),
    };
    this.activeWorkspaces.set(workspaceId, info);
    this.emitEvent('WorkspaceCreated', workspaceId, { projectId, targetPath, isolatedPath, shared: true });
    return info;
  }

  createTaskWorktree(projectWorkspacePath: string, workerId: string, missionId: string): WorktreeInfo | undefined {
    if (!this.isGitRepository(projectWorkspacePath)) return undefined;
    return this.getProjectGitManager(projectWorkspacePath).createWorktree(workerId, missionId);
  }

  commitAndMergeTaskWorktree(projectWorkspacePath: string, worktreeId: string, message: string): { success: boolean; error?: string } {
    return this.getProjectGitManager(projectWorkspacePath).commitAndMerge(worktreeId, message);
  }

  removeTaskWorktree(projectWorkspacePath: string, worktreeId: string): boolean {
    return this.getProjectGitManager(projectWorkspacePath).removeWorktree(worktreeId);
  }

  isGitRepository(repositoryPath: string): boolean {
    try {
      // Do not accept a parent repository. Project staging must own its own Git metadata;
      // otherwise worktrees could accidentally be created from the SE-OS source checkout.
      if (!fs.existsSync(path.join(repositoryPath, '.git'))) return false;
      const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repositoryPath, encoding: 'utf8' }).trim();
      return path.resolve(root) === path.resolve(repositoryPath);
    } catch {
      return false;
    }
  }

  /** Copy generated/modified project files back without deleting unrelated target files. */
  syncProjectWorkspace(workspacePath: string, targetPath: string): void {
    fs.mkdirSync(targetPath, { recursive: true });
    this.copyTree(workspacePath, targetPath, false);
  }

  private copyTree(source: string, destination: string, skipProjectMetadata: boolean): void {
    if (!fs.existsSync(source)) return;
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (['.git', 'node_modules', '.se_workspaces', '.se-worktrees', 'dist', 'se_company.db', 'se_company.db-shm', 'se_company.db-wal'].includes(entry.name)) continue;
      const sourcePath = path.join(source, entry.name);
      const destinationPath = path.join(destination, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destinationPath, { recursive: true });
        this.copyTree(sourcePath, destinationPath, skipProjectMetadata);
      } else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        fs.copyFileSync(sourcePath, destinationPath);
      }
    }
  }

  private ensureGitRepository(repositoryPath: string): void {
    if (this.isGitRepository(repositoryPath)) return;
    try {
      execFileSync('git', ['init', '-q'], { cwd: repositoryPath, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.name', 'SE-OS Project'], { cwd: repositoryPath, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'se-os@localhost'], { cwd: repositoryPath, stdio: 'ignore' });
      execFileSync('git', ['add', '-A'], { cwd: repositoryPath, stdio: 'ignore' });
      execFileSync('git', ['commit', '--allow-empty', '-m', 'SE-OS project baseline'], { cwd: repositoryPath, stdio: 'ignore' });
    } catch (error: any) {
      throw new Error(`Could not initialize project Git repository: ${error.message}`);
    }
  }

  private getProjectGitManager(projectWorkspacePath: string): GitWorktreeManager {
    const existing = this.projectGitManagers.get(projectWorkspacePath);
    if (existing) return existing;
    const manager = new GitWorktreeManager(path.join(projectWorkspacePath, '.se-worktrees'), this.eventStore, projectWorkspacePath);
    this.projectGitManagers.set(projectWorkspacePath, manager);
    return manager;
  }

  destroyWorkspace(workspaceId: string): boolean {
    const info = this.activeWorkspaces.get(workspaceId);
    if (!info) return false;

    if (fs.existsSync(info.isolatedPath)) {
      fs.rmSync(info.isolatedPath, { recursive: true, force: true });
    }

    this.activeWorkspaces.delete(workspaceId);
    this.emitEvent('WorkspaceDestroyed', workspaceId, {});
    return true;
  }

  getGitWorktreeManager(): GitWorktreeManager {
    return this.gitWorktreeManager;
  }

  getWorkspace(workspaceId: string): WorkspaceInfo | undefined {
    return this.activeWorkspaces.get(workspaceId);
  }

  listWorkspaces(): WorkspaceInfo[] {
    return Array.from(this.activeWorkspaces.values());
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'WorkspaceEngine',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
