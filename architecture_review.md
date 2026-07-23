# Architecture Review & Risk Assessment

This document provides a critical review of the proposed architecture for the local-first AI Software Engineering Platform. It identifies key scalability limits, redundant abstractions, coupling risks, and long-term maintenance overhead, followed by strategic architectural recommendations.

---

## 1. Scalability Problems

### A. Subprocess Process Exhaustion (PID & File Descriptor Limits)
- **Problem**: Spawning separate pseudo-terminals (PTYs) or shell processes for each active agent conversation is extremely resource-intensive. If a complex workflow runs a swarm of agents (e.g., ten concurrent tasks), the host operating system faces high memory usage, context-switching overhead, and potential file descriptor limits.
- **Impact**: The application can degrade local host performance or crash due to process exhaustion during large-scale code refactoring jobs.

### B. SQLite Single-Threaded Write Bottlenecks
- **Problem**: While SQLite is ideal for local-first storage, it locks the entire database file during write transactions. Under high-frequency events from multiple parallel agent execution loops and semantic memory indexing writes, the system will encounter database-locked errors.
- **Impact**: Delayed state updates, dropped event logs, and slowed execution loops.

### C. Semantic Memory Retrieval Latency
- **Problem**: Performing vector calculations locally (via extensions like SQLite-VSS or single-threaded in-memory indexers) scales poorly as the project history grows. Loading large codebases and thousands of historical conversation nodes into memory for vector comparison blocks the main execution loop.
- **Impact**: Agent response times will grow exponentially as the project's codebase and event log expand.

---

## 2. Unnecessary Abstractions

### A. Overly Nested Provider Hierarchy
- **Problem**: The chain of `Provider` -> `Session` -> `Conversation` is redundant. In a local-first platform where every agent interacts directly with a single CLI stream, dividing a Session from a Conversation introduces excessive boilerplate.
- **Impact**: Developers writing plugins for new CLIs have to implement three distinct wrappers instead of one, slowing down community contributions.

### B. Redundancy Between Capabilities and Tool Executors
- **Problem**: Both the `IAgent` (via `Capability`) and `ISession` (via `IToolExecutor`) attempt to define and execute actions. If the Provider handles tool intercepting and the Agent holds capabilities, the division of responsibility is unclear.
- **Impact**: Code duplication where tool security checks and system commands must be verified twice in different layers of the codebase.

---

## 3. Coupling Issues

### A. Tight Binding of Agents to Providers
- **Problem**: The `IAgent` interface directly holds a reference to a specific `IProvider` instance. This prevents the platform from dynamically swapping providers (e.g., switching a task from a faster CLI to a cheaper/local CLI) when a model fails or context limits are hit.
- **Impact**: Harder to implement fallback logic and dynamic load balancing across different CLI tools.

### B. Static Agent Roles in Workflows
- **Problem**: Workflows map tasks directly to static agent personas (e.g., "Architect"). If a task requires collaborative debugging, the workflow cannot easily delegate it to a swarm of backend coders without redefining the workflow itself.
- **Impact**: Inhibits dynamic collaboration patterns where agents assign sub-tasks to other agents programmatically.

### C. Event Bus and State Machine Synchronization
- **Problem**: The `WorkflowStateMachine` maintains synchronous state transitions, while the `EventBus` distributes state change events asynchronously. If a subscriber reacts to an event and triggers another transition, race conditions will occur, putting the graph in an inconsistent state.
- **Impact**: Out-of-order execution of dependent tasks in the workflow DAG.

---

## 4. Future Maintenance Risks

### A. Fragility of CLI Output Parsing (Regex-Based Scraping)
- **Problem**: Third-party CLIs (like Claude Code, Codex, or Gemini CLI) are designed for human interaction. Their output formats, color codes, progress bars, and prompt symbols change frequently with minor version updates.
- **Impact**: The platform's parsing regexes will break constantly when users update their underlying coding assistant CLIs, requiring continuous updates to maintain basic stability.

### B. Destructive Execution & Local Host Pollution
- **Problem**: Running commands directly on the user's terminal manager can mutate local configuration files, pollute global package directories, or accidentally execute destructive operations.
- **Impact**: High security risk for users running unverified workflows, and lack of reproducible build environments across different developers' machines.

### C. Git Branch and Merge Conflict Storms
- **Problem**: When multiple agents work simultaneously on separate feature branches, merging them back into the main branch local workspace will frequently cause complex conflicts.
- **Impact**: The workflow engine will stall, requiring constant human manual intervention to resolve standard code integration issues.

---

## 5. Suggested Improvements

### A. Flatten the Provider API
- Replace the nested hierarchy with a single execution stream interface. The provider should directly accept a prompt and return a standardized stream of text chunks and structured tool calls, eliminating the intermediate session layer.

### B. Sandbox CLI Processes in Local Containers
- Instead of running CLIs on the host shell, execute all terminal commands and provider wrappers inside a lightweight, ephemeral Docker container or WebAssembly sandbox. This secures the user's system, prevents environment pollution, and ensures reproducible builds.

### C. Transition to an Event-Sourced WAL for State
- Rather than immediately modifying database fields, persist all state changes as an append-only event journal log. In the event of an application crash or power loss, the State Machine can reconstruct the exact state of the workflow DAG by replaying the log.

### D. Decouple Agents from Provider Instances
- Modify the system so that Agents receive an execution context containing temporary provider streams on a per-task basis, rather than being coupled to a specific CLI provider long-term.

### E. Standardize CLI Communication via Adapter Protocols
- Introduce a lightweight parsing middleware layer that converts CLI terminal outputs into structured data (such as JSON lines) before feeding them to the event system. This isolates changes in CLI styling from the platform's core core parser logic.
