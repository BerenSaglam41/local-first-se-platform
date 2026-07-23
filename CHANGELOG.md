# Changelog

All notable changes to the Local-First AI Software Engineering Operating System (SE-OS) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
