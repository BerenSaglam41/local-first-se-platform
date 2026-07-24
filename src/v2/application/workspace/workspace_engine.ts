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
