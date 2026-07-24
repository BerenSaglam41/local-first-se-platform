import { open, Database } from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { IConfig } from '../../core/domain/interfaces/iconfig';
import { ILogger } from '../../core/domain/interfaces/ilogger';

export class SqliteDb {
  private db: Database | null = null;
  private dbPath: string;

  constructor(
    private config: IConfig,
    private logger: ILogger
  ) {
    this.dbPath = this.config.get().dbPath;
  }

  async connect(): Promise<Database> {
    if (this.db) return this.db;

    this.logger.info(`Connecting to SQLite database at ${this.dbPath}`);
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database,
    });

    // Enable foreign keys constraint enforcement. Required to support ON DELETE CASCADE actions.
    await this.db.run('PRAGMA foreign_keys = ON');

    // Enable Write-Ahead Logging (WAL) mode. Dramatically improves concurrent read/write performance for local SQLite databases.
    await this.db.run('PRAGMA journal_mode = WAL');

    // Set busy timeout to 5000 milliseconds to wait for lock releases rather than throwing SQLITE_BUSY instantly.
    await this.db.run('PRAGMA busy_timeout = 5000');

    await this.runMigrations();
    return this.db;
  }

  async getDb(): Promise<Database> {
    if (!this.db) {
      return this.connect();
    }
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.logger.info('Closing SQLite database connection');
      await this.db.close();
      this.db = null;
    }
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);

    const migrations = [
      {
        version: 1,
        sql: `
          CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            workflow_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            assigned_agent_id TEXT,
            status TEXT NOT NULL,
            dependencies TEXT NOT NULL, -- JSON string array
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS execution_records (
            id TEXT PRIMARY KEY, -- Correlation / Trace ID
            project_id TEXT NOT NULL,
            workflow_id TEXT NOT NULL,
            task_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            provider_id TEXT NOT NULL,
            status TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            duration_ms INTEGER,
            retry_count INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS token_metrics (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            estimated_input_tokens INTEGER NOT NULL,
            estimated_output_tokens INTEGER NOT NULL,
            real_input_tokens INTEGER,
            real_output_tokens INTEGER,
            estimated_cost REAL NOT NULL,
            FOREIGN KEY (execution_id) REFERENCES execution_records(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS resource_metrics (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            cpu_usage_percent REAL NOT NULL,
            ram_usage_bytes INTEGER NOT NULL,
            files_read_count INTEGER NOT NULL,
            files_written_count INTEGER NOT NULL,
            tool_calls_count INTEGER NOT NULL,
            context_size_tokens INTEGER NOT NULL,
            FOREIGN KEY (execution_id) REFERENCES execution_records(id) ON DELETE CASCADE
          );

          -- INDEXES:
          -- 1. Index on tasks(project_id) to optimize retrieval of tasks associated with a project.
          CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

          -- 2. Index on execution_records(project_id) to optimize listing and querying telemetry grouped by project.
          CREATE INDEX IF NOT EXISTS idx_execution_records_project_id ON execution_records(project_id);

          -- 3. Index on execution_records(task_id) to optimize query performance when tracing telemetry back to specific tasks.
          CREATE INDEX IF NOT EXISTS idx_execution_records_task_id ON execution_records(task_id);

          -- 4. Index on token_metrics(execution_id) to speed up joins between execution records and token metric details.
          CREATE INDEX IF NOT EXISTS idx_token_metrics_execution_id ON token_metrics(execution_id);

          -- 5. Index on resource_metrics(execution_id) to speed up joins between execution records and resource metric details.
          CREATE INDEX IF NOT EXISTS idx_resource_metrics_execution_id ON resource_metrics(execution_id);

          -- 6. Index on execution_records(status) to accelerate queries filtering execution attempts by status (e.g., successful vs failed retries).
          CREATE INDEX IF NOT EXISTS idx_execution_records_status ON execution_records(status);
        `
      },
      {
        version: 2,
        sql: `
          CREATE TABLE IF NOT EXISTS project_metadata (
            project_id TEXT PRIMARY KEY,
            schema_version INTEGER NOT NULL,
            language TEXT NOT NULL,
            package_manager TEXT,
            build_system TEXT,
            test_framework TEXT,
            tech_stack TEXT NOT NULL,
            last_indexed_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS project_files (
            path TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            hash TEXT NOT NULL,
            imports TEXT NOT NULL,
            exports TEXT NOT NULL,
            dependencies TEXT NOT NULL,
            last_updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
        `
      }
    ];

    for (const m of migrations) {
      const row = await this.db.get('SELECT version FROM schema_migrations WHERE version = ?', [m.version]);
      if (!row) {
        this.logger.info(`Applying database migration version ${m.version}`);
        await this.db.exec(m.sql);
        await this.db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
          m.version,
          new Date().toISOString(),
        ]);
      }
    }
  }
}
