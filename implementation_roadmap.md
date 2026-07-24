# SE-OS v2.0 — Implementation Roadmap

> **AUTHOR**: Chief Technology Officer (SE-OS Platform Team)  
> **STATUS**: Production Milestone Roadmap  
> **SCOPE**: Sequence of Implementation Phases, Deliverables, Dependencies, Complexity & Acceptance Criteria  

---

## Milestone Summary

```
[Milestone 0: Skeleton & Kernel Contracts] ──> COMPLETED
                    │
                    ▼
[Milestone 1: Kernel Domain & Event Store] ──> COMPLETED
                    │
                    ▼
[Milestone 2: Local Process Runtime & PTY Engine] ──> COMPLETED
                    │
                    ▼
[Milestone 3: Runtime Plugin Framework] ──> COMPLETED
                    │
                    ▼
[Milestone 4: Claude CLI Reference Runtime Plugin] ──> COMPLETED
                    │
                    ▼
[Milestone 5: Mission Engine & Task Orchestration] ──> COMPLETED
                    │
                    ▼
[Milestone 6: Context Compiler & Workspace Engine] ──> COMPLETED
                    │
                    ▼
[Milestone 7: Git Worktree Isolation & Multi-Workspace Execution] ──> COMPLETED
                    │
                    ▼
[Milestone 8: Multi-Agent Collaboration Engine] ──> COMPLETED
                    │
                    ▼
[Milestone 9: Verification & Merge Engine] ──> COMPLETED
                    │
                    ▼
[Milestone 10: Department Orchestrator & Organizational Hierarchy] ──> COMPLETED
                    │
                    ▼
[Milestone 11: Cost Optimization & Execution Policy Engine] ──> COMPLETED
                    │
                    ▼
[Milestone 12: Autonomous Planning & Reasoning Engine] ──> COMPLETED
                    │
                    ▼
[Milestone 13: Runtime Session Manager] ──> COMPLETED
                    │
                    ▼
[Milestone 14: Runtime Plugin System & Local CLI Integration] ──> COMPLETED
                    │
                    ▼
[Milestone 15: Claude Code Runtime Plugin (First Real AI Integration)] ──> COMPLETED
                    │
                    ▼
[Milestone 16: Runtime Reasoning Pipeline] ──> COMPLETED
                    │
                    ▼
[Milestone 17: Autonomous Worker Execution] ──> COMPLETED
                    │
                    ▼
[Milestone 18: Mission Decomposition & Task Assignment] ──> COMPLETED
                    │
                    ▼
[Milestone 19: Mission Execution Orchestrator] ──> COMPLETED
                    │
                    ▼
[Milestone 20: Autonomous Project Lifecycle Orchestrator] ──> COMPLETED
                    │
                    ▼
[Milestone 21: Verification Pipeline] ──> COMPLETED
                    │
                    ▼
[Milestone 22: Mission Control Dashboard] ──> COMPLETED
                    │
                    ▼
[Milestone 23: Core TUI Framework & Telemetry Layer] ──> COMPLETED
                    │
                    ▼
[Vertical Slice 1: End-to-End Autonomous Project Execution] ──> COMPLETED
                    │
                    ▼
[Milestone 24: Execution Screen]
                    │
                    ▼
[Milestone 25: Workspace Viewer & AI Session]
                    │
                    ▼
[Milestone 26: Command Palette, Focus Mode & Event Control]
```

---

### Milestone 0: Project Skeleton & Kernel Contracts (COMPLETED)
- **Objective**: Build complete v2.0 folder structure, public contracts, in-memory skeletons, and DI container.
- **Deliverables**:
  - `src/v2/contracts/` (`IKernel`, `ICompanyBus`, `ISharedMemory`, `IScheduler`, `IWorkerRuntime`, `IContextCompiler`, `IPluginRegistry`, `IEventStore`, `IAIAdapter`)
  - `src/v2/infrastructure/di/di_container.ts`
  - `src/v2/application/plugins/plugin_registry.ts`
  - `src/v2/domain/events/in_memory_event_store.ts`
  - `src/v2/application/company-bus/in_memory_company_bus.ts`
  - `tests/v2/milestone0.test.ts`
- **Dependencies**: Architecture Freeze
- **Complexity**: Low
- **Acceptance Criteria**: 100% compilation, 21/21 test suites passing cleanly, zero AI provider dependency.

---

### Milestone 1: Kernel Domain & Event Store (COMPLETED)
- **Objective**: Implement real Kernel bootstrap, Process Supervisor, SQLite Event Store, SQLite Shared Memory, Telemetry Engine, and CLI.
- **Deliverables**:
  - `src/v2/kernel/kernel.ts`
  - `src/v2/infrastructure/storage/sqlite_event_store.ts`
  - `src/v2/infrastructure/storage/sqlite_shared_memory.ts`
  - `src/v2/application/runtime/process_supervisor.ts`
  - `src/v2/infrastructure/telemetry/telemetry_service.ts`
  - `src/v2/cli/se_os_cli.ts`
  - `tests/v2/milestone1_kernel.test.ts`
- **Dependencies**: Milestone 0
- **Complexity**: Medium
- **Acceptance Criteria**: Kernel boots, ProcessSupervisor spawns/stops/restarts workers, SQLite persists events & ADRs, CLI executes `boot`/`status`/`workers`/`shutdown` cleanly with zero AI provider code.

---

### Milestone 2: Local Process Runtime & PTY Engine (COMPLETED)
- **Objective**: Implement real local process runtime using `child_process.spawn()`, PTY engine abstraction, extracted `WorkerRegistry`, `TmuxIntegration` abstraction, extended telemetry, and CLI `ps`/`worker` commands.
- **Deliverables**:
  - `src/v2/application/runtime/worker_registry.ts`
  - `src/v2/infrastructure/pty/pty_engine.ts`
  - `src/v2/infrastructure/dashboard/tmux_integration.ts`
  - `src/v2/application/runtime/local_process_supervisor.ts`
  - `src/v2/application/plugins/dummy_runtime_plugin.ts` & `src/v2/application/runtime/dummy_worker.js`
  - `tests/v2/milestone2_local_runtime.test.ts`
- **Dependencies**: Milestone 1
- **Complexity**: High
- **Acceptance Criteria**: Real OS processes spawn with PIDs, stdin/stdout PTY streaming works, workers restart/kill with SIGKILL, domain events persist to SQLite Event Store, zero AI provider dependency.

---

### Milestone 3: Runtime Plugin Framework (COMPLETED)
- **Objective**: Implement AI-agnostic Runtime Plugin Framework supporting dynamic discovery, loading, capability mapping, sandboxing, and version validation.
- **Deliverables**:
  - `src/v2/contracts/iplugin_framework.ts`
  - `src/v2/application/plugins/capability_registry.ts`
  - `src/v2/application/plugins/plugin_loader.ts`
  - `src/v2/application/plugins/plugin_sandbox.ts`
  - `src/v2/application/plugins/runtime_plugin_manager.ts`
  - `src/v2/application/plugins/dummy_runtime_plugin.ts` (Refactored reference plugin)
  - `tests/v2/milestone3_plugin_framework.test.ts`
- **Dependencies**: Milestone 2
- **Complexity**: High
- **Acceptance Criteria**: Dynamic registration, capability mapping, sandboxed error trapping, version validation, zero AI provider dependency.

---

### Milestone 4: Claude CLI Reference Runtime Plugin (COMPLETED)
- **Objective**: Implement the first production Runtime Plugin using Claude CLI as a reference implementation isolated inside `plugins/claude-cli/` with zero Kernel imports.
- **Deliverables**:
  - `plugins/claude-cli/plugin.json`
  - `plugins/claude-cli/claude_process.ts`
  - `plugins/claude-cli/claude_session.ts`
  - `plugins/claude-cli/claude_executor.ts`
  - `plugins/claude-cli/claude_runtime_plugin.ts`
  - `tests/v2/milestone4_claude_plugin.test.ts`
- **Dependencies**: Milestone 3
- **Complexity**: High
- **Acceptance Criteria**: Independent sessions per worker, task execution converting Claude output to Kernel-neutral `ExecutionResult`, 0 Claude imports in Kernel, CLI plugin management commands.

---

### Milestone 5: Mission Engine & Task Orchestration (COMPLETED)
- **Objective**: Implement Mission domain models, DAG Task Graph resolution, topological execution batching, capability-based task dispatch, state transitions, and CLI mission commands.
- **Deliverables**:
  - `src/v2/domain/missions/mission_models.ts`
  - `src/v2/application/missions/task_graph.ts`
  - `src/v2/application/missions/mission_planner.ts`
  - `src/v2/application/missions/mission_engine.ts`
  - `tests/v2/milestone5_mission_engine.test.ts`
- **Dependencies**: Milestone 4
- **Complexity**: High
- **Acceptance Criteria**: DAG topological sorting, cycle detection, capability-based worker matching, mission lifecycle state transitions (`CREATED` → `RUNNING` → `PAUSED` → `COMPLETED`), SQLite event emission.

---

### Milestone 6: Context Compiler & Workspace Engine (COMPLETED)
- **Objective**: Implement Context Compiler, AST Symbol Analyzer, Token Optimizer, Context Cache, Workspace Isolation Engine, and CLI context/workspace commands.
- **Deliverables**:
  - `src/v2/contracts/icontext_package.ts`
  - `src/v2/application/context-compiler/ast_symbol_analyzer.ts`
  - `src/v2/application/context-compiler/context_cache.ts`
  - `src/v2/application/context-compiler/context_compiler.ts`
  - `src/v2/application/workspace/workspace_engine.ts`
  - `tests/v2/milestone6_context_compiler.test.ts`
- **Dependencies**: Milestone 5
- **Complexity**: High
- **Acceptance Criteria**: AST symbol extraction (functions, classes, interfaces, imports), Context Package generation, token budget enforcement, cache invalidation, isolated workspace creation/destruction.

---

### Milestone 7: Git Worktree Isolation & Multi-Workspace Execution (COMPLETED)
- **Objective**: Implement Git Worktree isolation manager, dedicated branch generation (`feature/mission-<id>/<workerId>`), worker filesystem isolation (`.se_worktrees/worker-<id>/`), merge metadata preparation, and CLI worktree/branch commands.
- **Deliverables**:
  - `src/v2/contracts/igit_worktree.ts`
  - `src/v2/infrastructure/workspace/git_worktree_manager.ts`
  - `tests/v2/milestone7_worktree_isolation.test.ts`
- **Dependencies**: Milestone 6
- **Complexity**: High
- **Acceptance Criteria**: Independent worker branch creation, filesystem isolation, worker attach/detach, merge metadata generation, worktree cleanup, SQLite event persistence.

---

### Milestone 8: Multi-Agent Collaboration Engine (COMPLETED)
- **Objective**: Implement CollaborationEngine, inter-worker structured IPC via CompanyBus, TaskOwnershipManager, ReviewWorkflowManager, ConflictDetector for parallel edits, collaborative memory in SharedMemory, and CLI workers/review subcommands.
- **Deliverables**:
  - `src/v2/contracts/icollaboration.ts`
  - `src/v2/application/collaboration/task_ownership_manager.ts`
  - `src/v2/application/collaboration/review_workflow.ts`
  - `src/v2/application/collaboration/conflict_detector.ts`
  - `src/v2/application/collaboration/collaboration_engine.ts`
  - `tests/v2/milestone8_collaboration.test.ts`
- **Dependencies**: Milestone 7
- **Complexity**: High
- **Acceptance Criteria**: CompanyBus-only inter-worker communication, code review workflow (request → approve/reject), task ownership & delegation, conflict detection, collaborative memory ADR writing, SQLite event emissions.

---

### Milestone 9: Verification & Merge Engine (COMPLETED)
- **Objective**: Implement VerificationEngine, Quality Gates evaluation (Build, Tests, Lint, TypeCheck, Coverage), MergeEngine dry-run conflict analysis, MergeQueue candidate prioritization, and CLI verify/merge subcommands.
- **Deliverables**:
  - `src/v2/contracts/iverification_merge.ts`
  - `src/v2/application/verification/verification_engine.ts`
  - `src/v2/application/verification/merge_engine.ts`
  - `src/v2/application/verification/merge_queue.ts`
  - `tests/v2/milestone9_verification_merge.test.ts`
- **Dependencies**: Milestone 8
- **Complexity**: High
- **Acceptance Criteria**: Configurable quality gate verification, dry-run merge conflict analysis, priority merge queue management, verification reports with quality scores (0-100), SQLite event emissions.

---

### Milestone 10: Department Orchestrator & Organizational Hierarchy (COMPLETED)
- **Objective**: Implement DepartmentOrchestrator, standard departments (Backend, Frontend, QA, DevOps, Architecture, Documentation, Research), Department Leads, capability-based mission routing, worker load balancing, performance metrics, and CLI departments subcommands.
- **Deliverables**:
  - `src/v2/domain/organization/organization_models.ts`
  - `src/v2/application/organization/department_orchestrator.ts`
  - `tests/v2/milestone10_department_orchestrator.test.ts`
- **Dependencies**: Milestone 9
- **Complexity**: High
- **Acceptance Criteria**: CEO → Departments → Leads → Workers hierarchy, capability-based task routing, least-active-task load balancing, department performance metrics, SQLite event emissions.

---

### Milestone 11: Cost Optimization & Execution Policy Engine (COMPLETED)
- **Objective**: Implement ExecutionPolicyEngine, Execution Profiles (`Economy`, `Balanced`, `Performance`, `Custom`), CostEstimator, TokenBudgetManager, PromptCache, MissionCostReport, and CLI policy subcommands.
- **Deliverables**:
  - `src/v2/contracts/iexecution_policy.ts`
  - `src/v2/application/policy/cost_estimator.ts`
  - `src/v2/application/policy/token_budget_manager.ts`
  - `src/v2/application/policy/prompt_cache.ts`
  - `src/v2/application/policy/execution_policy_engine.ts`
  - `tests/v2/milestone11_policy_engine.test.ts`
- **Dependencies**: Milestone 10
- **Complexity**: High
- **Acceptance Criteria**: Profile-based resource constraints, prompt token cost estimation, hard/soft token budget limits, prompt cache hits & invalidation, mission cost reports with 35%+ token savings.

### Milestone 12: Autonomous Planning & Reasoning Engine (COMPLETED)
- **Objective**: Implement autonomous planning pipeline that converts high-level business goals into structured mission plans with architecture decisions, risk analysis, complexity estimation, execution strategy, and task graphs — all without manual task breakdown.
- **Deliverables**:
  - `src/v2/contracts/iplanning_engine.ts`
  - `src/v2/application/planning/goal_analyzer.ts`
  - `src/v2/application/planning/architecture_planner.ts`
  - `src/v2/application/planning/dependency_analyzer.ts`
  - `src/v2/application/planning/risk_analyzer.ts`
  - `src/v2/application/planning/complexity_estimator.ts`
  - `src/v2/application/planning/execution_strategy_planner.ts`
  - `src/v2/application/planning/plan_generator.ts`
  - `src/v2/application/planning/autonomous_planner.ts`
  - `tests/v2/milestone12_planning_engine.test.ts`
- **Dependencies**: Milestone 11
- **Complexity**: High
- **Planning Optimization**: Cache → ADR → Rule-based → Heuristic → AI fallback (threshold-gated, decision only)
- **Acceptance Criteria**: Business goal → MissionPlan with planningSource tracking (CACHE/RULE_ENGINE/AI_REASONING/HYBRID), ADR generation & SharedMemory persistence, knowledge reuse via PromptCache, all 10 domain events emitted, AI invocation gate recorded but not invoked, CLI plan subcommands.

### Milestone 13: Runtime Session Manager (COMPLETED)
- **Objective**: Implement provider-agnostic Runtime Session Manager using `IRuntimeTransport` abstraction, managing local worker runtime sessions, streaming output, cancellation, backpressure, state transitions, worker isolation, session reuse, health monitoring, and crash recovery.
- **Deliverables**:
  - `src/v2/contracts/iruntime_transport.ts`
  - `src/v2/contracts/iruntime_session.ts`
  - `src/v2/infrastructure/transport/pty_transport.ts`
  - `src/v2/application/session/runtime_session.ts`
  - `src/v2/application/session/runtime_session_registry.ts`
  - `src/v2/application/session/session_lifecycle_manager.ts`
  - `src/v2/application/session/runtime_session_manager.ts`
  - `tests/v2/milestone13_runtime_session.test.ts`
- **Dependencies**: Milestone 12
- **Complexity**: High
- **Architecture**: Transport-agnostic via `IRuntimeTransport` interface; `PtyTransport` reference implementation. Zero provider-specific code, HTTP calls, or API keys.
- **Acceptance Criteria**: Session lifecycle state machine (`Idle` → `Starting` → `Ready` → `Busy` → `Idle`/`Stopped`/`Failed`), worker session isolation, streaming stdout/stderr, stream cancellation, health monitoring, session reuse across missions, event emissions for all 9 session events, CLI subcommands (`runtimeSessions`, `runtimeStatus`, `runtimeStart`, `runtimeStop`, `runtimeRestart`, `runtimeInspect`).

### Milestone 14: Runtime Plugin System & Local CLI Integration (COMPLETED)
- **Objective**: Implement provider-agnostic Runtime Plugin System using `IRuntimePlugin` contract, `RuntimePluginLoader`, `RuntimePluginRegistry`, generic capabilities, health monitoring, and `MockRuntimePlugin` reference implementation.
- **Deliverables**:
  - `src/v2/contracts/iruntime_plugin_system.ts`
  - `src/v2/application/plugins/runtime_plugin_loader.ts`
  - `src/v2/application/plugins/runtime_plugin_registry.ts`
  - `src/v2/application/plugins/mock_runtime_plugin.ts`
  - `src/v2/application/plugins/runtime_plugin_system_manager.ts`
  - `tests/v2/milestone14_runtime_plugin_system.test.ts`
- **Dependencies**: Milestone 13
- **Complexity**: High
- **Architecture**: Provider-agnostic plugin contract & capability model. No provider-specific methods, login, or HTTP APIs.
- **Acceptance Criteria**: Manifest validation, semver kernel compatibility, capability queries, session attachment/detachment, health monitoring, 9 domain events emitted, CLI plugin subcommands (`runtimePluginList`, `runtimePluginEnable`, `runtimePluginDisable`, `runtimePluginInspect`, `runtimePluginValidate`).

### Milestone 15: Claude Code Runtime Plugin (First Real AI Integration) (COMPLETED)
- **Objective**: Implement the first production Runtime Plugin using Claude Code CLI (`ClaudeCodeRuntimePlugin`) with executable discovery, readiness verification, session attachment via `IRuntimeSession`, prompt execution, incremental output streaming, stream cancellation, health monitoring, generic provider-independent domain events, and CLI integration (`se-os claude ...`).
- **Deliverables**:
  - `src/v2/application/plugins/claude/claude_cli_detector.ts`
  - `src/v2/application/plugins/claude/claude_code_runtime_plugin.ts`
  - `plugins/claude-cli/index.ts`
  - `tests/v2/milestone15_claude_plugin.test.ts`
- **Dependencies**: Milestone 14
- **Complexity**: High
- **Provider Isolation**: All Claude-specific logic resides strictly inside `src/v2/application/plugins/claude/`. Kernel, Runtime Session Manager, Planning Engine, and Mission Engine remain 100% provider-agnostic with zero provider imports in `src/v2/kernel/`.
- **Acceptance Criteria**: Dynamic executable discovery via PATH or `CLAUDE_PATH` env, session attachment, prompt execution, streaming stdout chunks, stream cancellation, generic domain events (`RuntimePluginAttached`, `RuntimePluginDetached`, `RuntimeExecutionStarted`, `RuntimeExecutionCompleted`, `RuntimeExecutionCancelled`), CLI subcommands (`claudeStatus`, `claudeHealth`, `claudeExecute`, `claudeStream`).

### Milestone 16: Runtime Reasoning Pipeline (COMPLETED)
- **Objective**: Implement provider-agnostic Runtime Reasoning Pipeline (`ReasoningCoordinator`, `IRuntimeSelectionStrategy`, `DefaultRuntimeSelectionStrategy`) connecting Planning Engine and Mission Engine to Runtime Plugins without provider coupling.
- **Deliverables**:
  - `src/v2/contracts/iruntime_selection_strategy.ts`
  - `src/v2/contracts/ireasoning_pipeline.ts`
  - `src/v2/application/reasoning/runtime_selection_strategy.ts`
  - `src/v2/application/reasoning/reasoning_coordinator.ts`
  - `tests/v2/milestone16_reasoning_pipeline.test.ts`
- **Dependencies**: Milestone 15
- **Complexity**: High
- **Architecture**: Pluggable plugin selection via `IRuntimeSelectionStrategy` abstraction. Planning Engine and Mission Engine talk ONLY to `ReasoningCoordinator`. Zero provider-specific code outside Runtime Plugins.
- **Acceptance Criteria**: `ReasoningRequest` → `ReasoningResponse` lifecycle, low-confidence planning fallback reaching `ClaudeCodeRuntimePlugin` through `ReasoningCoordinator`, streaming stdout chunks, stream cancellation, concurrency & timeout policy enforcement, 6 domain events emitted, CLI subcommands (`reasoningExecute`, `reasoningStream`, `reasoningInspect`).

### Milestone 17: Autonomous Worker Execution (COMPLETED)
- **Objective**: Implement Autonomous Worker Execution (`WorkerExecutionEngine`, `WorkspaceExecutionService`, `iautonomous_worker` contracts) allowing AI workers to receive tasks, invoke ReasoningCoordinator, produce an ExecutionPlan, delegate workspace file mutations, harvest execution artifacts, and generate structured reports.
- **Deliverables**:
  - `src/v2/contracts/iautonomous_worker.ts`
  - `src/v2/application/worker/workspace_execution_service.ts`
  - `src/v2/application/worker/worker_execution_engine.ts`
  - `tests/v2/milestone17_autonomous_worker.test.ts`
- **Dependencies**: Milestone 16
- **Complexity**: High
- **Single Responsibility & Workspace Isolation**: `WorkerExecutionEngine` acts strictly as orchestrator generating `ExecutionPlan`; all filesystem mutations are delegated to `WorkspaceExecutionService`. Path boundary checks prevent path traversal outside workspace directory (`workspacePath`). Workers communicate strictly via `ReasoningCoordinator`.
- **Acceptance Criteria**: Full autonomous worker execution flow, isolated workspace file creation/modification, artifact collection (`CREATED_FILE`, `MODIFIED_FILE`, `EXECUTION_LOG`, `REASONING_SUMMARY`), 5 domain events emitted (`WorkerExecutionStarted`, `WorkerExecutionCompleted`, `WorkerExecutionFailed`, `WorkerWorkspaceUpdated`, `ArtifactsGenerated`), CLI subcommands (`workerExecute`, `workerInspect`, `workerArtifacts`).

### Milestone 18: Mission Decomposition & Task Assignment (COMPLETED)
- **Objective**: Implement Mission Decomposition & Task Assignment (`MissionDecomposer`, `IMissionPlanningStrategy`, `DefaultMissionPlanningStrategy`, `TaskAssignmentEngine`, `imission_decomposition` contracts) allowing high-level goals to be automatically analyzed, decomposed into DAG subtasks, prioritized, assigned to departments, and routed to workers based on capability and workload.
- **Deliverables**:
  - `src/v2/contracts/imission_planning_strategy.ts`
  - `src/v2/contracts/imission_decomposition.ts`
  - `src/v2/application/missions/default_mission_planning_strategy.ts`
  - `src/v2/application/missions/mission_decomposer.ts`
  - `src/v2/application/missions/task_assignment_engine.ts`
  - `tests/v2/milestone18_mission_decomposition.test.ts`
- **Dependencies**: Milestone 17
- **Complexity**: High
- **Pluggable Architecture**: `MissionDecomposer` acts strictly as orchestrator delegating planning to `IMissionPlanningStrategy`. `TaskAssignmentEngine` uses `AssignmentPolicy` to route tasks to departments and workers without direct Worker coupling in `MissionEngine`.
- **Acceptance Criteria**: High-level goal decomposition into 6 tasks, DAG dependency resolution, topological execution batching, capability & workload worker routing, `MissionExecutionPlan` compilation, 8 domain events emitted (`MissionDecomposed`, `TaskCreated`, `TaskAssigned`, `TaskStarted`, `TaskCompleted`, `TaskFailed`, `MissionCompleted`), CLI subcommands (`missionPlanDecompose`, `missionAssign`, `missionInspectPlan`).

### Milestone 19: Mission Execution Orchestrator (COMPLETED)
- **Objective**: Implement Mission Execution Orchestrator (`MissionExecutionOrchestrator`, `IWorkerDispatcher`, `DefaultWorkerDispatcher`, `ReadyTaskQueue`, `TaskScheduler`, `imission_execution_orchestrator` contracts) to automatically execute a `MissionExecutionPlan` from start to finish.
- **Deliverables**:
  - `src/v2/contracts/iworker_dispatcher.ts`
  - `src/v2/contracts/imission_execution_orchestrator.ts`
  - `src/v2/application/missions/worker_dispatcher.ts`
  - `src/v2/application/missions/ready_task_queue.ts`
  - `src/v2/application/missions/task_scheduler.ts`
  - `src/v2/application/missions/mission_execution_orchestrator.ts`
  - `tests/v2/milestone19_mission_execution.test.ts`
- **Dependencies**: Milestone 18
- **Complexity**: High
- **Pluggable Dispatcher & Layer Isolation**: `MissionExecutionOrchestrator` delegates task execution strictly to `IWorkerDispatcher`. `MissionExecutionOrchestrator` communicates NEVER directly with Runtime Plugins or `WorkerExecutionEngine`. Enforces `maxParallelWorkers` and `maxTaskRetries` execution policy limits.
- **Acceptance Criteria**: Automatic end-to-end execution of all 6 tasks across 5 DAG batches, topological dependency unlocking, parallel task scheduling, task retries & cancellation, 6 domain events emitted (`MissionExecutionStarted`, `TaskExecutionStarted`, `TaskExecutionCompleted`, `TaskExecutionFailed`, `MissionExecutionCompleted`, `MissionExecutionCancelled`), CLI subcommands (`missionExecute`, `missionExecutionStatus`, `missionCancel`).

### Milestone 20: Autonomous Project Lifecycle Orchestrator (COMPLETED)
- **Objective**: Implement Autonomous Project Lifecycle Orchestrator (`ProjectLifecycleOrchestrator`, `IProjectLifecycleStrategy`, `DefaultProjectLifecycleStrategy`, `iproject_lifecycle_orchestrator` contracts) unifying all SE-OS engines (`AutonomousPlanner`, `MissionEngine`, `MissionExecutionOrchestrator`) into a single autonomous software engineering workflow.
- **Deliverables**:
  - `src/v2/contracts/iproject_lifecycle_strategy.ts`
  - `src/v2/contracts/iproject_lifecycle_orchestrator.ts`
  - `src/v2/application/project/project_lifecycle_strategy.ts`
  - `src/v2/application/project/project_lifecycle_orchestrator.ts`
  - `tests/v2/milestone20_project_orchestrator.test.ts`
- **Dependencies**: Milestone 19
- **Complexity**: High
- **Pluggable Strategy & Layer Isolation**: `ProjectLifecycleOrchestrator` delegates workflow execution strictly to `IProjectLifecycleStrategy`. `ProjectLifecycleOrchestrator` communicates ONLY with existing engines, NEVER directly with Workers, Runtime Plugins, Workspace, or `ReasoningCoordinator`. Reuses 100% of existing engines with zero code duplication.
- **Acceptance Criteria**: Single business goal prompt (`"Create a REST API for User Management"`) executed autonomously end-to-end (Autonomous Planning → Mission Decomposition → Task Assignment → Mission Execution → Final Report Compilation), 6 domain events emitted (`ProjectExecutionStarted`, `ProjectPlanningCompleted`, `MissionExecutionStarted`, `MissionExecutionCompleted`, `ProjectExecutionCompleted`, `ProjectExecutionFailed`), CLI subcommands (`projectRun`, `projectStatus`, `projectReport`).

### Milestone 21: Verification Pipeline (COMPLETED)
- **Objective**: Implement Verification Pipeline (`VerificationPipeline`, `IVerificationStep`, `VerificationPlan`, `WorkspaceCheckStep`, `ArtifactCheckStep`, `BuildCheckStep`, `TypeCheckStep`, `TestCheckStep`, `LintCheckStep`, `iverification_pipeline` contracts) to validate code produced by workers.
- **Deliverables**:
  - `src/v2/contracts/iverification_step.ts`
  - `src/v2/contracts/iverification_pipeline.ts`
  - `src/v2/application/verification/steps/workspace_check_step.ts`
  - `src/v2/application/verification/steps/artifact_check_step.ts`
  - `src/v2/application/verification/steps/build_check_step.ts`
  - `src/v2/application/verification/steps/type_check_step.ts`
  - `src/v2/application/verification/steps/test_check_step.ts`
  - `src/v2/application/verification/steps/lint_check_step.ts`
  - `src/v2/application/verification/verification_pipeline.ts`
  - `tests/v2/milestone21_verification_pipeline.test.ts`
- **Dependencies**: Milestone 20
- **Complexity**: High
- **Pluggable Steps & Layer Isolation**: `VerificationPipeline` acts strictly as orchestrator delegating validation to `IVerificationStep[]`. `VerificationPipeline` communicates NEVER directly with Runtime Plugins and NEVER modifies workspace contents. Integrated into `MissionExecutionOrchestrator` task retry loop.
- **Acceptance Criteria**: Automatic verification passage during worker task execution, task retries triggered on verification failure, 6 built-in verification steps, 4 domain events emitted (`VerificationStarted`, `VerificationPassed`, `VerificationFailed`, `VerificationCompleted`), CLI subcommands (`verifyWorkspace`, `verifyTaskResults`, `verifyProjectResults`).

### Milestone 22: Mission Control Dashboard (COMPLETED)
- **Objective**: Create a web-based Mission Control Dashboard (React 18 + Vite + TypeScript + TailwindCSS + Lucide Icons) allowing a user to monitor the entire autonomous software engineering lifecycle from a single screen.
- **Deliverables**:
  - `dashboard/package.json`, `dashboard/vite.config.ts`, `dashboard/index.html`, `dashboard/src/index.css`
  - `dashboard/src/types/dashboard.ts` (DashboardState, DashboardTaskNode, DashboardWorker, DashboardAiSession, DashboardDomainEvent, DashboardArtifact, DashboardVerificationStatus)
  - `dashboard/src/services/se_os_api.ts` (SeOsApiService & mock telemetry engine)
  - `dashboard/src/components/HeaderHUD.tsx`, `GoalStatusHeader.tsx`, `MissionDagGraph.tsx`, `WorkerFleetPanel.tsx`, `AiSessionTerminal.tsx`, `LiveEventStream.tsx`, `WorkspaceArtifactsPanel.tsx`, `VerificationPanel.tsx`
  - `dashboard/src/App.tsx`, `dashboard/src/main.tsx`
  - `tests/v2/milestone22_dashboard.test.ts`
- **Dependencies**: Milestone 21
- **Complexity**: High
- **Single-Screen HUD Layout**: Visualizes Goal, Mission DAG Node Graph, Worker Fleet, Live AI Runtime Sessions (with streaming stdout, prompts, token usage, duration), Real-time Event Stream, Workspace Artifacts, and Verification Pipeline quality gates on a single high-density HUD layout. Provider neutral.
- **Acceptance Criteria**: Single-screen responsive dashboard implementation, 7 live telemetry panels, provider-neutral AI runtime session display, CLI subcommand (`se-os dashboard`).

### Milestone 23: Core TUI Framework & Telemetry Layer (COMPLETED)
- **Objective**: Implement Telemetry Layer (`TelemetryAggregator`, `TelemetrySnapshot`, `ITelemetryAggregator`), Screen Manager (`ScreenManager`), Layout Manager (`LayoutManager`), Panel Abstraction (`IPanel`), and Ink Terminal User Interface (`StartupScreen`, `RuntimeSelector`, `MainMenu`, `NewProjectPrompt`, `TuiApp`).
- **Deliverables**:
  - `src/v2/contracts/itelemetry_aggregator.ts`
  - `src/v2/application/telemetry/telemetry_aggregator.ts`
  - `src/v2/ui/tui/contracts/ipanel.ts`
  - `src/v2/ui/tui/managers/screen_manager.ts`
  - `src/v2/ui/tui/managers/layout_manager.ts`
  - `src/v2/ui/tui/components/StartupScreen.tsx`
  - `src/v2/ui/tui/components/RuntimeSelector.tsx`
  - `src/v2/ui/tui/components/MainMenu.tsx`
  - `src/v2/ui/tui/components/NewProjectPrompt.tsx`
  - `src/v2/ui/tui/tui_app.tsx`
  - `tests/v2/milestone23_tui_framework.test.ts`
- **Dependencies**: Milestone 22
- **Complexity**: High
- **Telemetry Layer & Screen Navigation**: Unified read-only `TelemetrySnapshot` consumed by TUI without business logic duplication. Interactive Ink terminal startup flow (Startup banner → Runtime selector → Main Menu → New Project Goal input → Execution mode).
- **Acceptance Criteria**: `TelemetryAggregator` registered in Kernel DI Container, Ink TUI components rendering startup flow, `se-os` CLI integration launching full-screen TUI.

### Vertical Slice 1: End-to-End Autonomous Project Execution (COMPLETED)
- **Objective**: Execute real software engineering project end-to-end autonomously from a single business goal prompt inside the full-screen TUI (`se-os`).
- **Deliverables**:
  - `src/v2/ui/tui/components/ProjectExecutionScreen.tsx` (Split TUI layout: Status Bar, Goal Banner, ASCII Mission DAG Tree, Worker Fleet, AI Session Monitor centerpiece, Verification Checklist, System Console, Completion Modal)
  - `src/v2/ui/tui/tui_app.tsx` (Connected to `kernel.getProjectLifecycleOrchestrator().runProject(goal)`)
  - `tests/v2/vertical_slice_1.test.ts`
- **Dependencies**: Milestone 23
- **Complexity**: High
- **Real Backend Execution**: Triggers `ProjectLifecycleOrchestrator` -> `AutonomousPlanner` -> `MissionEngine` -> `MissionExecutionOrchestrator` -> `WorkerExecutionEngine` -> `ClaudeCodeRuntimePlugin` -> `WorkspaceExecutionService` -> `VerificationPipeline` -> `TelemetryAggregator`. Real workspace files physically created in `./.se_workspaces/`. Real streaming stdout displayed live inside terminal.
- **Acceptance Criteria**: End-to-end autonomous execution of project goal `"Create a REST API for User Management"`, real workspace file creation, verification gate passage (100/100), project completion report modal banner with `[ Press ENTER to Return to Main Menu ]`, 161/161 v2.0 tests passing.

---

## Future Ideas / Backlog

The following non-essential features and long-term extensions are tracked here:

- **Distributed Workers & Multi-Machine Execution** — Status: BACKLOG
- **Kubernetes & Cloud Workload Scheduling** — Status: BACKLOG
- **GitHub Pull Requests & Webhook Integration** — Status: BACKLOG
- **Slack & Discord Notification Adapters** — Status: BACKLOG
- **Web Dashboard & Real-time Visualizer** — Status: BACKLOG
- **Tmux Terminal Grid Dashboard TUI** — Status: BACKLOG
- **VSCode Extension & IDE Plugins** — Status: BACKLOG
- **Voice Interface & Mobile Companion App** — Status: BACKLOG
- **AI Meeting Assistant & Auto-Documentation Website Generator** — Status: BACKLOG
- **Plugin Marketplace & Marketplace Monetization Engine** — Status: BACKLOG

---

## Research / Experimental

The following items are exploratory and may be investigated in future milestones:

- **LLM-Assisted Planning Augmentation** — When rule-based confidence is insufficient, invoke a Runtime Plugin for targeted reasoning. Requires runtime session management, provider authentication, and model selection. — Status: RESEARCH
- **Adaptive Planning from Historical Data** — Train planning heuristics from past mission outcomes to improve confidence scores and cost estimates over time. — Status: RESEARCH
- **Natural Language Goal Decomposition** — Use LLM to parse ambiguous business goals into structured requirements when keyword matching fails. — Status: RESEARCH
- **Cross-Mission Knowledge Graph** — Build a persistent knowledge graph linking ADRs, modules, risks, and planning decisions across all missions. — Status: RESEARCH
- **Automatic Complexity Calibration** — Compare estimated vs actual complexity post-execution and auto-adjust MODULE_COMPLEXITY scores. — Status: RESEARCH

---











### Milestone 2: Company Message Bus & Shared Memory Blackboard
- **Objective**: Implement typed IPC Company Bus and shared SQLite blackboard.
- **Deliverables**:
  - `src/infrastructure/bus/company_bus.ts`
  - `src/infrastructure/storage/shared_memory_blackboard.ts`
- **Dependencies**: Milestone 1
- **Complexity**: Medium
- **Acceptance Criteria**: Pub/sub messaging passes multi-client integration tests. Shared memory stores ADRs and symbol graphs cleanly.

---

### Milestone 3: Workforce Process Supervisor & Plugin SDK
- **Objective**: Build local OS child process supervisor, PTY terminal piping engine, and `plugins/` loader.
- **Deliverables**:
  - `src/infrastructure/runtime/process_supervisor.ts`
  - `src/infrastructure/plugins/plugin_loader.ts`
  - `plugins/claude-cli/index.js`, `plugins/codex-cli/index.js`, `plugins/ollama/index.js`
- **Dependencies**: Milestone 2
- **Complexity**: High
- **Acceptance Criteria**: Supervisor spawns local child processes, pipes PTY output, and auto-restarts on unexpected crashes.

---

### Milestone 4: Context Compiler & Git Worktree Isolation
- **Objective**: Build Tree-sitter AST slicer, token budget compiler, and Git Worktree isolation engine.
- **Deliverables**:
  - `src/core/application/services/context_compiler.ts`
  - `src/infrastructure/workspace/worktree_manager.ts`
- **Dependencies**: Milestone 3
- **Complexity**: High
- **Acceptance Criteria**: Context compiler extracts exact minimal code slices. Worktree manager isolates parallel worker commits.

---

### Milestone 5: Workforce Scheduler & Mission State Machine
- **Objective**: Implement DAG scheduler, priority queues, task stealing, and multi-department mission lifecycle.
- **Deliverables**:
  - `src/core/application/services/dag_scheduler.ts`
  - `src/core/application/services/mission_orchestrator.ts`
- **Dependencies**: Milestone 4
- **Complexity**: High
- **Acceptance Criteria**: Mission state machine executes multi-step tasks across lead architect, backend worker, and QA tester seamlessly.

---

### Milestone 6: Tmux Dashboard & Final Production Acceptance
- **Objective**: Implement automated multi-pane tmux grid dashboard UI and run end-to-end acceptance audit.
- **Deliverables**:
  - `src/infrastructure/tui/tmux_dashboard.ts`
  - `src/main.ts` (v2.0 entry point)
- **Dependencies**: Milestone 5
- **Complexity**: Medium
- **Acceptance Criteria**: `se-os boot --config company.yaml` provisions live multi-pane tmux session with real workers collaborating to complete real workspace tasks.
