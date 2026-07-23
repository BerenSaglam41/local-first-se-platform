import { IStorage } from '../../core/domain/interfaces/istorage';
import { Project } from '../../core/domain/models/project';
import { Task } from '../../core/domain/models/task';
import { ExecutionRecord, TokenMetrics, ResourceMetrics, TelemetryData } from '../../core/domain/models/telemetry';
import { SqliteDb } from './sqlite_db';
import {
  StorageException,
  DatabaseLockedException,
  TransactionException
} from '../../core/domain/errors/exceptions';

export class SqliteRepository implements IStorage {
  constructor(private sqliteDb: SqliteDb) {}

  private handleError(error: any, message: string): never {
    const errMsg = `${message}: ${error instanceof Error ? error.message : String(error)}`;
    if (error && (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED')) {
      throw new DatabaseLockedException(errMsg, error);
    }
    throw new StorageException(errMsg, error);
  }

  async initialize(): Promise<void> {
    try {
      await this.sqliteDb.connect();
    } catch (error) {
      this.handleError(error, 'Failed to initialize database connection');
    }
  }

  async close(): Promise<void> {
    try {
      await this.sqliteDb.close();
    } catch (error) {
      this.handleError(error, 'Failed to close database connection');
    }
  }

  // Transactions
  async beginTransaction(): Promise<void> {
    try {
      const db = await this.sqliteDb.getDb();
      // BEGIN IMMEDIATE obtains a write lock immediately to prevent deadlocks in WAL mode.
      await db.run('BEGIN IMMEDIATE TRANSACTION');
    } catch (error) {
      const err = error as any;
      if (err && (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED')) {
        throw new DatabaseLockedException('Failed to begin transaction due to lock', error);
      }
      throw new TransactionException('Failed to begin transaction', error);
    }
  }

  async commit(): Promise<void> {
    try {
      const db = await this.sqliteDb.getDb();
      await db.run('COMMIT');
    } catch (error) {
      throw new TransactionException('Failed to commit transaction', error);
    }
  }

  async rollback(): Promise<void> {
    try {
      const db = await this.sqliteDb.getDb();
      await db.run('ROLLBACK');
    } catch (error) {
      throw new TransactionException('Failed to rollback transaction', error);
    }
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    await this.beginTransaction();
    try {
      const result = await work();
      await this.commit();
      return result;
    } catch (error) {
      try {
        await this.rollback();
      } catch (rollbackError) {
        // Rollback error is logged but we propagate the primary execution error.
      }
      if (error instanceof StorageException) {
        throw error;
      }
      throw new StorageException('Transaction failed and was rolled back', error);
    }
  }

  // Projects
  async createProject(project: Project): Promise<void> {
    try {
      const db = await this.sqliteDb.getDb();
      await db.run(
        `INSERT INTO projects (id, name, root_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          project.id,
          project.name,
          project.rootPath,
          project.createdAt.toISOString(),
          project.updatedAt.toISOString(),
        ]
      );
    } catch (error) {
      this.handleError(error, `Failed to create project with ID ${project.id}`);
    }
  }

  async getProject(id: string): Promise<Project | null> {
    try {
      const db = await this.sqliteDb.getDb();
      const row = await db.get('SELECT * FROM projects WHERE id = ?', [id]);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        rootPath: row.root_path,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    } catch (error) {
      this.handleError(error, `Failed to retrieve project with ID ${id}`);
    }
  }

  async listProjects(): Promise<Project[]> {
    try {
      const db = await this.sqliteDb.getDb();
      const rows = await db.all('SELECT * FROM projects ORDER BY created_at DESC');
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        rootPath: row.root_path,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      this.handleError(error, 'Failed to list projects');
    }
  }

  // Tasks
  async createTask(task: Task): Promise<void> {
    try {
      const db = await this.sqliteDb.getDb();
      await db.run(
        `INSERT INTO tasks (id, project_id, workflow_id, title, description, assigned_agent_id, status, dependencies, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.projectId,
          task.workflowId,
          task.title,
          task.description,
          task.assignedAgentId || null,
          task.status,
          JSON.stringify(task.dependencies),
          task.createdAt.toISOString(),
          task.updatedAt.toISOString(),
        ]
      );
    } catch (error) {
      this.handleError(error, `Failed to create task with ID ${task.id}`);
    }
  }

  async getTask(id: string): Promise<Task | null> {
    try {
      const db = await this.sqliteDb.getDb();
      const row = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
      if (!row) return null;
      return {
        id: row.id,
        projectId: row.project_id,
        workflowId: row.workflow_id,
        title: row.title,
        description: row.description,
        assignedAgentId: row.assigned_agent_id || undefined,
        status: row.status,
        dependencies: JSON.parse(row.dependencies),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    } catch (error) {
      this.handleError(error, `Failed to retrieve task with ID ${id}`);
    }
  }

  async updateTask(task: Task): Promise<void> {
    try {
      const db = await this.sqliteDb.getDb();
      await db.run(
        `UPDATE tasks 
         SET title = ?, description = ?, assigned_agent_id = ?, status = ?, dependencies = ?, updated_at = ?
         WHERE id = ?`,
        [
          task.title,
          task.description,
          task.assignedAgentId || null,
          task.status,
          JSON.stringify(task.dependencies),
          task.updatedAt.toISOString(),
          task.id,
        ]
      );
    } catch (error) {
      this.handleError(error, `Failed to update task with ID ${task.id}`);
    }
  }

  async listTasksByProject(projectId: string): Promise<Task[]> {
    try {
      const db = await this.sqliteDb.getDb();
      const rows = await db.all('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
      return rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        workflowId: row.workflow_id,
        title: row.title,
        description: row.description,
        assignedAgentId: row.assigned_agent_id || undefined,
        status: row.status,
        dependencies: JSON.parse(row.dependencies),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      this.handleError(error, `Failed to list tasks for project ${projectId}`);
    }
  }

  // Telemetry
  async saveExecutionRecord(record: ExecutionRecord): Promise<void> {
    try {
      const db = await this.sqliteDb.getDb();
      await db.run(
        `INSERT INTO execution_records (id, project_id, workflow_id, task_id, agent_id, provider_id, status, start_time, end_time, duration_ms, retry_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           end_time = excluded.end_time,
           duration_ms = excluded.duration_ms,
           retry_count = excluded.retry_count`,
        [
          record.id,
          record.projectId,
          record.workflowId,
          record.taskId,
          record.agentId,
          record.providerId,
          record.status,
          record.startTime.toISOString(),
          record.endTime ? record.endTime.toISOString() : null,
          record.durationMs !== undefined ? record.durationMs : null,
          record.retryCount,
        ]
      );
    } catch (error) {
      this.handleError(error, `Failed to save execution record ${record.id}`);
    }
  }

  async saveTokenMetrics(metrics: TokenMetrics): Promise<void> {
    try {
      const db = await this.sqliteDb.getDb();
      await db.run(
        `INSERT INTO token_metrics (id, execution_id, estimated_input_tokens, estimated_output_tokens, real_input_tokens, real_output_tokens, estimated_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           real_input_tokens = excluded.real_input_tokens,
           real_output_tokens = excluded.real_output_tokens,
           estimated_cost = excluded.estimated_cost`,
        [
          metrics.id,
          metrics.executionId,
          metrics.estimatedInputTokens,
          metrics.estimatedOutputTokens,
          metrics.realInputTokens !== undefined ? metrics.realInputTokens : null,
          metrics.realOutputTokens !== undefined ? metrics.realOutputTokens : null,
          metrics.estimatedCost,
        ]
      );
    } catch (error) {
      this.handleError(error, `Failed to save token metrics ${metrics.id}`);
    }
  }

  async saveResourceMetrics(metrics: ResourceMetrics): Promise<void> {
    try {
      const db = await this.sqliteDb.getDb();
      await db.run(
        `INSERT INTO resource_metrics (id, execution_id, cpu_usage_percent, ram_usage_bytes, files_read_count, files_written_count, tool_calls_count, context_size_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           cpu_usage_percent = excluded.cpu_usage_percent,
           ram_usage_bytes = excluded.ram_usage_bytes,
           files_read_count = excluded.files_read_count,
           files_written_count = excluded.files_written_count,
           tool_calls_count = excluded.tool_calls_count,
           context_size_tokens = excluded.context_size_tokens`,
        [
          metrics.id,
          metrics.executionId,
          metrics.cpuUsagePercent,
          metrics.ramUsageBytes,
          metrics.filesReadCount,
          metrics.filesWrittenCount,
          metrics.toolCallsCount,
          metrics.contextSizeTokens,
        ]
      );
    } catch (error) {
      this.handleError(error, `Failed to save resource metrics ${metrics.id}`);
    }
  }

  async getTelemetryByExecution(executionId: string): Promise<TelemetryData | null> {
    try {
      const db = await this.sqliteDb.getDb();
      const executionRow = await db.get('SELECT * FROM execution_records WHERE id = ?', [executionId]);
      if (!executionRow) return null;

      const tokenRow = await db.get('SELECT * FROM token_metrics WHERE execution_id = ?', [executionId]);
      const resourceRow = await db.get('SELECT * FROM resource_metrics WHERE execution_id = ?', [executionId]);

      const execution: ExecutionRecord = {
        id: executionRow.id,
        projectId: executionRow.project_id,
        workflowId: executionRow.workflow_id,
        taskId: executionRow.task_id,
        agentId: executionRow.agent_id,
        providerId: executionRow.provider_id,
        status: executionRow.status,
        startTime: new Date(executionRow.start_time),
        endTime: executionRow.end_time ? new Date(executionRow.end_time) : undefined,
        durationMs: executionRow.duration_ms !== null ? executionRow.duration_ms : undefined,
        retryCount: executionRow.retry_count,
      };

      const tokens: TokenMetrics = tokenRow ? {
        id: tokenRow.id,
        executionId: tokenRow.execution_id,
        estimatedInputTokens: tokenRow.estimated_input_tokens,
        estimatedOutputTokens: tokenRow.estimated_output_tokens,
        realInputTokens: tokenRow.real_input_tokens !== null ? tokenRow.real_input_tokens : undefined,
        realOutputTokens: tokenRow.real_output_tokens !== null ? tokenRow.real_output_tokens : undefined,
        estimatedCost: tokenRow.estimated_cost,
      } : {
        id: '',
        executionId,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedCost: 0
      };

      const resources: ResourceMetrics = resourceRow ? {
        id: resourceRow.id,
        executionId: resourceRow.execution_id,
        cpuUsagePercent: resourceRow.cpu_usage_percent,
        ramUsageBytes: resourceRow.ram_usage_bytes,
        filesReadCount: resourceRow.files_read_count,
        filesWrittenCount: resourceRow.files_written_count,
        toolCallsCount: resourceRow.tool_calls_count,
        contextSizeTokens: resourceRow.context_size_tokens,
      } : {
        id: '',
        executionId,
        cpuUsagePercent: 0,
        ramUsageBytes: 0,
        filesReadCount: 0,
        filesWrittenCount: 0,
        toolCallsCount: 0,
        contextSizeTokens: 0
      };

      return { execution, tokens, resources };
    } catch (error) {
      this.handleError(error, `Failed to retrieve telemetry for execution ${executionId}`);
    }
  }

  async listTelemetry(): Promise<TelemetryData[]> {
    try {
      const db = await this.sqliteDb.getDb();
      const executions = await db.all('SELECT * FROM execution_records ORDER BY start_time DESC');
      
      const results: TelemetryData[] = [];
      for (const e of executions) {
        const tel = await this.getTelemetryByExecution(e.id);
        if (tel) results.push(tel);
      }
      return results;
    } catch (error) {
      this.handleError(error, 'Failed to list telemetry data');
    }
  }
}
