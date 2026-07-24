import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ExecutionPlan, ExecutionArtifact } from '../../contracts/iautonomous_worker';
import { IEventStore } from '../../contracts/ievent_store';

export interface MutationResult {
  success: boolean;
  createdFiles: string[];
  modifiedFiles: string[];
  artifacts: ExecutionArtifact[];
  error?: string;
}

export class WorkspaceExecutionService extends EventEmitter {
  constructor(private eventStore?: IEventStore) {
    super();
  }

  applyExecutionPlan(plan: ExecutionPlan): MutationResult {
    const createdFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const artifacts: ExecutionArtifact[] = [];

    const resolvedWorkspace = path.resolve(plan.workspacePath);

    try {
      if (!fs.existsSync(resolvedWorkspace)) {
        fs.mkdirSync(resolvedWorkspace, { recursive: true });
      }

      // 1. Process files to create
      for (const item of plan.filesToCreate) {
        const fullPath = path.resolve(resolvedWorkspace, item.relativePath);

        // Security check: path traversal prevention
        if (!fullPath.startsWith(resolvedWorkspace)) {
          throw new Error(`Security Violation: Path '${item.relativePath}' escapes workspace boundary '${resolvedWorkspace}'`);
        }

        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.writeFileSync(fullPath, item.content, 'utf8');
        createdFiles.push(fullPath);

        artifacts.push({
          artifactId: `art-create-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: 'CREATED_FILE',
          path: fullPath,
          content: item.content,
          sizeBytes: Buffer.byteLength(item.content, 'utf8'),
          createdAt: new Date().toISOString(),
        });
      }

      // 2. Process files to modify
      for (const item of plan.filesToModify) {
        const fullPath = path.resolve(resolvedWorkspace, item.relativePath);

        if (!fullPath.startsWith(resolvedWorkspace)) {
          throw new Error(`Security Violation: Path '${item.relativePath}' escapes workspace boundary '${resolvedWorkspace}'`);
        }

        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.writeFileSync(fullPath, item.content, 'utf8');
        modifiedFiles.push(fullPath);

        artifacts.push({
          artifactId: `art-modify-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: 'MODIFIED_FILE',
          path: fullPath,
          content: item.content,
          sizeBytes: Buffer.byteLength(item.content, 'utf8'),
          createdAt: new Date().toISOString(),
        });
      }

      this.emitEvent('WorkerWorkspaceUpdated', plan.taskId, {
        workspacePath: resolvedWorkspace,
        createdCount: createdFiles.length,
        modifiedCount: modifiedFiles.length,
      });

      return {
        success: true,
        createdFiles,
        modifiedFiles,
        artifacts,
      };
    } catch (err: any) {
      return {
        success: false,
        createdFiles,
        modifiedFiles,
        artifacts,
        error: err.message || 'Workspace execution failed',
      };
    }
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'WorkspaceExecutionService',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
