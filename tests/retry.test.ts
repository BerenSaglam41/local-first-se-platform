import { TaskExecutionService } from '../src/core/application/services/task_execution_service';
import { EngineeringTask } from '../src/core/domain/models/execution';

describe('Autonomous Retry Engine Integration', () => {
  let mockContextBuilder: any;
  let mockProvider: any;
  let mockConfig: any;
  let mockRuntime: any;
  let service: TaskExecutionService;

  beforeEach(() => {
    mockContextBuilder = {
      buildContext: jest.fn(),
    };
    mockProvider = {
      execute: jest.fn(),
      stream: jest.fn(),
      cancel: jest.fn(),
      providerName: jest.fn().mockReturnValue('mock'),
    };
    mockConfig = {
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
        verificationCommands: ['npm run build'],
        maxRetryCount: 2,
      }),
    };

    const mockHandle = {
      wait: jest.fn(),
      on: jest.fn(),
    };
    mockRuntime = {
      execute: jest.fn().mockReturnValue(mockHandle),
    };

    mockContextBuilder.buildContext.mockResolvedValue({
      codeContent: 'sliced code content',
      extractedSymbols: [],
      tokenEstimate: 50,
    });

    service = new TaskExecutionService(mockContextBuilder, mockProvider, mockConfig, mockRuntime);
  });

  it('should successfully execute task on first attempt without retry', async () => {
    const task: EngineeringTask = {
      id: 'task-retry-1',
      description: 'Refactor math helper',
      entryFile: 'math_helper.ts',
      workspaceFiles: ['math_helper.ts'],
    };

    mockProvider.execute.mockResolvedValue({
      success: true,
      output: 'Here is code:\n```typescript\nconst x = 1;\n```',
      exitCode: 0,
      durationMs: 10,
    });

    const mockHandle = mockRuntime.execute();
    mockHandle.wait.mockResolvedValue({
      state: 'FINISHED',
      exitCode: 0,
      metrics: { durationMs: 5 },
    });

    const result = await service.executeTask(task);

    expect(result.status).toBe('SUCCESS');
    expect(result.retryCount).toBe(0);
    expect(result.retryHistory.length).toBe(0);
    expect(result.verificationStatus).toBe('passed');
  });

  it('should retry when first verification fails and succeed on second attempt', async () => {
    const task: EngineeringTask = {
      id: 'task-retry-2',
      description: 'Refactor math helper',
      entryFile: 'math_helper.ts',
      workspaceFiles: ['math_helper.ts'],
    };

    mockProvider.execute
      .mockResolvedValueOnce({
        success: true,
        output: 'Here is code:\n```typescript\nconst x = 1;\n```',
        exitCode: 0,
        durationMs: 10,
      })
      .mockResolvedValueOnce({
        success: true,
        output: 'Here is code:\n```typescript\nconst x = 2;\n```',
        exitCode: 0,
        durationMs: 10,
      });

    const mockHandle = mockRuntime.execute();
    mockHandle.wait
      .mockResolvedValueOnce({
        state: 'FINISHED',
        exitCode: 1,
        metrics: { durationMs: 5 },
      })
      .mockResolvedValueOnce({
        state: 'FINISHED',
        exitCode: 0,
        metrics: { durationMs: 5 },
      });

    const result = await service.executeTask(task);

    expect(result.status).toBe('SUCCESS');
    expect(result.retryCount).toBe(1);
    expect(result.retryHistory.length).toBe(1);
    expect(result.retryHistory[0]).toContain('Attempt 1 failed');
    expect(result.verificationStatus).toBe('passed');
  });

  it('should retry and fail when retry limit is reached', async () => {
    const task: EngineeringTask = {
      id: 'task-retry-3',
      description: 'Refactor math helper',
      entryFile: 'math_helper.ts',
      workspaceFiles: ['math_helper.ts'],
    };

    mockProvider.execute.mockResolvedValue({
      success: true,
      output: 'Here is code:\n```typescript\nconst x = 1;\n```',
      exitCode: 0,
      durationMs: 10,
    });

    const mockHandle = mockRuntime.execute();
    mockHandle.wait.mockResolvedValue({
      state: 'FINISHED',
      exitCode: 1,
      metrics: { durationMs: 5 },
    });

    const result = await service.executeTask(task);

    expect(result.status).toBe('FAILED');
    expect(result.retryCount).toBe(2);
    expect(result.retryHistory.length).toBe(2);
    expect(result.verificationStatus).toBe('failed');
  });
});
