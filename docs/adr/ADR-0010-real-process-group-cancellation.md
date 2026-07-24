# ADR-0010: Real Process-Group Cancellation on Interrupt

## Status
Approved

## Context
The M29.1 UAT (real TUI, real terminal, real installed provider CLIs) interrupted a busy worker
(Bob, running a real Codex task) and observed the in-app state update instantly and correctly
("→ Interrupted Bob.", `Status: IDLE`) — but a follow-up `ps` check found the real `codex`
process was **still running**, minutes later, until manually `kill -9`'d.

Root cause, confirmed by inspecting the real process tree: the installed `codex` CLI's own entry
point (`~/.nvm/.../bin/codex`) is a **Node.js launcher script**, which itself forks the real
native binary (`.../codex-darwin-arm64/vendor/.../bin/codex`) as its own child process. SE-OS's
`child_process.spawn('codex', args)` call only ever gets a handle to the launcher — the direct
child. `IRuntimePlugin.cancel()` called `child.kill('SIGKILL')` on that one handle; the launcher
died, but the native binary it had already forked was reparented (observed with `PPID 1`) and kept
running untouched, doing real work SE-OS could no longer see or control.

This is not Codex-specific in principle — any CLI that wraps its real work in a
launcher/subprocess (common for cross-language tooling: a Node/Python/shell shim invoking a
native or differently-packaged binary) has the same exposure. It happens that the two other
installed CLIs tested (`claude`, and `gemini` once Fix #4 lets it run) are single processes with
no such wrapper, which is precisely why this bug was invisible until real multi-provider testing.

## Decision
Kill the process **group**, not just the single tracked process:

- `cli_process_executor.ts` gains `defaultCliProcessSpawner`, the real spawner every plugin now
  defaults to, which calls `spawn(executable, args, { detached: true })`. `detached: true` makes
  the spawned process the leader of its **own new OS process group** — a prerequisite for
  group-based signaling; without it there is no group boundary distinct from SE-OS's own to target.
- `killProcessGroup(child, signal)` sends the signal to `-child.pid` (the negative-PID convention
  that targets an entire process group) instead of `child.pid`. Any real descendant the direct
  child forked — a launcher's native binary, or any other grandchild — dies with it. Falls back to
  a plain `child.kill()` when the child has no PID (a fake/mocked child in tests) or the group is
  already gone (`ESRCH`), so it degrades safely rather than throwing.
- `CliRuntimePlugin.cancel()`/`.shutdown()` and `ClaudeCodeRuntimePlugin.cancel()`/`.shutdown()`,
  and the timeout path inside `runCliProcess()`, all now call `killProcessGroup()` instead of
  `child.kill()` directly — every real cancellation path in the codebase, not just the one the
  UAT happened to exercise.
- The injectable `CliProcessSpawner`/`ClaudeProcessSpawner` **type signature is unchanged**
  (`(executable, args) => ChildProcess`) — only the *default* real implementation changed. Every
  existing test's fake spawner keeps working exactly as before; none needed updating.

### Alternatives considered
1. **Track and kill each provider's real process tree by walking `/proc` (or `ps`-parsing on
   macOS) at cancel time**, rather than relying on process groups. Rejected: significantly more
   code, platform-specific parsing, and strictly inferior to the OS-native process-group mechanism
   that exists for exactly this purpose.
2. **Use a third-party tree-kill package.** Rejected: the standard `detached: true` +
   negative-PID pattern is a few lines of real, well-understood Node.js/POSIX behavior with zero
   new dependencies — pulling in a package for this would be disproportionate.
3. **Widen `CliProcessSpawner`'s type to accept a `SpawnOptions` argument, so `detached` is
   explicit at every call site instead of baked into a new default.** Rejected: every real call
   site should always spawn detached — there's no legitimate reason for a real plugin to opt out —
   so a single corrected default is simpler and can't be forgotten at a new call site the way an
   optional parameter could be.
4. **Do nothing until Fix #3 (Claude stdin hang) and Fix #4 (Gemini trust gate) are fixed, since
   those also block real multi-task missions from reaching Bob/Codex easily.** Rejected: the bug
   and its fix are independent of those two — verified via both a direct process-group unit test
   that faithfully reproduces the exact wrapper/grandchild shape observed in the UAT, and a live
   real-TUI interrupt against Alice/Claude (proving the general mechanism), rather than waiting on
   unrelated fixes to reach Bob specifically through the live UI.

## Consequences
- Interrupting (or timing out, or shutting down) a worker now genuinely stops all the real OS-level
  work it triggered, including any process a wrapper CLI forked — not just the one process SE-OS
  happened to hold a handle to.
- Spawned processes are no longer in the same process group as SE-OS itself. This has no observed
  behavioral effect on signal delivery from `ProcessGuardian` (ADR-0008) — SIGTERM/SIGINT are
  delivered to the SE-OS process directly by the OS/terminal, not propagated through its process
  group to children, and `Kernel.shutdown()` already explicitly stops every worker itself rather
  than relying on group-wide signal propagation.
- A regression test (`tests/v2/reliability/process_group_kill.test.ts`) both proves the fix works
  and proves the bug was real: one test spawns a real parent that forks a real grandchild (mirroring
  the exact Codex-observed shape), confirms a plain `child.kill()` — the old behavior — leaves the
  grandchild running, and confirms `killProcessGroup()` — the new behavior — kills both.
