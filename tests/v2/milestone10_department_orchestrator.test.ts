import { Kernel } from '../../src/v2/kernel/kernel';
import { DepartmentOrchestrator } from '../../src/v2/application/organization/department_orchestrator';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 10 — Department Orchestrator Suite', () => {
  const testDbPath = './se_company_m10_test.db';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('should initialize organizational chart with standard departments', () => {
    const orchestrator = new DepartmentOrchestrator();
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
    const orchestrator = new DepartmentOrchestrator();

    const deptArch = orchestrator.routeTaskToDepartment(['ARCHITECTURE']);
    expect(deptArch.type).toBe('Architecture');

    const deptQA = orchestrator.routeTaskToDepartment(['TEST_GENERATION', 'CODE_REVIEW']);
    expect(deptQA.type).toBe('QA');

    const deptBackend = orchestrator.routeTaskToDepartment(['CODE_GENERATION']);
    expect(deptBackend.type).toBe('Backend');
  });

  it('should load balance worker assignment within department', () => {
    const orchestrator = new DepartmentOrchestrator();

    const member1 = orchestrator.selectWorkerForTask('dept-backend');
    expect(member1?.workerId).toBe('emp-bob');
    expect(member1?.activeTasksCount).toBe(1);
  });

  it('should calculate department performance metrics', () => {
    const orchestrator = new DepartmentOrchestrator();

    const metrics = orchestrator.getDepartmentMetrics('dept-backend');

    expect(metrics.departmentId).toBe('dept-backend');
    expect(metrics.completedTasksCount).toBeGreaterThan(0);
    expect(metrics.throughputPerDay).toBeGreaterThan(0);
  });

  it('should execute CLI department subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');
    await cli.departmentsList();
    await cli.departmentsStatus('dept-backend');
    await cli.departmentAssign('task-99', 'dept-backend');
    await cli.departmentMetrics('dept-backend');
    await cli.shutdown();
  });
});
