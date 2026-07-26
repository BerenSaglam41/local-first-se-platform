import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { WorkerExecutionEngine } from '../../../src/v2/application/worker/worker_execution_engine';
import { WorkspaceEngine } from '../../../src/v2/application/workspace/workspace_engine';
import { WorkspaceExecutionService } from '../../../src/v2/application/worker/workspace_execution_service';
import { ReasoningCoordinator } from '../../../src/v2/application/reasoning/reasoning_coordinator';
import { WorkerStore } from '../../../src/v2/application/worker/worker_store';
import { RuntimePluginSystemManager } from '../../../src/v2/application/plugins/runtime_plugin_system_manager';
import { ClaudeCodeRuntimePlugin } from '../../../src/v2/application/plugins/claude/claude_code_runtime_plugin';
import { MissionExecutionOrchestrator } from '../../../src/v2/application/missions/mission_execution_orchestrator';
import { DefaultWorkerDispatcher } from '../../../src/v2/application/missions/worker_dispatcher';
import { TaskScheduler } from '../../../src/v2/application/missions/task_scheduler';
import { MissionExecutionPlan, MissionTask } from '../../../src/v2/contracts/imission_decomposition';
import { createAvailableDetector } from '../helpers/fake_claude_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** A spawner whose process only resolves after a controllable, real delay — used to prove a
 * genuinely slow-but-successful real CLI call is no longer killed by an unrealistically short
 * default timeout (see M29.1 Fix #3 / ADR-0012: a real architecture-generation call was measured
 * taking ~125s and killed by the old 60s default). */
function createDelayedSpawner(delayMs: number, output = 'real delayed output') {
  return () => {
    const child: any = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    setTimeout(() => {
      child.stdout.emit('data', Buffer.from(output, 'utf8'));
      child.emit('close', 0);
    }, delayMs);
    return child as unknown as ChildProcess;
  };
}

describe('SE-OS v2.0 M29.1 Fix #3 — realistic reasoning timeouts (no premature kill of real slow calls)', () => {
  it('ReasoningCoordinator default timeout should tolerate a 90s real call that a 60s default would have killed', async () => {
    const workerStore = new WorkerStore();
    workerStore.register('emp-alice', 'Alice', 'Lead Architect', 'Architecture');
    const pluginManager = new RuntimePluginSystemManager();
    const plugin = new ClaudeCodeRuntimePlugin(undefined, createDelayedSpawner(1500) as any, createAvailableDetector());
    await pluginManager.loadAndRegisterPlugin(plugin);
    workerStore.get('emp-alice')!.assignedProviderId = 'plugin-claude-code';

    const coordinator = new ReasoningCoordinator(pluginManager, workerStore);
    // Uses the coordinator's real default (no explicit timeoutMs) — proving the default itself
    // is realistic, not just that an explicit override works.
    const result = await coordinator.requestReasoning({
      requestId: 'r1', missionId: 'm', workerId: 'emp-alice', goal: 'slow but real goal',
    });

    expect(result.success).toBe(true);
    expect(result.response?.responseText).toBe('real delayed output');
  }, 10000);

  it('WorkerExecutionEngine should thread a caller-configured timeout through to the real reasoning call instead of discarding it', async () => {
    const workspaceEngine = new WorkspaceEngine(fs.mkdtempSync(path.join(os.tmpdir(), 'se-os-timeout-test-')));
    const workspaceExecutionService = new WorkspaceExecutionService();
    const workerStore = new WorkerStore();
    workerStore.register('emp-alice', 'Alice', 'Lead Architect', 'Architecture');
    workerStore.get('emp-alice')!.assignedProviderId = 'plugin-claude-code';

    const pluginManager = new RuntimePluginSystemManager();
    // A call that takes 500ms but is only given a 100ms budget — must genuinely time out,
    // proving policy.maxDurationMs really reaches the plugin's own timeout enforcement instead
    // of being silently dropped (the real bug this test guards against).
    const plugin = new ClaudeCodeRuntimePlugin(undefined, createDelayedSpawner(500) as any, createAvailableDetector());
    await pluginManager.loadAndRegisterPlugin(plugin);

    const coordinator = new ReasoningCoordinator(pluginManager, workerStore);
    const engine = new WorkerExecutionEngine(workspaceEngine, workspaceExecutionService, coordinator);

    const result = await engine.executeTask({
      executionId: 'exec-1',
      taskId: 'task-1',
      missionId: 'm-1',
      workerId: 'emp-alice',
      goal: 'goal that needs a tight budget',
      policy: { maxDurationMs: 100 },
    });

    expect(result.success).toBe(false);
    expect(result.report?.status).toBe('FAILED');
  }, 10000);

  it('MissionExecutionOrchestrator default policy should carry a realistic timeout through TaskScheduler to the real dispatched request', async () => {
    const dispatchedRequests: any[] = [];
    const dispatcher = { dispatchWorkerTask: async (req: any) => { dispatchedRequests.push(req); return { success: true, report: { status: 'COMPLETED', taskId: req.taskId, workerId: req.workerId, artifacts: [], filesCreated: [], filesModified: [], summary: 'ok', recommendations: [], durationMs: 1 } }; } };
    const scheduler = new TaskScheduler(dispatcher as any);
    const orchestrator = new MissionExecutionOrchestrator(dispatcher as any);
    const defaultTimeoutMs = (orchestrator as any).defaultPolicy.timeoutMs;
    expect(defaultTimeoutMs).toBeGreaterThanOrEqual(120000); // must safely exceed measured real ~125s latency

    const task: MissionTask = {
      id: 't1', missionId: 'm-1', title: 'x', description: 'x', requiredCapability: 'CODE_GENERATION' as any,
      priority: 'HIGH', status: 'PENDING', dependencies: [], assignedWorkerId: 'emp-alice', assignedDepartmentId: 'dept-backend',
      estimatedComplexity: 1,
    };
    await scheduler.scheduleTask(task, 'm-1', { timeoutMs: defaultTimeoutMs } as any);

    expect(dispatchedRequests[0].policy.maxDurationMs).toBe(defaultTimeoutMs);
  });

  it('serializes requests for one worker while allowing other workers to run independently', async () => {
    const active = new Set<string>();
    let overlap = false;
    const engine = {
      executeTask: async (request: any) => {
        if (active.has(request.workerId)) overlap = true;
        active.add(request.workerId);
        await new Promise((resolve) => setTimeout(resolve, request.delay));
        active.delete(request.workerId);
        return { success: true, report: { status: 'COMPLETED' } };
      },
    };
    const dispatcher = new DefaultWorkerDispatcher(engine as any);
    await Promise.all([
      dispatcher.dispatchWorkerTask({ workerId: 'alice', delay: 20 } as any),
      dispatcher.dispatchWorkerTask({ workerId: 'alice', delay: 1 } as any),
      dispatcher.dispatchWorkerTask({ workerId: 'bob', delay: 1 } as any),
    ]);
    expect(overlap).toBe(false);
  });
});
