# AI Development Rules & Operational Playbook

> **MANDATORY POLICY**: This document defines the repository-wide operational standards for all software engineering, refactoring, feature development, and releases in this repository. Every implementation task MUST strictly adhere to these rules.

---

## 1. Development Workflow

For every implementation, fix, or enhancement task:

1. **Clean Codebase**: Ensure working tree is clean and free of temporary scratch files before starting.
2. **Build**: Run `npm run build` to verify TypeScript compilation and structural integrity.
3. **Full Test Suite**: Execute `npm test` to run all unit and integration test suites.
4. **Zero Regression**: Fix any failing tests before completing the task. Never swallow or comment out failing assertions.
5. **CLI Verification**: If CLI (`src/main.ts`) or user-facing entry points are affected, verify end-to-end execution.
6. **Documentation Audit**: Verify that all inline comments, docstrings, and documentation files accurately reflect the changes.

---

## 2. Documentation Updates

Whenever functionality, schemas, APIs, or system behaviors change, automatically update:

- **`README.md`**: Update feature descriptions, CLI usage instructions, environment configurations, and setup commands.
- **`CHANGELOG.md`**: Record added features, bug fixes, breaking changes, and refactoring items under the current version section.
- **`VERSION`**: Maintain semantic versioning (`MAJOR.MINOR.PATCH`).
- **`architecture.md` / Architecture docs**: Keep system layer diagrams, dependency graphs, and DI registrations up to date.
- **ADRs (Architecture Decision Records)**: Document significant architectural choices, trade-offs, and design revisions.

---

## 3. Release Workflow

After completing every milestone or major feature increment:

1. **Version Bump**: Increment `VERSION` file following Semantic Versioning (SemVer).
2. **Changelog Entry**: Add a release entry in `CHANGELOG.md` with version number, date, and detailed bullet points.
3. **Conventional Commit**: Format commit messages using Conventional Commits specification (e.g., `feat(kernel): ...`, `fix(storage): ...`, `docs(rules): ...`).
4. **Git Tag**: Create a git tag matching the version string (e.g., `v1.1.0`).
5. **Clean Working Tree**: Ensure `git status` shows no untracked or uncommitted files.

---

## 4. Code Quality Standards

1. **Clean Architecture**: Strictly enforce layer separation:
   - `core/domain`: Entities, value objects, error definitions, interface abstractions (no external dependencies).
   - `core/application`: Use cases, services, orchestrators.
   - `infrastructure`: Storage drivers, AST parsers, process runtime, CLI, AI provider implementations.
2. **API Stability**: Do not break public interfaces or existing method signatures without explicit requirement.
3. **Backward Compatibility**: Preserve existing configurations, default fallbacks, and parameter structures.
4. **Test Coverage**: Every new function, service, or conditional branch must be accompanied by unit tests.
5. **No Dead or Temp Code**: Delete temporary logs, debug prints, unused variables, and abandoned trial code before final delivery.
6. **Target Workspace Isolation**: Never modify the SE-OS platform repository unless the target workspace is explicitly set to the SE-OS repository itself. All file edits, verification commands, and Git commits MUST execute inside `workspace.rootPath`.

---

## 5. Testing Rules

Every feature, bug fix, or refactoring requires:

- **Unit Tests**: Test core domain logic and isolated component behaviors using mocks/stubs.
- **Integration Tests**: Test end-to-end interactions between components (e.g., SQLite storage transactions, DI resolution, process runtime handles).
- **Regression Tests**: For every bug fixed, include an explicit test case proving that the root cause cannot recur.

---

## 6. Logging & Observability

Every execution pipeline stage and long-running service MUST emit structured telemetry and real-time stage progress reporting:

- **Start**: Stage name, active parameters, and metadata.
- **Finish**: Stage completion state, duration (ms/s), and key execution metrics.
- **Duration**: Exact wall-clock execution time elapsed.
- **Failure Diagnostics**: Component name, exact exception message, stack trace snippet, and actionable recovery step. Never mask errors as generic strings.
- **Live Multi-Pane Tmux Dashboard**: Automatically spawn and pipe unbuffered stage telemetry to dedicated tmux log panes for Main Console (Pane 1), Knowledge Engine & AST Slicer (Pane 2), Claude Provider (Pane 3), Verification Runner (Pane 4), and Git Integration (Pane 5).
- **Session Persistence**: Keep the `se-os` tmux session active after completion so developers can reconnect (`tmux attach -t se-os`) and inspect raw stdout, stderr, and exit codes.

---

## 7. Quality & Release Checklist

Before marking any task as complete, verify all items:

- [ ] `npm run build` passes with zero errors
- [ ] `npm test` passes with 100% passing test suites
- [ ] `README.md` and documentation updated
- [ ] `VERSION` file updated
- [ ] `CHANGELOG.md` updated
- [ ] Git commit created with Conventional Commit message
- [ ] Git tag created for release milestone
- [ ] `git status` is clean

---
