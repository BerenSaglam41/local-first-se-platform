import { Kernel } from '../../src/v2/kernel/kernel';
import { DepartmentOrchestrator } from '../../src/v2/application/organization/department_orchestrator';
import { WorkerStore } from '../../src/v2/application/worker/worker_store';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { createFakeClaudeSpawner, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 10 — Department Orchestrator Suite', () => {
  const testDbPath = './se_company_m10_test.db';
  let kernel: Kernel;
  let workerStore: WorkerStore;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    kernel = new Kernel();
    workerStore = new WorkerStore();
    workerStore.register('emp-bob', 'Bob', 'Backend Engineer', 'Backend');
  });

  afterEach(async () => {
    if (kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('should initialize organizational chart with standard departments', () => {
    const orchestrator = new DepartmentOrchestrator(workerStore);
    const depts = orchestrator.listDepartments();

    expect(depts.length).toBe(7);
    const types = depts.map((d) => d.type);
    expect(types).toContain('Backend');
    expect(types).toContain('Frontend');
    expect(types).toContain('QA');
    expect(types).toContain('DevOps');
    expect(types).toContain('Architecture');
    expect(types).toContain('Documentation');
    expect(types).toContain('Research');
  });

  it('should route tasks to departments based on required capabilities', () => {
    const orchestrator = new DepartmentOrchestrator(workerStore);

    const deptArch = orchestrator.routeTaskToDepartment(['ARCHITECTURE']);
    expect(deptArch.type).toBe('Architecture');

    const deptQA = orchestrator.routeTaskToDepartment(['TEST_GENERATION', 'CODE_REVIEW']);
    expect(deptQA.type).toBe('QA');

    const deptBackend = orchestrator.routeTaskToDepartment(['CODE_GENERATION']);
    expect(deptBackend.type).toBe('Backend');
  });

  it('should derive department membership live from WorkerStore, not a stale roster', () => {
    const orchestrator = new DepartmentOrchestrator(workerStore);

    const selected = orchestrator.selectWorkerForTask('dept-backend');
    expect(selected?.workerId).toBe('emp-bob');

    // A second, idle backend worker should be preferred over one that's currently busy.
    workerStore.register('emp-bob2', 'Bobby', 'Backend Engineer', 'Backend');
    workerStore.get('emp-bob')!.beginExecution({
      executionId: 'e1', requestId: 'r1', taskId: 't1', goal: 'g', pluginId: 'p', startedAt: new Date().toISOString(),
    });

    const secondSelection = orchestrator.selectWorkerForTask('dept-backend');
    expect(secondSelection?.workerId).toBe('emp-bob2');
  });

  it('should calculate department performance metrics from real worker history', () => {
    const orchestrator = new DepartmentOrchestrator(workerStore);
    const worker = workerStore.get('emp-bob')!;
    worker.beginExecution({ executionId: 'e1', requestId: 'r1', taskId: 't1', goal: 'g', pluginId: 'p', startedAt: new Date().toISOString() });
    worker.completeExecution('COMPLETED', { durationMs: 10 });

    const metrics = orchestrator.getDepartmentMetrics('dept-backend');

    expect(metrics.departmentId).toBe('dept-backend');
    expect(metrics.completedTasksCount).toBe(1);
    expect(metrics.throughputPerDay).toBeGreaterThan(0);
  });

  it('should execute CLI department subcommands cleanly', async () => {
    const cli = new SeOsCli(createSafeTestProviderOverrides());
    await cli.boot('./non_existent_config.json');
    await cli.departmentsList();
    await cli.departmentsStatus('dept-backend');
    await cli.departmentAssign('task-99', 'dept-backend');
    await cli.departmentMetrics('dept-backend');
    await cli.shutdown();
  });
});
