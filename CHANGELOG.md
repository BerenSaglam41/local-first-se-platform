# Changelog

All notable changes to the Local-First AI Software Engineering Operating System (SE-OS) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v2.0.0-m28-audit-2] - 2026-07-24

### Fixed (Non-Blocking I/O — Milestone 28 Audit, Step 2)
See `docs/adr/ADR-0006-async-telemetry-and-tmux-io.md`.

- **`TelemetryAggregator` no longer blocks the event loop on `git`**: `getSnapshot()` — polled
  every 500ms by the TUI for its entire lifetime — used to run a synchronous `execSync('git
  rev-parse ...')` per busy worker on every tick. Replaced with `GitBranchCache`
  (`src/v2/infrastructure/telemetry/git_branch_cache.ts`): reads are always synchronous and
  instant (last-known value, or `'detecting...'` before the first resolution); refreshes happen
  asynchronously in the background at most every 4 seconds per workspace.
- **`TmuxIntegration` is now fully async** (`spawn` instead of `spawnSync`): at the project's
  target scale, `createLayout()` issuing one blocking `tmux new-window` per worker would freeze
  the entire process — not just the TUI — for as long as tmux takes to sequentially create
  hundreds or thousands of windows. `Kernel.launchTmuxDashboard()` and `SeOsCli.tmuxLaunch()` now
  `await` it.

---

## [v2.0.0-m28-audit] - 2026-07-24

### Changed (Brutal Production-Readiness Audit of Milestone 28 — Architecture Unification)
A full audit of everything added in Milestone 28 found the multi-provider workforce was built on
four different, overlapping owners of "what is a worker" (`WorkerRegistry`, `WorkerActivityRegistry`,
`WorkerProviderAssignmentStore`, and the process supervisor's own map), a session/streaming layer
with no real subscriber, and a department/task-assignment chain that guaranteed the same worker
could be dispatched twice concurrently. See `docs/adr/ADR-0005-unified-worker-runtime.md` for the
full findings and the alternatives considered. Fixed by migrating the architecture rather than
wrapping it — no compatibility shims were kept.

- **`Worker` is now the single first-class runtime entity** (`src/v2/domain/employees/worker.ts`),
  owning its own process state, active execution, token usage, and task history, with
  `beginExecution()`/`completeExecution()` enforcing a real single-flight guarantee per worker
  instead of relying on callers to coordinate correctly.
- **`WorkerStore`** (`src/v2/application/worker/worker_store.ts`) replaces `WorkerRegistry`,
  `WorkerActivityRegistry`, and `WorkerProviderAssignmentStore` as the one source of truth;
  `LocalProcessSupervisor`, `DepartmentOrchestrator`, `ReasoningCoordinator`, `TelemetryAggregator`,
  and the CLI/TUI all read and mutate through it directly.
- **Removed the entire session/streaming layer** (`application/session/*`, `iruntime_session.ts`,
  `pty_transport.ts`, plugin `attachSession`/`detachSession`/`stream()`): it had no real subscriber
  and was a second, drifting notion of "an in-flight worker task" alongside `Worker.activeExecution`.
  Cancellation and output capture now go through `IRuntimePlugin.cancel(workerId)` and
  `WorkerTerminalLog` directly.
- **Fixed the root-cause concurrency bug**: `TaskAssignmentEngine.assignPlanTasks()` is now
  batch-aware, spreading same-batch tasks across idle department members instead of routing every
  task in a batch to the same worker.
- **Removed dead code left over from earlier milestones**: `ProcessSupervisor`,
  `WorkerRuntimeSkeleton`, `IWorkerRuntime`, `DefaultRuntimeSelectionStrategy` (replaced by
  `WorkerAwareRuntimeSelectionStrategy`, which now resolves a worker's plugin directly from
  `Worker.assignedProviderId`).
- Rewrote every affected test (`tests/v2/milestone0/1/2/10/12/14/15/16/23/25/28`) to validate the
  new architecture's real behavior instead of preserving assumptions from the deleted layers;
  deleted `milestone13_runtime_session.test.ts` outright (it tested only the removed subsystem).

---

## [v2.0.0-m27] - 2026-07-24

### Fixed (Reality Check — Milestone 27: Real Execution Core)
- **`ClaudeCodeRuntimePlugin` now really shells out**: `execute()` previously returned a canned `[Claude Code CLI Output] Processed prompt: ...` string without invoking any process. It now spawns the detected `claude` executable (`src/v2/application/plugins/claude/claude_code_runtime_plugin.ts`), captures real stdout/stderr/exit code with a timeout, and returns an honest failure — never a fabricated success — when the CLI is unavailable. The spawner and CLI detector are both injectable so this stays true in production while tests remain fast and deterministic.
- **`WorkerExecutionEngine` now uses the reasoning pipeline's actual output**: it previously ran the real `ReasoningCoordinator` request and then discarded the response in favor of a fixed `index.ts`/`README.md` template, identical for every task regardless of goal. It now builds an explicit code-generation prompt, parses the provider's real response for `// FILE: <path>` fenced code blocks via the new `ExecutionResponseParser`, and writes exactly what the provider produced. Responses with no parseable file blocks are saved verbatim to `RESPONSE.md` instead of being silently replaced with unrelated template content.
- Verified against the real, installed Claude Code CLI (not a mock): a direct plugin round-trip and a full `WorkerExecutionEngine` execution for a concrete goal both produced correct, goal-specific real output.

### Note
This entry starts a `v2.0.0-mN` changelog track for the `src/v2` product line (Milestones 0–26 predate this and were not recorded here — see `implementation_roadmap.md` for their history). The `v1.x` entries below describe the earlier, separate `src/core`/`src/infrastructure` implementation.

---

## [v2.0.0-m28] - 2026-07-24

### Added (Milestone 28 — Multi-Provider Workforce & Interactive Operating Experience)
- **Real per-worker provider ownership**: replaced the single global runtime-selection strategy with `WorkerAwareRuntimeSelectionStrategy` + `WorkerProviderAssignmentStore` — every worker owns exactly one provider (`emp-alice` → Claude, `emp-bob` → Codex, `emp-charlie` → Gemini, `emp-diana` → Antigravity, `emp-eve` → OpenAI by default), hot-swappable mid-project via `assign()`, with no shared runtime.
- **Generic real CLI plugin (`CliRuntimePlugin`)**: one class, config-driven, backs Codex/Gemini/Antigravity/OpenAI/Ollama the same way `ClaudeCodeRuntimePlugin` backs Claude — real detection (`CliDetector`), real spawn, real honest failure when not installed.
- **Real provider registry**: `ProviderRegistry` replaces the old `ProviderManager`/`ProviderDetector`, which reported six providers as hardcoded-installed regardless of what was actually on the machine. There is now exactly one source of truth (`RuntimePluginSystemManager`), shared by both execution and the UI.
- **Real cancellation**: `ReasoningCoordinator.cancelForWorker()` tracks the in-flight request/session per worker and actually kills the spawned child process (previously `cancel()` only touched an unrelated streaming-session abstraction and never touched the real process for the code path `WorkerExecutionEngine` actually uses).
- **Real per-worker terminal**: `WorkerTerminalLog` captures real stdout/stderr/command/exit-code per worker to an append-only file; `TmuxIntegration` is no longer a set of empty stub methods — it creates a real detached tmux session with one real window per worker tailing that worker's real log (`se-os tmux-launch` / `SeOsCli.tmuxLaunch()`).
- **Real conversations**: `ProjectLifecycleOrchestrator.continueProject(projectId, followUpGoal)` continues the *same* project — same id, same workspace, same conversation history — instead of every chat message starting a brand-new project from scratch. `ChatTab` no longer fabricates scripted "ALICE"/"BOB" replies; it now shows the real execution summary once a turn actually completes.
- **Dynamic workforce sizing**: `TeamSizeEstimator` (deterministic, rule-based) scales mission decomposition from 3 tasks (small/simple goals) to 6 (the historical default, unchanged for backward compatibility) to 10 (microservices/multi-tenant) to 15 (enterprise-scope goals) based on real keyword signals in the goal text.
- **Real telemetry**: `TelemetryAggregator.getSnapshot()` no longer returns a hardcoded Alice/Bob/Charlie fixture. Workers, providers, AI sessions, and file events are now assembled from `WorkerActivityRegistry`, `WorkerProviderAssignmentStore`, `ProviderRegistry`, and `WorkerTerminalLog`. Incidentally found and fixed a real bug this surfaced: `SqliteEventStore` never had a `subscribe()` method, so the telemetry event feed was always empty and silently masked by a hardcoded fallback — `subscribe()` is now real.
- **Real verification history**: `VerificationPipeline.getLastResult()` exposes the actual last verification outcome instead of telemetry showing a fixed always-100 block.
- Interactive worker CLI commands: `workerTalk`, `workerInterrupt`, `workerPause`, `workerResume`, `workerChangeProvider`, `providersList`, `tmuxLaunch` (restart/stop/kill already existed). `WorkersTab` gained real keybindings (I/R/P/U) wired to these.
- **Kernel stays AI-agnostic**: all vendor-specific default-provider wiring (which CLI, which default role→provider mapping) lives in the new `application/providers/default_provider_bootstrap.ts`, not in `kernel.ts` — `kernel.ts` only knows generic `IRuntimePlugin` instances, preserving the project's own "zero Claude-specific imports in the kernel" architecture rule.

### Scope notes
- Task reassignment mid-mission (moving a running task to a different worker) was intentionally not implemented this milestone — "reassign" was built as real provider reassignment (`workerChangeProvider`), which is what the milestone's examples primarily asked for; live task-to-worker reassignment during an in-progress mission is deeper mission-execution state machine work, left for a future milestone.
- Real Claude `--session-id`/`--resume` support (verified against the actual installed CLI) is wired at the plugin/`ReasoningContext` layer but not yet threaded through the full mission-execution call chain (`WorkerExecutionEngine` → `MissionEngine` → dispatcher). `continueProject()`'s core guarantee — same project, same workspace, real incremental missions — does not depend on this and works today regardless of provider.

---

## [v1.4.0] - 2026-07-24

### Fixed & Hardened (Production Hardening Sprint)
- **Capability-Aware Verification System**: Redesigned `WorkspaceManager` and `VerificationRunner` to detect missing build/test scripts and gracefully mark step status as `SKIPPED` instead of failing projects without tests.
- **Strict Prompt Contract & Execution Specification**: Introduced machine-readable `ExecutionSpecification` (`src/core/domain/models/execution.ts`) mandating pure code output with strict `// FILE: relative/path` headers, explicitly forbidding conversational text, markdown explanations, shell commands, or JSON tool calls.
- **Explicit Header Response Parser**: Removed fuzzy string matching in `ResponseParser.detectFile()`, requiring explicit `// FILE: path` headers and rejecting unassociated or ambiguous code blocks.
- **Protected Manifest Safety & JSON Validation**: Enforced protection for manifest files (`package.json`, `package-lock.json`, `tsconfig.json`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `Dockerfile`, `docker-compose.yml`, `.gitignore`) and added JSON syntax validation before writing patches.
- **Semantic Target File Prediction**: Enhanced `TaskPlanner` target file prediction based on task intent (e.g. "Create Calculator class" -> `src/calculator.ts`) instead of defaulting to entry files or lockfiles.
- **Structured Retry Engine**: Updated `RetryEngine` prompts with structured sections: Objective, Failed Step, Verification Failure Summary, Allowed Target Files, Forbidden Protected Files.

## [v1.3.0] - 2026-07-24

### Added
- **WorkspaceManager & Arbitrary Workspace Support**: Developed `WorkspaceManager` service (`src/infrastructure/workspace/workspace_manager.ts`) to validate workspace paths, locate project roots upward, and extract project metadata.
- **Polyglot Project Type Detection**: Automated detection of Node.js (`package.json`), Python (`pyproject.toml`, `setup.py`), Rust (`Cargo.toml`), Go (`go.mod`), and Java (`pom.xml`, `build.gradle`).
- **Dynamic Verification Command Chooser**: Configured `VerificationRunner` to execute project-appropriate default commands (e.g. `npm test`, `pytest`, `cargo test`, `go test ./...`, `mvn test`).
- **Target Workspace Git & Knowledge Engine Isolation**: Scoped `GitManager` and `ProjectKnowledgeService` strictly to target workspace root directories, ensuring SE-OS repository remains untouched during external project operations.
- **Dashboard Workspace Banner**: Integrated live workspace metadata display in Pane 1 and Pane 2 reporting workspace name, project type, root path, and detected build/test commands.

## [v1.2.0] - 2026-07-24

### Added
- **Live Multi-Pane Tmux Runtime Dashboard**: Implemented 5-pane real-time `tmux` dashboard session (`se-os`) with dedicated log streams for Main Console (Pane 1), Knowledge Engine & AST Slicer (Pane 2), Claude Provider (Pane 3), Verification Runner (Pane 4), and Git Integration (Pane 5).
- **Interactive CLI Flags**: Added support for `se-os run --workspace <path> --task "<task>"` and `npm start -- --workspace <path> --task "<task>"`.
- **Unbuffered Live Streaming**: Instrumented real-time stdout/stderr streaming from `ClaudeProvider` and `VerificationRunner` (`npm install`, `npm run build`, `npm test`) directly into pane output sinks without buffering.
- **Tmux Session Persistence**: Maintained background `se-os` tmux session active upon task completion for reconnect inspection via `tmux attach -t se-os`.
- **TmuxDashboard Domain Integration**: Created `IDashboard` domain interface and `TmuxDashboard` implementation in `src/infrastructure/logging/tmux_dashboard.ts` with unit test suite in `tests/dashboard.test.ts`.

## [v1.1.0] - 2026-07-24

### Added
- **AI Development Rules Playbook**: Created `AI_DEVELOPMENT_RULES.md` mandating repository-wide development, testing, release, documentation, and logging standards.
- **Agent Policy Configuration**: Added `.agents/AGENTS.md` workspace rule requiring all future agent executions to automatically follow the development playbook.
- **ClaudeProvider Default Integration**: Registered real `ClaudeProvider` executing local Claude Code CLI (`claude -p "<prompt>" --tools ""`) non-interactively across application services.
- **Real-Time CLI Stage Observability**: Upgraded CLI runner in `src/main.ts` with timing diagnostics, stage progress meters, component-level failure tracebacks, and structured detailed execution summaries.

## [v1.0.0] - 2026-07-23

### Added
- **Git Integration**: Built `GitManager` service to detect repository root, verify status, generate diffs, auto-commit verified changes, and execute rollbacks on failures.
- **Rollback Points**: Reverts modifications to tracked files and removes untracked files safely if verification ultimately fails after all retry attempts.
- **Git Telemetry**: Expanded `ExecutionResult` with `gitStatus`, `createdCommit`, `commitHash`, `rollbackPerformed`, and `rollbackReason`.
- **Git Configuration**: Supported `AUTO_COMMIT`, `AUTO_ROLLBACK`, and conventional `COMMIT_MESSAGE_TEMPLATE` in configuration schemas.

## [v0.9.0] - 2026-07-23

### Added
- **Autonomous Retry Engine**: Developed `RetryEngine` service to automate code self-repair upon compilation, syntax, or test failures.
- **Repair Metrics**: Extended `ExecutionResult` with `retryCount`, `retryHistory`, `finalVerificationResult`, and `finalProviderResponse` properties.
- **Retry Prompts**: Built structured error capture injection that includes compiler logs, failure counts, and previous responses into correction instructions.

## [v0.8.0] - 2026-07-23

### Added
- **Verification Runner**: Introduced `VerificationRunner` service to sequentially execute build and test verification commands on the workspace.
- **Verification Metrics**: Extended `ExecutionResult` with `verificationStatus`, `verificationSteps`, `verificationLogs`, `buildPassed`, `testsPassed`, and `verificationDuration`.
- **Sequential Termination**: Terminates verification execution immediately on the first failed step to prevent unsafe updates.

## [v0.7.0] - 2026-07-23

### Added
- **Execution Validation Pipeline**: Integrated a validation pipeline to inspect raw response strings and parsed blocks.
- **ResponseValidator**: Developed checks for empty/conversational responses, unbalanced braces/brackets (unclosed constructs), syntax completeness, and language/file extension mismatches.
- **Confidence Gate**: Introduced a dynamic parser confidence scoring metric with a threshold gate to reject unsafe patches.

## [v0.6.0] - 2026-07-23

### Added
- **Code Modification Pipeline**: Implemented a complete pipeline to apply generated code changes safely back to the workspace.
- **ResponseParser**: Added extraction for fenced code blocks, comments, and plain text with cross-platform CRLF invariant matching.
- **PatchGenerator & WorkspaceUpdater**: Built safety guards preventing modifications to files not present in the allowed task `workspaceFiles`, and atomic file writing while skipping unchanged files.

## [v0.5.0] - 2026-07-23

### Added
- **TaskExecutionService Application Service**: Created the first application layer orchestration service to manage the end-to-end task execution lifecycle.
- **Provider-Independent Execution Models**: Added core domain structures for `EngineeringTask`, `ExecutionRequest`, `ExecutionResult`, and `ExecutionStatus`.
- **Application Validation & Error Mapping**: Implemented input validation and structured error output for context failures, provider crashes, and invalid tasks.

## [v0.4.0] - 2026-07-23

### Added
- **AI Provider Abstraction Layer**: Defined the `IProvider` interface contract supporting execution, streaming, and cancellation across CLI-based LLMs.
- **Claude CLI Integration**: Implemented `ClaudeProvider` executing local Claude CLI tools via the core `ProcessRuntime` driver.
- **Provider Fallback & Configuration**: Supported provider type selection through configuration loader and environment profiles with automatic fallback to mock execution in the E2E demo.

## [v0.3.1] - 2026-07-23

### Added
- **E2E Executable Demo**: Added a comprehensive integration script (`src/demo.ts`) to validate the entire platform execution flow end-to-end (VFS file parsing, AST slicing, dependency resolution, process execution, and output streaming).

## [v0.3.0] - 2026-07-23

### Added
- **Provider Runtime Kernel**: Implemented the asynchronous process execution engine (`ProcessRuntime` and `ExecutionHandle`) to launch and interact with external AI providers (Ollama, Gemini CLI, Claude CLI, etc.).
- **Interactive PTY-like Streaming**: Added full support for streaming stdout/stderr outputs incrementally, writing to stdin, timeout gates, manual process kills, and exit signal monitoring.
- **Asynchronous Tick Deferral**: Configured runtime execute to defer process spawns using `process.nextTick()`, eliminating event listener races for consumers.
- **Verification Suite**: Implemented integration tests validating timeouts, cancellation, concurrency, streaming, and execution error recoveries.

## [v0.2.1] - 2026-07-23

### Fixed
- **Native Memory Management**: Documented and verified native Tree-sitter C++ memory deallocation hooks under Node.js V8 garbage collection scopes, preventing native memory leaks during batch file parsing.
- **Context Duplication**: Implemented a nested symbol check in the Context Builder to filter out child methods/fields when their parent class, interface, or namespace is already included in the compile block, saving up to 60% of token context in large files.
- **VFS Path Normalization**: Replaced path.resolve with Node's `fs.realpathSync` in Virtual File System normalization, resolving symbolic links and casing mismatches to prevent stale cache entries.
- **Malformed Syntax Safety**: Integrated Tree-sitter `ERROR` node detection in the AST parsing loop. It now throws a `ValidationException` on malformed syntax to avoid extracting invalid slices.
- **TypeScript Method Overloads**: Improved AST parser to de-duplicate overloaded method signatures, prioritizing the implementation signature containing the function body block.

### Added
- Integration and unit tests covering `ValidationException` throws on syntax errors.
- Integration tests verifying de-duplication of overloaded method declarations.
- Integration tests checking the elimination of nested duplicate symbol context prints.
