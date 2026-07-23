# ADR-0004: Provider Runtime Kernel Design

## Status
Approved

## Context
We need a robust mechanism to spawn, control, stream from, and interact with external CLI tools (such as Claude Code, Codex, Gemini CLI, or local LLMs like Ollama) as part of the orchestrator execution loop. This mechanism must be cross-platform (supporting Windows, Linux, and macOS), performant, secure, and have zero native C++ compilation dependencies to ensure easy installation on client environments.

## Decision
We chose to implement the Provider Runtime Kernel using Node.js's native `child_process.spawn` with stream pipes (`stdio: 'pipe'`), wrapped in a domain-level `IExecutionHandle` state machine.

### Alternatives Considered:
1. **`node-pty` (Pseudo-Terminal Wrapper)**:
   * *Pros*: Full terminal emulation, handles color escape sequences and interactive prompts natively.
   * *Cons*: Requires native C++ bindings compilation on the user's machine (via `node-gyp`). Frequently fails on diverse macOS/Windows/Linux environment configurations. Rejected to maintain our "zero-native-compilation-trouble" runtime goal.
2. **`child_process.exec`**:
   * *Pros*: Simple API.
   * *Cons*: Executes commands through a shell string. Highly vulnerable to shell injection attacks. Buffers stdout completely before return, preventing incremental chunk streaming. Rejected.

### Chosen Approach (`child_process.spawn` with pipe stdio):
* **Direct Binary Invocation**: Spawns executables directly with an array of arguments, completely bypassing the shell shell string parsing and eliminating injection vectors.
* **Streams Interface**: Pipes stdin, stdout, and stderr as stream objects, enabling real-time chunk consumption for LLM token streaming.
* **Asynchronous Deferral**: Uses `process.nextTick()` to postpone starting the process, giving the caller a chance to register stream listeners synchronously on the returned handle.

## Consequences
* **Security**: Safe execution of arbitrary command parameters.
* **Performance**: Real-time token streaming with minimal memory footprint (no command output buffering).
* **Portability**: Works out-of-the-box on Windows, macOS, and Linux without compiling binary modules.
* **Limitations**: Interactive tools that strictly require a TTY (pseudo-terminal) device descriptor (e.g. tools that check `process.stdout.isTTY`) will run in non-interactive stdout mode, requiring CLI provider adapter flags (e.g., `--no-interactive` or stdin piping overrides).
