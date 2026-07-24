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
