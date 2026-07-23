import { SqliteDb } from '../src/infrastructure/storage/sqlite_db';
import { SqliteRepository } from '../src/infrastructure/storage/sqlite_repository';
import { IConfig } from '../src/core/domain/interfaces/iconfig';
import { ILogger } from '../src/core/domain/interfaces/ilogger';
import { Project } from '../src/core/domain/models/project';
import { Task } from '../src/core/domain/models/task';
import { ExecutionRecord, TokenMetrics, ResourceMetrics } from '../src/core/domain/models/telemetry';

describe('SQLite Relational Repository & Telemetry Storage', () => {
  let db: SqliteDb;
  let repo: SqliteRepository;

  const mockConfig: IConfig = {
    get: () => ({
      port: 3000,
      env: 'test',
      dbPath: ':memory:', // Using in-memory db for testing
      logPath: './test.jsonl',
      maxConcurrentAgents: 5,
      approvalMode: 'automatic',
      defaultContextBudget: 4096,
      providerType: 'mock',
      claudeExecutable: 'claude',
    }),
  };

  const mockLogger: ILogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  beforeEach(async () => {
    db = new SqliteDb(mockConfig, mockLogger);
    repo = new SqliteRepository(db);
    await repo.initialize();
  });

  afterEach(async () => {
    await repo.close();
  });

  it('should create and retrieve a project', async () => {
    const project: Project = {
      id: 'p-1',
      name: 'Test Project',
      rootPath: '/users/test/repo',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await repo.createProject(project);

    const retrieved = await repo.getProject(project.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(project.id);
    expect(retrieved!.name).toBe(project.name);
    expect(retrieved!.rootPath).toBe(project.rootPath);
    expect(retrieved!.createdAt.toISOString()).toBe(project.createdAt.toISOString());
  });

  it('should create, update, and retrieve tasks within a project', async () => {
    const project: Project = {
      id: 'p-2',
      name: 'Project 2',
      rootPath: '/path/2',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repo.createProject(project);

    const task: Task = {
      id: 't-1',
      projectId: project.id,
      workflowId: 'w-100',
      title: 'Analyze Codebase',
      description: 'Run static analysis',
      status: 'PENDING',
      dependencies: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await repo.createTask(task);

    const retrieved = await repo.getTask(task.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(task.id);
    expect(retrieved!.status).toBe('PENDING');

    // Update status
    task.status = 'COMPLETED';
    await repo.updateTask(task);

    const updated = await repo.getTask(task.id);
    expect(updated!.status).toBe('COMPLETED');

    const tasksList = await repo.listTasksByProject(project.id);
    expect(tasksList.length).toBe(1);
    expect(tasksList[0].id).toBe(task.id);
  });

  it('should save and list full normalized execution telemetry', async () => {
    const project: Project = {
      id: 'p-3',
      name: 'Telemetry Project',
      rootPath: '/path/3',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repo.createProject(project);

    const task: Task = {
      id: 't-2',
      projectId: project.id,
      workflowId: 'w-200',
      title: 'Generate UI Component',
      description: 'Implement navbar',
      status: 'RUNNING',
      dependencies: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repo.createTask(task);

    const execution: ExecutionRecord = {
      id: 'exec-999', // correlation ID
      projectId: project.id,
      workflowId: 'w-200',
      taskId: task.id,
      agentId: 'coder-01',
      providerId: 'claude-cli',
      status: 'SUCCESS',
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 1250,
      retryCount: 0,
    };

    await repo.saveExecutionRecord(execution);

    const tokens: TokenMetrics = {
      id: 'tok-999',
      executionId: execution.id,
      estimatedInputTokens: 500,
      estimatedOutputTokens: 250,
      realInputTokens: 512,
      realOutputTokens: 240,
      estimatedCost: 0.015,
    };
    await repo.saveTokenMetrics(tokens);

    const resources: ResourceMetrics = {
      id: 'res-999',
      executionId: execution.id,
      cpuUsagePercent: 12.5,
      ramUsageBytes: 67108864, // 64MB
      filesReadCount: 3,
      filesWrittenCount: 1,
      toolCallsCount: 2,
      contextSizeTokens: 4096,
    };
    await repo.saveResourceMetrics(resources);

    const telemetry = await repo.getTelemetryByExecution(execution.id);
    expect(telemetry).not.toBeNull();
    expect(telemetry!.execution.id).toBe(execution.id);
    expect(telemetry!.tokens.realInputTokens).toBe(tokens.realInputTokens);
    expect(telemetry!.resources.cpuUsagePercent).toBe(resources.cpuUsagePercent);

    const list = await repo.listTelemetry();
    expect(list.length).toBe(1);
    expect(list[0].execution.id).toBe(execution.id);
  });

  it('should commit changes inside a successful runInTransaction', async () => {
    const project: Project = {
      id: 'tx-p1',
      name: 'Tx Project 1',
      rootPath: '/tx/1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await repo.runInTransaction(async () => {
      await repo.createProject(project);
    });

    const retrieved = await repo.getProject(project.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe('Tx Project 1');
  });

  it('should rollback changes and throw error when runInTransaction fails', async () => {
    const project: Project = {
      id: 'tx-p2',
      name: 'Tx Project 2',
      rootPath: '/tx/2',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(
      repo.runInTransaction(async () => {
        await repo.createProject(project);
        throw new Error('Forced failure for rollback');
      })
    ).rejects.toThrow('Transaction failed and was rolled back');

    const retrieved = await repo.getProject(project.id);
    expect(retrieved).toBeNull(); // Assert rolled back successfully
  });
});
