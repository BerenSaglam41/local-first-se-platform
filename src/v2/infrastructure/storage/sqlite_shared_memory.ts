import { open, Database } from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { ADRRecord, GitState, ISharedMemory, TaskBoardState } from '../../contracts/ishared_memory';

export class SqliteSharedMemory implements ISharedMemory {
  private db: Database | null = null;

  constructor(private dbPath: string) {}

  async connect(): Promise<Database> {
    if (this.db) return this.db;

    const sqlite3Mod = require('sqlite3');
    const sqliteDriver = sqlite3Mod?.Database || sqlite3Mod?.default?.Database || sqlite3Mod?.default?.default?.Database || (sqlite3 as any).Database;

    this.db = await open({
      filename: this.dbPath,
      driver: sqliteDriver,
    });

    await this.db.run('PRAGMA foreign_keys = ON');
    await this.db.run('PRAGMA journal_mode = WAL');
    await this.db.run('PRAGMA busy_timeout = 5000');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS adrs_v2 (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        status TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_board_v2 (
        task_id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS git_state_v2 (
        key TEXT PRIMARY KEY,
        val TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkpoints_v2 (
        subtask_id TEXT PRIMARY KEY,
        checkpoint_hash TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
    `);

    return this.db;
  }

  async readADR(adrId: string): Promise<ADRRecord | null> {
    const db = await this.connect();
    const row = await db.get<any>(`SELECT * FROM adrs_v2 WHERE id LIKE ? LIMIT 1`, [`${adrId}%`]);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      status: row.status,
      content: row.content,
      timestamp: row.timestamp,
    };
  }


  async writeADR(adr: ADRRecord): Promise<void> {
    const db = await this.connect();
    await db.run(
      `INSERT INTO adrs_v2 (id, title, author, status, content, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, author=excluded.author, status=excluded.status, content=excluded.content, timestamp=excluded.timestamp`,
      [adr.id, adr.title, adr.author, adr.status, adr.content, adr.timestamp]
    );
  }

  async getTaskBoard(): Promise<TaskBoardState> {
    const db = await this.connect();
    const rows = await db.all<any[]>(`SELECT * FROM task_board_v2`);
    const board: TaskBoardState = { backlog: [], inProgress: [], review: [], completed: [] };
    for (const r of rows) {
      if (r.status === 'BACKLOG') board.backlog.push(r.task_id);
      else if (r.status === 'IN_PROGRESS') board.inProgress.push(r.task_id);
      else if (r.status === 'IN_REVIEW') board.review.push(r.task_id);
      else if (r.status === 'COMPLETED') board.completed.push(r.task_id);
    }
    return board;
  }

  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const db = await this.connect();
    await db.run(
      `INSERT INTO task_board_v2 (task_id, status) VALUES (?, ?)
       ON CONFLICT(task_id) DO UPDATE SET status=excluded.status`,
      [taskId, status]
    );
  }

  async getGitStatus(): Promise<GitState> {
    const db = await this.connect();
    const branchRow = await db.get<any>(`SELECT val FROM git_state_v2 WHERE key = 'currentBranch'`);
    const cleanRow = await db.get<any>(`SELECT val FROM git_state_v2 WHERE key = 'cleanState'`);
    const checkpoints = await db.all<any[]>(`SELECT * FROM checkpoints_v2`);

    const cpMap: Record<string, string> = {};
    for (const c of checkpoints) {
      cpMap[c.subtask_id] = c.checkpoint_hash;
    }

    return {
      currentBranch: branchRow ? branchRow.val : 'master',
      cleanState: cleanRow ? cleanRow.val === 'true' : true,
      activeCheckpoints: cpMap,
    };
  }

  async writeGitCheckpoint(subTaskId: string, message: string): Promise<string> {
    const db = await this.connect();
    const hash = `cp-${Date.now()}`;
    await db.run(
      `INSERT INTO checkpoints_v2 (subtask_id, checkpoint_hash, timestamp) VALUES (?, ?, ?)
       ON CONFLICT(subtask_id) DO UPDATE SET checkpoint_hash=excluded.checkpoint_hash, timestamp=excluded.timestamp`,
      [subTaskId, hash, new Date().toISOString()]
    );
    return hash;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
