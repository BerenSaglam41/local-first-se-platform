import { Kernel } from '../../src/v2/kernel/kernel';
import { MissionEngine } from '../../src/v2/application/missions/mission_engine';
import { TaskGraph } from '../../src/v2/application/missions/task_graph';
import { Task } from '../../src/v2/domain/missions/mission_models';
import { SqliteEventStore } from '../../src/v2/infrastructure/storage/sqlite_event_store';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { createFakeClaudeSpawner, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 5 — Mission Engine & Task Orchestration Suite', () => {
  const testDbPath = './se_company_m5_test.db';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should create mission and generate valid DAG task graph', async () => {
    await kernel.boot('./non_existent_config.json');
    const engine = kernel.getMissionEngine();

    const mission = engine.createMission('Auth Refactor', 'Refactor authentication module with JWT');

    expect(mission).toBeDefined();
    expect(mission.status).toBe('CREATED');

    const graph = engine.getTaskGraph(mission.id);
    expect(graph).toBeDefined();

    const tasks = graph!.getAllTasks();
    expect(tasks.length).toBe(4);
    expect(tasks[0].requiredCapabilities).toContain('ARCHITECTURE');
    expect(tasks[1].requiredCapabilities).toContain('CODE_GENERATION');
    expect(tasks[2].requiredCapabilities).toContain('TEST_GENERATION');
    expect(tasks[3].requiredCapabilities).toContain('CODE_REVIEW');
  });

  it('should resolve dependencies and calculate topological execution batches', () => {
    const graph = new TaskGraph();

    const t1: Task = { id: 't1', missionId: 'm1', title: 'Arch', objective: 'Arch', targetFiles: [], requiredCapabilities: ['ARCHITECTURE'], priority: 'P0', status: 'BACKLOG', dependsOnTaskIds: [], retryCount: 0 };
    const t2: Task = { id: 't2', missionId: 'm1', title: 'Impl A', objective: 'Impl', targetFiles: [], requiredCapabilities: ['CODE_GENERATION'], priority: 'P1', status: 'BACKLOG', dependsOnTaskIds: ['t1'], retryCount: 0 };
    const t3: Task = { id: 't3', missionId: 'm1', title: 'Impl B', objective: 'Impl', targetFiles: [], requiredCapabilities: ['CODE_GENERATION'], priority: 'P1', status: 'BACKLOG', dependsOnTaskIds: ['t1'], retryCount: 0 };
    const t4: Task = { id: 't4', missionId: 'm1', title: 'Test', objective: 'Test', targetFiles: [], requiredCapabilities: ['TEST_GENERATION'], priority: 'P1', status: 'BACKLOG', dependsOnTaskIds: ['t2', 't3'], retryCount: 0 };

    graph.addTask(t1);
    graph.addTask(t2);
    graph.addTask(t3);
    graph.addTask(t4);

    expect(graph.detectCycle()).toBe(false);

    const batches = graph.getExecutionBatches();
    expect(batches.length).toBe(3);
    expect(batches[0].taskIds).toEqual(['t1']);
    expect(batches[1].taskIds.sort()).toEqual(['t2', 't3'].sort());
    expect(batches[2].taskIds).toEqual(['t4']);
  });

  it('should detect cyclic dependencies in task graph', () => {
    const graph = new TaskGraph();

    const t1: Task = { id: 't1', missionId: 'm1', title: 'T1', objective: 'T1', targetFiles: [], requiredCapabilities: ['CODE_GENERATION'], priority: 'P1', status: 'BACKLOG', dependsOnTaskIds: ['t2'], retryCount: 0 };
    const t2: Task = { id: 't2', missionId: 'm1', title: 'T2', objective: 'T2', targetFiles: [], requiredCapabilities: ['CODE_GENERATION'], priority: 'P1', status: 'BACKLOG', dependsOnTaskIds: ['t1'], retryCount: 0 };

    graph.addTask(t1);
    graph.addTask(t2);

    expect(graph.detectCycle()).toBe(true);
    expect(() => graph.getExecutionBatches()).toThrow('Cyclic dependency detected');
  });

  it('should transition mission states through complete lifecycle', async () => {
    await kernel.boot('./non_existent_config.json');
    const engine = kernel.getMissionEngine();

    const m = engine.createMission('Payment Gateway', 'Build Stripe integration');

    expect(engine.startMission(m.id)).toBe(true);
    expect(engine.getMission(m.id)?.status).toBe('RUNNING');

    expect(engine.pauseMission(m.id)).toBe(true);
    expect(engine.getMission(m.id)?.status).toBe('PAUSED');

    expect(engine.resumeMission(m.id)).toBe(true);
    expect(engine.getMission(m.id)?.status).toBe('RUNNING');

    expect(engine.completeMission(m.id)).toBe(true);
    expect(engine.getMission(m.id)?.status).toBe('COMPLETED');
  });

  it('should execute CLI mission subcommands cleanly', async () => {
    const cli = new SeOsCli(createSafeTestProviderOverrides());
    await cli.boot('./non_existent_config.json');
    await cli.missionCreate('CLI Mission', 'Test CLI commands');
    const list = (cli as any).kernel.getMissionEngine().listMissions();
    const mId = list[0].id;

    await cli.missionStart(mId);
    await cli.missionStatus(mId);
    await cli.missionGraph(mId);
    await cli.tasks();
    await cli.missionPause(mId);
    await cli.missionResume(mId);
    await cli.shutdown();
  });
});
