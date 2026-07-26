import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceEngine } from '../../../src/v2/application/workspace/workspace_engine';
import { DefaultMissionPlanningStrategy } from '../../../src/v2/application/missions/default_mission_planning_strategy';
import { ProjectLifecycleOrchestrator } from '../../../src/v2/application/project/project_lifecycle_orchestrator';
import { IProjectLifecycleStrategy } from '../../../src/v2/contracts/iproject_lifecycle_strategy';
import { ProjectExecutionResult, ProjectExecutionState } from '../../../src/v2/contracts/iproject_lifecycle_orchestrator';
import { createFakeClaudeCodeRuntimePlugin, createSpawnRecorder } from '../helpers/fake_claude_process';
import { WorkerExecutionEngine } from '../../../src/v2/application/worker/worker_execution_engine';
import { WorkspaceExecutionService } from '../../../src/v2/application/worker/workspace_execution_service';
import { WorkerStore } from '../../../src/v2/application/worker/worker_store';
import { CollaborationEngine } from '../../../src/v2/application/collaboration/collaboration_engine';
import { SqliteSharedMemory } from '../../../src/v2/infrastructure/storage/sqlite_shared_memory';

describe('workforce end-to-end invariants', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('seeds one shared workspace from the target and syncs worker output back', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'se-workforce-'));
    tempRoots.push(root);
    const target = path.join(root, 'target');
    const stagingBase = path.join(root, 'staging');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'existing.txt'), 'before');

    const engine = new WorkspaceEngine(stagingBase);
    const shared = engine.createProjectWorkspace('proj-test', target);
    expect(fs.readFileSync(path.join(shared.isolatedPath, 'existing.txt'), 'utf8')).toBe('before');

    fs.writeFileSync(path.join(shared.isolatedPath, 'worker-output.txt'), 'created by worker');
    engine.syncProjectWorkspace(shared.isolatedPath, target);

    expect(fs.readFileSync(path.join(target, 'existing.txt'), 'utf8')).toBe('before');
    expect(fs.readFileSync(path.join(target, 'worker-output.txt'), 'utf8')).toBe('created by worker');
  });

  it('carries the project workspace into every generated mission plan', async () => {
    const plan = await new DefaultMissionPlanningStrategy().planMission('mission-test', 'Create an API', {
      executionWorkspacePath: '/tmp/shared-project-workspace',
    });
    expect(plan.workspacePath).toBe('/tmp/shared-project-workspace');
  });

  it('starts a CLI provider with the shared workspace as its real cwd', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'se-cli-cwd-'));
    tempRoots.push(root);
    const recorder = createSpawnRecorder();
    const plugin = createFakeClaudeCodeRuntimePlugin({ recorder });
    await plugin.initialize();

    const result = await plugin.execute({
      workerId: 'emp-alice',
      prompt: 'write a file',
      workspacePath: root,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(true);
    expect(recorder.calls[0].cwd).toBe(root);
  });

  it('uses one resumable Claude chat per project worker', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'se-cli-session-'));
    tempRoots.push(root);
    const recorder = createSpawnRecorder();
    const plugin = createFakeClaudeCodeRuntimePlugin({ recorder });
    await plugin.initialize();

    await plugin.execute({ workerId: 'emp-alice', prompt: 'first', workspacePath: root, timeoutMs: 1000, conversationSessionId: 'session-1' });
    await plugin.execute({ workerId: 'emp-alice', prompt: 'second', workspacePath: root, timeoutMs: 1000, conversationSessionId: 'session-1', resumeConversation: true });

    expect(recorder.calls[0].args).toContain('--session-id');
    expect(recorder.calls[0].args).toContain('session-1');
    expect(recorder.calls[1].args).toContain('--resume');
    expect(recorder.calls[1].args).toContain('session-1');
  });

  it('keeps the same project execution workspace across follow-up turns', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'se-follow-up-'));
    tempRoots.push(root);
    const target = path.join(root, 'target');
    const staging = new WorkspaceEngine(path.join(root, 'staging'));
    const contexts: Array<Record<string, any> | undefined> = [];

    const strategy: IProjectLifecycleStrategy = {
      async executeProjectLifecycle(projectId, goal, context): Promise<ProjectExecutionResult> {
        contexts.push(context);
        const state: ProjectExecutionState = {
          projectId,
          goal,
          status: 'COMPLETED',
          executionPlans: {},
          executionResults: {},
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          conversationHistory: [],
        };
        return { success: true, state, summary: `done: ${goal}`, reports: {} };
      },
    };

    const orchestrator = new ProjectLifecycleOrchestrator(strategy, undefined, staging);
    const first = await orchestrator.runProject('Build API', { absolutePath: target });
    const second = await orchestrator.continueProject(first.state.projectId, 'Add authentication');

    expect(contexts[0]?.executionWorkspacePath).toBeDefined();
    expect(contexts[1]?.executionWorkspacePath).toBe(contexts[0]?.executionWorkspacePath);
    expect(second.state.executionWorkspacePath).toBe(first.state.executionWorkspacePath);
    expect(second.state.workspacePath).toBe(first.state.workspacePath);
  });

  it('routes a worker question to a skilled specialist and feeds the answer back', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'se-worker-qa-'));
    tempRoots.push(root);
    const store = new WorkerStore();
    store.register('emp-alice', 'Alice', 'Lead Architect', 'Architecture', ['architecture']);
    store.register('emp-bob', 'Bob', 'Backend Engineer', 'Backend', ['backend', 'database']);
    const collaboration = new CollaborationEngine();
    const calls: Array<{ workerId: string; goal: string }> = [];
    const coordinator = {
      requestReasoning: async (request: any) => {
        calls.push({ workerId: request.workerId, goal: request.goal });
        if (request.workerId === 'emp-alice' && calls.filter((call) => call.workerId === 'emp-alice').length === 1) {
          return { success: true, response: { responseText: '// QUESTION_FOR: backend | Which persistence strategy should this service use?' } };
        }
        if (request.workerId === 'emp-bob') {
          return { success: true, response: { responseText: 'Use PostgreSQL with migrations.' } };
        }
        return { success: true, response: { responseText: '```ts\n// FILE: answer.txt\nPostgreSQL with migrations.\n```' } };
      },
    };
    const engine = new WorkerExecutionEngine(
      new WorkspaceEngine(path.join(root, 'staging')),
      new WorkspaceExecutionService(),
      coordinator as any,
      undefined,
      undefined,
      collaboration,
      store
    );

    const result = await engine.executeTask({
      executionId: 'exec-qa', taskId: 'task-qa', missionId: 'mission-qa', workerId: 'emp-alice',
      goal: 'Design the persistence layer', workspacePath: root,
    });

    expect(result.success).toBe(true);
    expect(calls.map((call) => call.workerId)).toEqual(['emp-alice', 'emp-bob', 'emp-alice']);
    expect(collaboration.getInbox('emp-bob').some((message) => message.messageType === 'QUESTION')).toBe(true);
    expect(collaboration.getInbox('emp-alice').some((message) => message.messageType === 'ANSWER')).toBe(true);
    expect(calls[2].goal).toContain('PostgreSQL with migrations.');
  });

  it('persists project memory across shared-memory reopen', async () => {
    const dbPath = path.join(os.tmpdir(), `se-memory-${Date.now()}.db`);
    const first = new SqliteSharedMemory(dbPath);
    await first.writeMemory({
      id: 'memory-decision-1', scope: 'PROJECT', scopeId: 'project-1', author: 'emp-alice',
      kind: 'DECISION', content: 'Use PostgreSQL migrations.', timestamp: new Date().toISOString(),
    });
    await first.close();

    const reopened = new SqliteSharedMemory(dbPath);
    const memory = await reopened.listMemory('PROJECT', 'project-1');
    await reopened.close();
    fs.rmSync(dbPath, { force: true });

    expect(memory[0]?.content).toBe('Use PostgreSQL migrations.');
  });
});
