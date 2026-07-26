import { CollaborationMessage } from './icollaboration';

export interface WorkforceProjectRecord {
  projectId: string;
  goal: string;
  status: string;
  workspacePath?: string;
  updatedAt: string;
}

export interface WorkforceTaskRecord {
  taskId: string;
  projectId?: string;
  missionId: string;
  workerId?: string;
  status: string;
  title: string;
  updatedAt: string;
}

export interface WorkforceRepository {
  upsertProject(record: WorkforceProjectRecord): Promise<void>;
  upsertTask(record: WorkforceTaskRecord): Promise<void>;
  recordMessage(message: CollaborationMessage): Promise<void>;
  listMessages(recipientId?: string, limit?: number): Promise<CollaborationMessage[]>;
  close(): Promise<void>;
}
