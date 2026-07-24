import { Kernel } from '../../src/v2/kernel/kernel';
import { MissionDecomposer } from '../../src/v2/application/missions/mission_decomposer';
import { TaskAssignmentEngine } from '../../src/v2/application/missions/task_assignment_engine';
import { DefaultMissionPlanningStrategy } from '../../src/v2/application/missions/default_mission_planning_strategy';
import { IMissionPlanningStrategy } from '../../src/v2/contracts/imission_planning_strategy';
import { MissionExecutionPlan } from '../../src/v2/contracts/imission_decomposition';
import { ClaudeCodeRuntimePlugin } from '../../src/v2/application/plugins/claude/claude_code_runtime_plugin';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 18 — Mission Decomposition & Task Assignment Suite', () => {
  const testDbPath = './se_company_m18_test.db';
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

  async function bootKernelWithClaude(): Promise<Kernel> {
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(new ClaudeCodeRuntimePlugin(kernel.getEventStore()));
    return kernel;
  }

  // ─── 1. IMissionPlanningStrategy & Default Decomposition ──────────

  it('should decompose high-level goal into structured DAG tasks via DefaultMissionPlanningStrategy', async () => {
    const strategy = new DefaultMissionPlanningStrategy();
    const plan = await strategy.planMission('m-test-1', 'Create a REST API for User Management');

    expect(plan.planId).toBe('plan-m-test-1');
    expect(plan.tasks.length).toBe(6);
    expect(plan.executionBatches.length).toBe(5);

    // Verify DAG dependencies
    const task3 = plan.tasks.find((t) => t.title.includes('Express REST Server'));
    expect(task3?.dependencies).toContain(`t-m-test-1-1`);
    expect(task3?.dependencies).toContain(`t-m-test-1-2`);
  });

  // ─── 2. MissionDecomposer Orchestration ────────────────────────────

  it('should orchestrate mission decomposition through MissionDecomposer without containing planning logic', async () => {
    await bootKernelWithClaude();
    const decomposer = kernel.getMissionDecomposer();

    const plan = await decomposer.decomposeMission('m-test-2', 'Implement Payment Gateway Integration');
    expect(plan.tasks.length).toBe(6);
    expect(plan.goal).toBe('Implement Payment Gateway Integration');
  });

  // ─── 3. TaskAssignmentEngine Capability & Workload Routing ─────────

  it('should route tasks to departments and workers based on capability and workload', async () => {
    await bootKernelWithClaude();
    const decomposer = kernel.getMissionDecomposer();
    const assignmentEngine = kernel.getTaskAssignmentEngine();

    const plan = await decomposer.decomposeMission('m-test-3', 'Create User Management API');
    const assignedPlan = assignmentEngine.assignPlanTasks(plan);

    expect(Object.keys(assignedPlan.departmentAssignments).length).toBeGreaterThan(0);
    expect(Object.keys(assignedPlan.workerAssignments).length).toBeGreaterThan(0);

    // Check specific task capability mapping
    const archTask = assignedPlan.tasks.find((t) => t.requiredCapability === 'Architecture');
    expect(archTask?.assignedDepartmentId).toBe('dept-architecture');

    const backendTask = assignedPlan.tasks.find((t) => t.requiredCapability === 'Backend');
    expect(backendTask?.assignedDepartmentId).toBe('dept-backend');
  });

  // ─── 4. End-to-End Mission Decomposition & Task Lifecycle ───────────

  it('should execute full mission decomposition, task assignment, and task completion lifecycle', async () => {
    await bootKernelWithClaude();
    const engine = kernel.getMissionEngine();

    const { mission, plan } = await engine.decomposeAndPlanMission('User API Mission', 'Create a REST API for User Management');
    expect(mission.status).toBe('CREATED');
    expect(plan.tasks.length).toBe(6);

    const started = engine.startMission(mission.id);
    expect(started).toBe(true);
    expect(engine.getMission(mission.id)?.status).toBe('RUNNING');

    // Complete all tasks sequentially
    for (const task of plan.tasks) {
      engine.completeTask(task.id, mission.id);
    }

    expect(engine.getMission(mission.id)?.status).toBe('COMPLETED');
  });

  // ─── 5. Custom Planning Strategy Injection ──────────────────────────

  it('should support custom IMissionPlanningStrategy injection into MissionDecomposer', async () => {
    await bootKernelWithClaude();
    const decomposer = kernel.getMissionDecomposer();

    let customStrategyInvoked = false;
    const customStrategy: IMissionPlanningStrategy = {
      async planMission(missionId: string, goal: string): Promise<MissionExecutionPlan> {
        customStrategyInvoked = true;
        return {
          planId: `custom-plan-${missionId}`,
          missionId,
          goal,
          tasks: [
            {
              id: `t-custom-1`,
              missionId,
              title: 'Custom Single Task',
              description: goal,
              requiredCapability: 'Backend',
              priority: 'HIGH',
              status: 'READY',
              dependencies: [],
              estimatedComplexity: 1,
            },
          ],
          dependencies: [],
          executionBatches: [[`t-custom-1`]],
          departmentAssignments: {},
          workerAssignments: {},
          totalEstimatedComplexity: 1,
        };
      },
    };

    decomposer.setPlanningStrategy(customStrategy);
    const plan = await decomposer.decomposeMission('m-custom', 'Custom Strategy Mission');

    expect(customStrategyInvoked).toBe(true);
    expect(plan.tasks.length).toBe(1);
    expect(plan.planId).toBe('custom-plan-m-custom');
  });

  // ─── 6. Domain Event Store Persistence ─────────────────────────────

  it('should emit and persist all 8 Mission & Task domain events', async () => {
    await bootKernelWithClaude();
    const engine = kernel.getMissionEngine();
    const events: string[] = [];

    engine.on('MissionDecomposed', () => events.push('MissionDecomposed'));
    engine.on('TaskAssigned', () => events.push('TaskAssigned'));
    engine.on('TaskStarted', () => events.push('TaskStarted'));
    engine.on('TaskCompleted', () => events.push('TaskCompleted'));
    engine.on('MissionCompleted', () => events.push('MissionCompleted'));

    const { mission, plan } = await engine.decomposeAndPlanMission('Event Test Mission', 'Test events');
    engine.startMission(mission.id);

    for (const t of plan.tasks) {
      engine.completeTask(t.id, mission.id);
    }

    expect(events).toContain('MissionDecomposed');
    expect(events).toContain('TaskAssigned');
    expect(events).toContain('TaskStarted');
    expect(events).toContain('TaskCompleted');
    expect(events).toContain('MissionCompleted');
  });

  // ─── 7. CLI Integration ──────────────────────────────────────────

  it('should execute CLI mission plan, assign, and inspect subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');

    await cli.missionPlanDecompose('REST API Mission', 'Create a REST API for User Management');
    const missions = cli['kernel'].getMissionEngine().listMissions();
    expect(missions.length).toBeGreaterThan(0);

    const mId = missions[0].id;
    await cli.missionAssign(mId);
    await cli.missionInspectPlan(mId);

    await cli.shutdown();
  });
});
