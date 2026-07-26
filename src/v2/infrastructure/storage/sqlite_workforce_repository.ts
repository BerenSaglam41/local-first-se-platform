import { open, Database } from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { CollaborationMessage } from '../../contracts/icollaboration';
import { WorkforceProjectRecord, WorkforceRepository, WorkforceTaskRecord } from '../../contracts/iworkforce_repository';

export class SqliteWorkforceRepository implements WorkforceRepository {
  private db: Database | null = null;

  constructor(private dbPath: string) {}

  async connect(): Promise<void> {
    if (this.db) return;
    const sqlite3Mod = require('sqlite3');
    const driver = sqlite3Mod?.Database || sqlite3Mod?.default?.Database || (sqlite3 as any).Database;
    this.db = await open({ filename: this.dbPath, driver });
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS workforce_projects_v2 (
        project_id TEXT PRIMARY KEY, goal TEXT NOT NULL, status TEXT NOT NULL,
        workspace_path TEXT, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workforce_tasks_v2 (
        task_id TEXT PRIMARY KEY, project_id TEXT, mission_id TEXT NOT NULL,
        worker_id TEXT, status TEXT NOT NULL, title TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workforce_messages_v2 (
        id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, sender_role TEXT NOT NULL,
        recipient_id TEXT, department TEXT, message_type TEXT NOT NULL, mission_id TEXT NOT NULL,
        task_id TEXT, summary TEXT NOT NULL, payload_json TEXT, timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workforce_messages_recipient ON workforce_messages_v2(recipient_id, timestamp);
    `);
  }

  private async database(): Promise<Database> {
    await this.connect();
    return this.db!;
  }

  async upsertProject(record: WorkforceProjectRecord): Promise<void> {
    const db = await this.database();
    await db.run(`INSERT INTO workforce_projects_v2(project_id, goal, status, workspace_path, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET goal=excluded.goal, status=excluded.status,
      workspace_path=excluded.workspace_path, updated_at=excluded.updated_at`,
      [record.projectId, record.goal, record.status, record.workspacePath, record.updatedAt]);
  }

  async upsertTask(record: WorkforceTaskRecord): Promise<void> {
    const db = await this.database();
    await db.run(`INSERT INTO workforce_tasks_v2(task_id, project_id, mission_id, worker_id, status, title, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET project_id=excluded.project_id,
      worker_id=excluded.worker_id, status=excluded.status, title=excluded.title, updated_at=excluded.updated_at`,
      [record.taskId, record.projectId, record.missionId, record.workerId, record.status, record.title, record.updatedAt]);
  }

  async recordMessage(message: CollaborationMessage): Promise<void> {
    const db = await this.database();
    await db.run(`INSERT OR REPLACE INTO workforce_messages_v2
      (id, sender_id, sender_role, recipient_id, department, message_type, mission_id, task_id, summary, payload_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [message.id, message.senderId, message.senderRole, message.recipientId, message.department,
        message.messageType, message.missionId, message.taskId, message.summary,
        message.payload ? JSON.stringify(message.payload) : undefined, message.timestamp]);
  }

  async listMessages(recipientId?: string, limit = 100): Promise<CollaborationMessage[]> {
    const db = await this.database();
    const rows = recipientId
      ? await db.all<any[]>(`SELECT * FROM workforce_messages_v2 WHERE recipient_id = ? ORDER BY timestamp DESC LIMIT ?`, [recipientId, limit])
      : await db.all<any[]>(`SELECT * FROM workforce_messages_v2 ORDER BY timestamp DESC LIMIT ?`, [limit]);
    return rows.map((row) => ({ id: row.id, senderId: row.sender_id, senderRole: row.sender_role,
      recipientId: row.recipient_id, department: row.department, messageType: row.message_type,
      missionId: row.mission_id, taskId: row.task_id, summary: row.summary,
      payload: row.payload_json ? JSON.parse(row.payload_json) : undefined, timestamp: row.timestamp }));
  }

  async close(): Promise<void> {
    if (this.db) { await this.db.close(); this.db = null; }
  }
}
