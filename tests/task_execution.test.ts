import { TaskExecutionService } from '../src/core/application/services/task_execution_service';
import { IContextBuilder } from '../src/core/domain/interfaces/icontext_builder';
import { IProvider, ProviderResult } from '../src/core/domain/interfaces/iprovider';
import { EngineeringTask } from '../src/core/domain/models/execution';

describe('TaskExecutionService Application Service', () => {
  let mockContextBuilder: jest.Mocked<IContextBuilder>;
  let mockProvider: jest.Mocked<IProvider>;
  let service: TaskExecutionService;

  beforeEach(() => {
    mockContextBuilder = {
      buildContext: jest.fn(),
    };
    mockProvider = {
      execute: jest.fn(),
      stream: jest.fn(),
      cancel: jest.fn(),
      providerName: jest.fn().mockReturnValue('mock-provider'),
    };
    const mockConfig = {
      get: () => ({
        port: 3000,
        env: 'test',
        dbPath: ':memory:',
        logPath: './test.jsonl',
        maxConcurrentAgents: 5,
        approvalMode: 'automatic' as const,
        defaultContextBudget: 4096,
        providerType: 'mock' as const,
        claudeExecutable: 'claude',
        verificationCommands: [],
        maxRetryCount: 3,
      }),
    };
    const mockRuntime = {
      execute: jest.fn(),
    };
    service = new TaskExecutionService(mockContextBuilder, mockProvider, mockConfig, mockRuntime);
  });

  it('should successfully execute a valid engineering task', async () => {
    const task: EngineeringTask = {
      id: 'task-success',
      description: 'Refactor code',
      entryFile: 'index.ts',
      workspaceFiles: ['index.ts'],
    };

    mockContextBuilder.buildContext.mockResolvedValue({
      codeContent: 'sliced code content',
      extractedSymbols: [],
      tokenEstimate: 50,
    });

    const mockProviderResult: ProviderResult = {
      success: true,
      output: 'Here is the code:\n```typescript\nconst x = 1;\n```',
      exitCode: 0,
      durationMs: 120,
    };
    mockProvider.execute.mockResolvedValue(mockProviderResult);

    const result = await service.executeTask(task);

    expect(result.status).toBe('SUCCESS');
    expect(result.output).toBe('Here is the code:\n```typescript\nconst x = 1;\n```');
    expect(result.error).toBeUndefined();
    expect(result.taskId).toBe(task.id);
    expect(mockContextBuilder.buildContext).toHaveBeenCalledWith(task.description, task.entryFile, task.workspaceFiles);
    expect(mockProvider.execute).toHaveBeenCalledWith(
      `Task Instruction: ${task.description}\n\nCodebase Context:\nsliced code content`
    );
  });

  it('should return ERROR status on invalid task request', async () => {
    const emptyDescTask: EngineeringTask = {
      id: 'task-invalid',
      description: '   ',
      entryFile: 'index.ts',
      workspaceFiles: [],
    };

    const result = await service.executeTask(emptyDescTask);
    expect(result.status).toBe('ERROR');
    expect(result.error).toContain('Task description cannot be empty');
  });

  it('should return ERROR status when ContextBuilder throws an exception', async () => {
    const task: EngineeringTask = {
      id: 'task-ctx-fail',
      description: 'Refactor code',
      entryFile: 'index.ts',
      workspaceFiles: ['index.ts'],
    };

    mockContextBuilder.buildContext.mockRejectedValue(new Error('Syntax error'));

    const result = await service.executeTask(task);
    expect(result.status).toBe('ERROR');
    expect(result.error).toContain('Context generation failure: Syntax error');
  });

  it('should return FAILED status when provider returns unsuccessful status', async () => {
    const task: EngineeringTask = {
      id: 'task-prov-fail',
      description: 'Refactor code',
      entryFile: 'index.ts',
      workspaceFiles: ['index.ts'],
    };

    mockContextBuilder.buildContext.mockResolvedValue({
      codeContent: 'sliced code',
      extractedSymbols: [],
      tokenEstimate: 10,
    });

    mockProvider.execute.mockResolvedValue({
      success: false,
      output: '',
      error: 'CLI execution crashed',
      exitCode: 1,
      durationMs: 80,
    });

    const result = await service.executeTask(task);
    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('CLI execution crashed');
  });
});
