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
[Milestone 1: Kernel Domain & Event Store]
                    │
                    ▼
[Milestone 2: Company Bus & Shared Memory Blackboard]
                    │
                    ▼
[Milestone 3: Process Supervisor & Runtime Plugin SDK]
                    │
                    ▼
[Milestone 4: Context Compiler & Git Worktree Engine]
                    │
                    ▼
[Milestone 5: Scheduler & Department State Machine]
                    │
                    ▼
[Milestone 6: Multi-Pane Tmux TUI & End-to-End Release]
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

### Milestone 1: Kernel Domain Models & Event Store
- **Objective**: Establish core domain models (`Company`, `Employee`, `Role`, `Mission`), contracts, and SQLite Event Store.
- **Deliverables**:
  - `src/core/domain/models/company.ts`
  - `src/core/domain/interfaces/ikernel.ts`
  - `src/infrastructure/storage/sqlite_event_store.ts`
- **Dependencies**: None
- **Complexity**: Medium
- **Acceptance Criteria**: 100% passing unit tests for event append/replay and domain model creation.

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
