import { IKernel } from '../contracts/ikernel';
import { ICompanyBus } from '../contracts/icompany_bus';
import { ISharedMemory } from '../contracts/ishared_memory';
import { IScheduler } from '../contracts/ischeduler';
import { IPluginRegistry } from '../contracts/iplugin_registry';
import { IEventStore } from '../contracts/ievent_store';
import { DIContainer } from '../infrastructure/di/di_container';
import { SqliteEventStore } from '../infrastructure/storage/sqlite_event_store';
import { SqliteSharedMemory } from '../infrastructure/storage/sqlite_shared_memory';
import { InMemoryCompanyBus } from '../application/company-bus/in_memory_company_bus';
import { SchedulerSkeleton } from '../application/scheduler/scheduler_skeleton';
import { PluginRegistry } from '../application/plugins/plugin_registry';
import { LocalProcessSupervisor } from '../application/runtime/local_process_supervisor';
import { TelemetryService } from '../infrastructure/telemetry/telemetry_service';
import { RuntimePluginManager } from '../application/plugins/runtime_plugin_manager';
import { MissionEngine } from '../application/missions/mission_engine';
import { ContextCompiler } from '../application/context-compiler/context_compiler';
import { WorkspaceEngine } from '../application/workspace/workspace_engine';
import { CollaborationEngine } from '../application/collaboration/collaboration_engine';
import { VerificationEngine } from '../application/verification/verification_engine';
import { MergeEngine } from '../application/verification/merge_engine';
import { MergeQueue } from '../application/verification/merge_queue';
import { DepartmentOrchestrator } from '../application/organization/department_orchestrator';
import { ExecutionPolicyEngine } from '../application/policy/execution_policy_engine';
import { AutonomousPlanner } from '../application/planning/autonomous_planner';
import { RuntimeSessionManager } from '../application/session/runtime_session_manager';
import { RuntimePluginSystemManager } from '../application/plugins/runtime_plugin_system_manager';
import { MockRuntimePlugin } from '../application/plugins/mock_runtime_plugin';
import { ReasoningCoordinator } from '../application/reasoning/reasoning_coordinator';
import { WorkspaceExecutionService } from '../application/worker/workspace_execution_service';
import { WorkerExecutionEngine } from '../application/worker/worker_execution_engine';
import { MissionDecomposer } from '../application/missions/mission_decomposer';
import { TaskAssignmentEngine } from '../application/missions/task_assignment_engine';
import { DefaultWorkerDispatcher } from '../application/missions/worker_dispatcher';
import { MissionExecutionOrchestrator } from '../application/missions/mission_execution_orchestrator';
import { DefaultProjectLifecycleStrategy } from '../application/project/project_lifecycle_strategy';
import { ProjectLifecycleOrchestrator } from '../application/project/project_lifecycle_orchestrator';
import { VerificationPipeline } from '../application/verification/verification_pipeline';
import { TelemetryAggregator } from '../application/telemetry/telemetry_aggregator';
import * as fs from 'fs';

export class Kernel implements IKernel {
  private container = new DIContainer();
  private isBooted = false;

  async boot(configPath: string): Promise<void> {
    if (this.isBooted) return;

    const dbPath = './se_company.db';
    const eventStore = new SqliteEventStore(dbPath);
    await eventStore.connect();

    const sharedMemory = new SqliteSharedMemory(dbPath);
    await sharedMemory.connect();

    const companyBus = new InMemoryCompanyBus();
    const scheduler = new SchedulerSkeleton();
    const pluginRegistry = new PluginRegistry();
    const pluginManager = new RuntimePluginManager();
    const supervisor = new LocalProcessSupervisor(eventStore);
    const telemetry = new TelemetryService();
    const contextCompiler = new ContextCompiler(sharedMemory, eventStore);
    const workspaceEngine = new WorkspaceEngine('./.se_workspaces', eventStore);
    const collaborationEngine = new CollaborationEngine(companyBus, eventStore, sharedMemory);

    const verificationEngine = new VerificationEngine(
      { enableBuild: true, enableTests: true, enableLint: true, enableTypeCheck: true, minCoveragePercent: 80 },
      eventStore
    );
    const mergeEngine = new MergeEngine(eventStore);
    const mergeQueue = new MergeQueue(eventStore);
    const departmentOrchestrator = new DepartmentOrchestrator(eventStore);
    const missionDecomposer = new MissionDecomposer(eventStore);
    const taskAssignmentEngine = new TaskAssignmentEngine(departmentOrchestrator, eventStore);
    const missionEngine = new MissionEngine(eventStore, pluginManager.getCapabilityRegistry(), departmentOrchestrator, missionDecomposer, taskAssignmentEngine);
    const policyEngine = new ExecutionPolicyEngine(eventStore);
    const sessionManager = new RuntimeSessionManager(eventStore);
    const runtimePluginSystemManager = new RuntimePluginSystemManager(eventStore);
    await runtimePluginSystemManager.loadAndRegisterPlugin(new MockRuntimePlugin());
    const reasoningCoordinator = new ReasoningCoordinator(runtimePluginSystemManager, sessionManager, eventStore);
    const autonomousPlanner = new AutonomousPlanner(eventStore, sharedMemory, policyEngine, departmentOrchestrator, undefined, reasoningCoordinator);
    const workspaceExecutionService = new WorkspaceExecutionService(eventStore);
    const workerExecutionEngine = new WorkerExecutionEngine(workspaceEngine, workspaceExecutionService, reasoningCoordinator, eventStore);
    const verificationPipeline = new VerificationPipeline(eventStore);
    const workerDispatcher = new DefaultWorkerDispatcher(workerExecutionEngine);
    const missionExecutionOrchestrator = new MissionExecutionOrchestrator(workerDispatcher, eventStore, verificationPipeline);
    const projectLifecycleStrategy = new DefaultProjectLifecycleStrategy(autonomousPlanner, missionEngine, missionExecutionOrchestrator);
    const projectLifecycleOrchestrator = new ProjectLifecycleOrchestrator(projectLifecycleStrategy, eventStore);
    const telemetryAggregator = new TelemetryAggregator(
      eventStore,
      projectLifecycleOrchestrator,
      missionExecutionOrchestrator,
      workerExecutionEngine,
      verificationPipeline
    );

    supervisor.startSupervision();

    this.container.registerSingleton<IEventStore>('IEventStore', eventStore);
    this.container.registerSingleton<ISharedMemory>('ISharedMemory', sharedMemory);
    this.container.registerSingleton<ICompanyBus>('ICompanyBus', companyBus);
    this.container.registerSingleton<IScheduler>('IScheduler', scheduler);
    this.container.registerSingleton<IPluginRegistry>('IPluginRegistry', pluginRegistry);
    this.container.registerSingleton<RuntimePluginManager>('RuntimePluginManager', pluginManager);
    this.container.registerSingleton<LocalProcessSupervisor>('LocalProcessSupervisor', supervisor);
    this.container.registerSingleton<TelemetryService>('TelemetryService', telemetry);
    this.container.registerSingleton<MissionEngine>('MissionEngine', missionEngine);
    this.container.registerSingleton<ContextCompiler>('ContextCompiler', contextCompiler);
    this.container.registerSingleton<WorkspaceEngine>('WorkspaceEngine', workspaceEngine);
    this.container.registerSingleton<CollaborationEngine>('CollaborationEngine', collaborationEngine);
    this.container.registerSingleton<VerificationEngine>('VerificationEngine', verificationEngine);
    this.container.registerSingleton<MergeEngine>('MergeEngine', mergeEngine);
    this.container.registerSingleton<MergeQueue>('MergeQueue', mergeQueue);
    this.container.registerSingleton<DepartmentOrchestrator>('DepartmentOrchestrator', departmentOrchestrator);
    this.container.registerSingleton<ExecutionPolicyEngine>('ExecutionPolicyEngine', policyEngine);
    this.container.registerSingleton<AutonomousPlanner>('AutonomousPlanner', autonomousPlanner);
    this.container.registerSingleton<RuntimeSessionManager>('RuntimeSessionManager', sessionManager);
    this.container.registerSingleton<RuntimePluginSystemManager>('RuntimePluginSystemManager', runtimePluginSystemManager);
    this.container.registerSingleton<ReasoningCoordinator>('ReasoningCoordinator', reasoningCoordinator);
    this.container.registerSingleton<WorkspaceExecutionService>('WorkspaceExecutionService', workspaceExecutionService);
    this.container.registerSingleton<WorkerExecutionEngine>('WorkerExecutionEngine', workerExecutionEngine);
    this.container.registerSingleton<MissionDecomposer>('MissionDecomposer', missionDecomposer);
    this.container.registerSingleton<TaskAssignmentEngine>('TaskAssignmentEngine', taskAssignmentEngine);
    this.container.registerSingleton<DefaultWorkerDispatcher>('WorkerDispatcher', workerDispatcher);
    this.container.registerSingleton<MissionExecutionOrchestrator>('MissionExecutionOrchestrator', missionExecutionOrchestrator);
    this.container.registerSingleton<DefaultProjectLifecycleStrategy>('ProjectLifecycleStrategy', projectLifecycleStrategy);
    this.container.registerSingleton<ProjectLifecycleOrchestrator>('ProjectLifecycleOrchestrator', projectLifecycleOrchestrator);
    this.container.registerSingleton<VerificationPipeline>('VerificationPipeline', verificationPipeline);
    this.container.registerSingleton<TelemetryAggregator>('TelemetryAggregator', telemetryAggregator);

    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.employees && Array.isArray(parsed.employees)) {
          for (const emp of parsed.employees) {
            supervisor.spawnWorker({
              id: emp.id || `emp-${emp.name}`,
              name: emp.name,
              role: emp.role,
              department: emp.department || 'Engineering',
              executable: process.execPath,
              args: ['-e', 'setInterval(() => {}, 1000)'],
              tmuxPaneIndex: emp.tmuxPaneIndex || 1,
            });
          }
        }
      } catch (err) {
        this.loadDefaultWorkforce(supervisor);
      }
    } else {
      this.loadDefaultWorkforce(supervisor);
    }

    this.isBooted = true;
  }

  private loadDefaultWorkforce(supervisor: LocalProcessSupervisor): void {
    supervisor.spawnWorker({ id: 'emp-alice', name: 'Alice', role: 'Lead Architect', department: 'Architecture', executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], tmuxPaneIndex: 1 });
    supervisor.spawnWorker({ id: 'emp-bob', name: 'Bob', role: 'Backend Engineer', department: 'Backend Engineering', executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], tmuxPaneIndex: 2 });
    supervisor.spawnWorker({ id: 'emp-charlie', name: 'Charlie', role: 'QA Engineer', department: 'Quality Assurance', executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], tmuxPaneIndex: 3 });
  }

  async shutdown(signal?: string): Promise<void> {
    if (!this.isBooted) return;

    const supervisor = this.container.resolve<LocalProcessSupervisor>('LocalProcessSupervisor');
    supervisor.stopSupervision();
    for (const w of supervisor.getRegistry().list()) {
      supervisor.stopWorker(w.metadata.id);
    }

    const sessionManager = this.container.resolve<RuntimeSessionManager>('RuntimeSessionManager');
    sessionManager.shutdown();

    const eventStore = this.container.resolve<SqliteEventStore>('IEventStore');
    await eventStore.close();

    const sharedMemory = this.container.resolve<SqliteSharedMemory>('ISharedMemory');
    await sharedMemory.close();

    this.isBooted = false;
  }

  getSharedMemory(): ISharedMemory {
    return this.container.resolve<ISharedMemory>('ISharedMemory');
  }

  getCompanyBus(): ICompanyBus {
    return this.container.resolve<ICompanyBus>('ICompanyBus');
  }

  getScheduler(): IScheduler {
    return this.container.resolve<IScheduler>('IScheduler');
  }

  getPluginRegistry(): IPluginRegistry {
    return this.container.resolve<IPluginRegistry>('IPluginRegistry');
  }

  getEventStore(): IEventStore {
    return this.container.resolve<IEventStore>('IEventStore');
  }

  getSupervisor(): LocalProcessSupervisor {
    return this.container.resolve<LocalProcessSupervisor>('LocalProcessSupervisor');
  }

  getPluginManager(): RuntimePluginManager {
    return this.container.resolve<RuntimePluginManager>('RuntimePluginManager');
  }

  getMissionEngine(): MissionEngine {
    return this.container.resolve<MissionEngine>('MissionEngine');
  }

  getContextCompiler(): ContextCompiler {
    return this.container.resolve<ContextCompiler>('ContextCompiler');
  }

  getWorkspaceEngine(): WorkspaceEngine {
    return this.container.resolve<WorkspaceEngine>('WorkspaceEngine');
  }

  getCollaborationEngine(): CollaborationEngine {
    return this.container.resolve<CollaborationEngine>('CollaborationEngine');
  }

  getVerificationEngine(): VerificationEngine {
    return this.container.resolve<VerificationEngine>('VerificationEngine');
  }

  getMergeEngine(): MergeEngine {
    return this.container.resolve<MergeEngine>('MergeEngine');
  }

  getMergeQueue(): MergeQueue {
    return this.container.resolve<MergeQueue>('MergeQueue');
  }

  getDepartmentOrchestrator(): DepartmentOrchestrator {
    return this.container.resolve<DepartmentOrchestrator>('DepartmentOrchestrator');
  }

  getExecutionPolicyEngine(): ExecutionPolicyEngine {
    return this.container.resolve<ExecutionPolicyEngine>('ExecutionPolicyEngine');
  }

  getAutonomousPlanner(): AutonomousPlanner {
    return this.container.resolve<AutonomousPlanner>('AutonomousPlanner');
  }

  getRuntimeSessionManager(): RuntimeSessionManager {
    return this.container.resolve<RuntimeSessionManager>('RuntimeSessionManager');
  }

  getRuntimePluginSystemManager(): RuntimePluginSystemManager {
    return this.container.resolve<RuntimePluginSystemManager>('RuntimePluginSystemManager');
  }

  getReasoningCoordinator(): ReasoningCoordinator {
    return this.container.resolve<ReasoningCoordinator>('ReasoningCoordinator');
  }

  getWorkspaceExecutionService(): WorkspaceExecutionService {
    return this.container.resolve<WorkspaceExecutionService>('WorkspaceExecutionService');
  }

  getWorkerExecutionEngine(): WorkerExecutionEngine {
    return this.container.resolve<WorkerExecutionEngine>('WorkerExecutionEngine');
  }

  getMissionDecomposer(): MissionDecomposer {
    return this.container.resolve<MissionDecomposer>('MissionDecomposer');
  }

  getTaskAssignmentEngine(): TaskAssignmentEngine {
    return this.container.resolve<TaskAssignmentEngine>('TaskAssignmentEngine');
  }

  getWorkerDispatcher(): DefaultWorkerDispatcher {
    return this.container.resolve<DefaultWorkerDispatcher>('WorkerDispatcher');
  }

  getMissionExecutionOrchestrator(): MissionExecutionOrchestrator {
    return this.container.resolve<MissionExecutionOrchestrator>('MissionExecutionOrchestrator');
  }

  getProjectLifecycleStrategy(): DefaultProjectLifecycleStrategy {
    return this.container.resolve<DefaultProjectLifecycleStrategy>('ProjectLifecycleStrategy');
  }

  getProjectLifecycleOrchestrator(): ProjectLifecycleOrchestrator {
    return this.container.resolve<ProjectLifecycleOrchestrator>('ProjectLifecycleOrchestrator');
  }

  getVerificationPipeline(): VerificationPipeline {
    return this.container.resolve<VerificationPipeline>('VerificationPipeline');
  }

  getTelemetryAggregator(): TelemetryAggregator {
    return this.container.resolve<TelemetryAggregator>('TelemetryAggregator');
  }

  getTelemetry(): TelemetryService {
    return this.container.resolve<TelemetryService>('TelemetryService');
  }

  isReady(): boolean {
    return this.isBooted;
  }
}
