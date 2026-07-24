# ADR-0007: Terminal Log Rotation & Removal-Triggered Cleanup

## Status
Approved

## Context
`WorkerTerminalLog` (introduced in Milestone 28) is the one real, on-disk store of what a worker's
process actually printed — both the in-TUI Terminals tab and real tmux panes read from the same
file. Two gaps in it were flagged by the production-readiness audit as real problems at the
project's target scale (1000+ workers, months-long project conversations, continuous usage):

1. **Unbounded growth.** `append()` did a plain `fs.appendFileSync` with no size limit. A worker
   left running for months, or one that's simply chatty, accumulates a log file that grows forever.
2. **No cleanup on removal.** Nothing ever deleted a worker's log file. `LocalProcessSupervisor.
   stopWorker()` already removes the worker from `WorkerStore` (its one real source of truth, per
   ADR-0005) but left the log file behind unconditionally — including the correct case, since
   `restartWorker()` internally calls the same `stopWorker()` and must NOT lose the worker's real
   history over a mere process hiccup. A genuinely decommissioned worker's log, though, is now an
   orphaned file that nothing on disk points back to, accumulating indefinitely as the workforce
   turns over.

## Decision
- **Size-based rotation, not truncation.** `WorkerTerminalLog` now checks the active log's size
  before every append; once it reaches 5MB, the whole file is renamed to `<id>.log.1` (overwriting
  any previous backup) and a fresh file is started. Truncating a live file in place was rejected
  because real tmux panes `tail -f` this exact file — truncating mid-read desyncs the follower.
  Renaming and starting fresh is the same mechanism standard tools like `logrotate` use for exactly
  this reason. This bounds each worker's on-disk footprint to roughly 2x the threshold (current +
  one backup) indefinitely, regardless of how long the worker has been running.
- **Explicit `preserveLog` on `LocalProcessSupervisor.stopWorker()`.** `stopWorker()` is the one
  path that removes a worker from `WorkerStore`, but it is called from two different intents:
  `SeOsCli.workerStop()`/`workerKill()` (a genuine, permanent removal) and `restartWorker()`'s
  internal stop-then-respawn (the same worker id coming right back). Rather than infer intent from
  context, the caller states it explicitly: `restartWorker()` calls `stopWorker(id, { preserveLog:
  true })`; every other caller uses the default (`false`), which deletes the worker's log files
  (`WorkerTerminalLog.remove()`) and emits a new `WorkerRemoved` domain event once `WorkerStore.
  remove()` actually succeeds.
- `LocalProcessSupervisor` now takes an optional `WorkerTerminalLog` in its constructor (mirroring
  how it already takes an optional `IEventStore`) so it can call `remove()` directly — a plain,
  traceable method call rather than routing a synchronous file deletion through the async event bus.
  `WorkerRemoved` is still emitted as a real domain event for any future subscriber (e.g. a TUI tab
  auto-closing when its worker is decommissioned), it just isn't what triggers the deletion itself.

### Alternatives considered
1. **Truncate the log in place instead of rotating.** Rejected: breaks any active `tail -f`
   follower (real tmux panes) reading the file at truncation time, and loses all history instantly
   instead of keeping one bounded backup.
2. **Infer "genuine removal" vs. "restart" by having `restartWorker()` avoid calling `stopWorker()`
   at all** (e.g. keep the child process's slot and just replace the underlying process). Rejected
   as out of scope here: it would require `WorkerStore` to support in-place identity-preserving
   updates instead of register/remove, a larger change to the entity lifecycle than this ADR's
   scope (log lifecycle). The explicit `preserveLog` flag solves the immediate problem without
   that redesign; revisiting `restartWorker()`'s register/remove round-trip is a reasonable future
   ADR on its own.
3. **Delete the log file inside `WorkerStore.remove()` instead of `LocalProcessSupervisor.
   stopWorker()`.** Rejected: `WorkerStore` is a pure in-memory registry with no filesystem
   knowledge and no reason to gain any (see ADR-0005's "one source of truth for worker state," not
   "one source of truth for every worker-adjacent side effect"). `LocalProcessSupervisor` already
   owns real OS-level side effects (spawning/killing real processes) and is the natural owner of
   this one too.
4. **Time-based log retention (delete logs older than N days) instead of removal-triggered
   deletion.** Rejected as solving a different problem: an active, long-running worker's log should
   never be deleted regardless of age; the actual leak is orphaned files for workers that no longer
   exist, which removal-triggered cleanup addresses directly and immediately instead of on a delay.

## Consequences
- A worker's on-disk log footprint is now bounded (~2x the 5MB threshold) for as long as it keeps
  running, no matter how long that is.
- A genuinely removed worker leaves no orphaned log file behind; a restarted worker keeps its real
  history exactly as before.
- `LocalProcessSupervisor`'s constructor signature changed (`terminalLog` is a new third
  parameter); `Kernel` was updated to construct `WorkerTerminalLog` before `LocalProcessSupervisor`
  so it can be passed in, and to pass it in production. Test call sites that don't care about log
  lifecycle can omit it — it's optional, and `stopWorker`/`restartWorker` no-op the cleanup call
  safely via `this.terminalLog?.remove(id)` when absent.
- `WorkerRemoved` is a new domain event, additive only — no existing consumer changes behavior
  because of it.
