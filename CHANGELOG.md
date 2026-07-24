# Changelog

All notable changes to the Local-First AI Software Engineering Operating System (SE-OS) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
