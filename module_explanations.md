# Module Explanations & Boundaries

This document provides a detailed breakdown of the responsibility, boundary, and clean dependency architecture for each module in the local-first AI Software Engineering Platform.

---

## 1. Domain Layer Modules (`src/core/domain/`)

The innermost ring of our clean architecture. It contains **no dependencies** on libraries (like SQLite, PTY runners, or OS frameworks) and only defines structures and contracts.

### `models/`
- **project.ts**: Represents a managed code repository, its configurations, and root path.
- **task.ts**: Contains the `Task` definition, its dependencies (DAG links), inputs, outputs, and the transition statuses (`PENDING`, `READY`, `RUNNING`, `APPROVAL_REQUIRED`, `COMPLETED`, `FAILED`).
- **message.ts**: Structured communication format used by the event logs and conversations.
- **event.ts**: Base data structure for all pub/sub operations inside the event bus.

### `interfaces/`
- **provider.ts**: Declares how any CLI provider wraps an AI. Defines `IProvider`, `ISession`, `IConversation`, and `IToolExecutor`.
- **agent.ts**: Establishes boundaries for an agent persona. Defines `IAgent`, `IRole`, and `Capability`.
- **memory.ts**: Standard interface for storage and querying of conversational snippets (episodic memory) and vector embeddings (semantic memory).
- **storage.ts**: Abstraction for storing relational data (like projects, tasks, histories).
- **event_bus.ts**: Declares methods for synchronous and asynchronous in-memory event distribution.

---

## 2. Application Layer Modules (`src/core/application/`)

Contains the core business use-cases and orchestration engines. It coordinates domain entities using interfaces (without knowing how they are implemented).

### `state/`
- **state_machine.ts**: Implements the workflow state engine. Ensures that a task cannot jump from `PENDING` to `COMPLETED` without going through `RUNNING`, and enforces validation gates.

### `workflow/`
- **engine.ts**: Compiles a DAG workflow defined in YAML. Identifies which tasks are unblocked, runs them via available agents, and updates states.
- **scheduler.ts**: Manages execution queues, handles task prioritization, and ensures CPU/concurrency limits are respected.

### `event_bus/`
- **event_bus.ts**: An in-memory, decoupled publish-subscribe broker. When an agent requests a file change, it emits a `HUMAN_APPROVAL_REQUESTED` event. The system handles this event by passing control to the human approval driver.

---

## 3. Infrastructure Layer Modules (`src/infrastructure/`)

Concretely implements all domain contracts. This is where OS dependencies, files, processes, and terminal CLIs live.

### `providers/`
- **base_cli_runner.ts**: Manages spawning and monitoring native system CLI tools (e.g. `claude`, `gemini-cli`) using persistent pseudo-terminals (like `node-pty`).
- **claude_cli.ts** / **gemini_cli.ts** / **codex_cli.ts**: CLI adapters that feed instructions to the specific CLI tool, parse its stdout/stderr, and capture tool execution commands emitted by the model.

### `storage/`
- **sqlite_db.ts**: The database client. Connects to a local SQLite database file, creates tables, and performs transactions to save task states and project configs.

### `memory/`
- **vector_store.ts**: Manages semantic memory lookup. Runs a localized sqlite extension (like `sqlite-vss`) or in-memory vector indexing library to retrieve similar past interactions.

### `terminal/`
- **shell_manager.ts**: Safely runs arbitrary terminal commands triggered by agents. Implements timeouts, buffers logs, and runs them within a controlled environment.

### `git/`
- **git_client.ts**: Standard wrapper around the local system Git client. Manages checking out branches, staging file diffs, committing changes, and running merges.

### `approval/`
- **interactive_cli.ts**: The interactive Gatekeeper. Hooks into `HUMAN_APPROVAL_REQUESTED` events, prompts the user in the stdout terminal (Y/N/Feedback), and notifies the event bus of the user's decision.
