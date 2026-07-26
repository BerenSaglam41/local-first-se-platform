import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { WorkspaceInfo } from '../../contracts/icontext_package';
import { IEventStore } from '../../contracts/ievent_store';
import { GitWorktreeManager } from '../../infrastructure/workspace/git_worktree_manager';
import { WorktreeInfo } from '../../contracts/igit_worktree';

export class WorkspaceEngine extends EventEmitter {
  private activeWorkspaces = new Map<string, WorkspaceInfo>();
  private gitWorktreeManager: GitWorktreeManager;
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

  /** Copy generated/modified project files back without deleting unrelated target files. */
  syncProjectWorkspace(workspacePath: string, targetPath: string): void {
    fs.mkdirSync(targetPath, { recursive: true });
    this.copyTree(workspacePath, targetPath, false);
  }

  private copyTree(source: string, destination: string, skipProjectMetadata: boolean): void {
    if (!fs.existsSync(source)) return;
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (['.git', 'node_modules', '.se_workspaces', 'dist', 'se_company.db', 'se_company.db-shm', 'se_company.db-wal'].includes(entry.name)) continue;
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
