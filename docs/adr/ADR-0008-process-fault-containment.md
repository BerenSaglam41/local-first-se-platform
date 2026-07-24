# ADR-0008: Process-Level Fault Containment & Worker Self-Healing

## Status
Approved

## Context
Milestone 29's current-state audit (see `docs/roadmap/M29-production-readiness.md` §1.2–1.3)
found SE-OS had zero process-level fault containment. Verified by direct inspection: no
`process.on('SIGTERM'|'SIGINT'|'uncaughtException'|'unhandledRejection', ...)` handler existed
anywhere in `src/v2`. A `Ctrl+C` or a container's `SIGTERM` killed the process before
`Kernel.shutdown()` ever ran — no clean SQLite close, no drain of in-flight work. A single
uncaught exception or rejected promise anywhere in the process — a plugin, a worker callback, a
TUI render — crashed the entire company silently, with no log trace of what happened or why.

Separately, `LocalProcessSupervisor` already correctly *detects* a real worker crash (its child
`exit` handler sets `processState = 'CRASHED'` and emits a real `WorkerFailed` domain event), but
nothing in the system ever acted on that event. A crashed worker stayed dead until a human
manually ran `worker-restart` — the opposite of "runs for weeks without manual intervention."

A third, self-inflicted issue surfaced during this same audit: `Kernel.shutdown()`
(`kernel.ts`) called `supervisor.stopWorker(w.id)` for every worker with no `preserveLog` flag.
Since ADR-0007 introduced `preserveLog` specifically to distinguish "this worker is being
permanently removed" (delete its terminal log) from "this worker is merely restarting" (keep it),
omitting the flag meant a **clean, intentional process shutdown** — the whole company closing for
the night — was indistinguishable from firing every single employee. Every worker's real terminal
history was deleted on every graceful exit.

## Decision

### Process-level containment: `ProcessGuardian`
A new, dependency-free class (`src/v2/infrastructure/resilience/process_guardian.ts`) installs
all four handlers and treats two categories of event differently, on purpose:

- **Signals (`SIGTERM`/`SIGINT`) are an *expected* request to stop.** The guardian calls the
  supplied `onShutdownSignal` (wired to `Kernel.shutdown()` via `SeOsCli.shutdown()`), then exits
  0 on success or 1 if the drain itself throws. A second signal received mid-drain is logged and
  ignored rather than re-entering shutdown.
- **`uncaughtException`/`unhandledRejection` are an *unexpected* failure of unknown origin.** The
  containment policy is: **log with full context, attempt the same clean shutdown, then exit
  non-zero** — never swallow-and-continue. Continuing to run after an exception whose cause and
  blast radius are unknown risks limping along with silently corrupted in-memory state (a
  `WorkerStore` or `ReasoningCoordinator` in an inconsistent condition is harder to diagnose than
  a clean, visible crash-and-restart). Only specific, well-understood failure modes — a single
  plugin's `execute()` throwing, already caught at that exact call site inside
  `ReasoningCoordinator` — get contained-and-continue treatment; those are not what
  `uncaughtException` is for.
- Every callback and the actual `process.exit()` call are injectable (`exit`, `logger`,
  `process`), so the real signal/exception handling logic is exercised by real
  `process.emit('SIGTERM', ...)`/`process.emit('uncaughtException', ...)` calls in tests — the
  standard, documented way to test Node signal handlers — without ever calling a real
  `process.exit()` inside the test process itself.
- Installed once, in `bin.ts`, before `Kernel.boot()` runs — so the process is protected for its
  entire lifetime, including failures during boot itself.

### Worker self-healing: `WorkerLifecyclePolicy`
A new class (`src/v2/application/worker/worker_lifecycle_policy.ts`), constructed once inside
`Kernel.boot()` and subscribed to the supervisor's already-real `WorkerFailed` event:

- On a crash, restarts the worker after an exponential backoff
  (`min(backoffBaseMs * 2^attempt, backoffMaxMs)`, both configurable, defaulting to 1s→30s).
- Tracks crash timestamps per worker within a sliding window (`windowMs`, default 5 minutes).
  Exceeding `maxCrashesInWindow` (default 5) marks the worker `'QUARANTINED'` — a new, honest,
  visible `WorkerProcessState` value (additive to the existing union, not a rename) — and stops
  auto-restarting it. This is a deliberate, bounded circuit-breaker on the restart loop itself: a
  worker crashing because of a real, permanent cause (bad config, a missing dependency) must not
  restart-loop forever burning CPU and OS resources while looking like healthy "self-healing."
- Quarantine is only cleared by an explicit `clearQuarantine()` call — never automatically. Auto-
  clearing would defeat the entire point of a visible, human-actionable terminal state.
- Requires **no special-casing** to avoid firing on an intentional `workerStop()`/`killWorker()`:
  `LocalProcessSupervisor` only emits `WorkerFailed` when its child process exits *on its own*
  with a real non-zero exit code. A supervisor-initiated stop/kill terminates the child by signal
  (Node reports `code: null` for a signal-terminated process), which never satisfies the
  `code !== 0 && code !== null` condition `WorkerFailed` is gated on — the distinction the policy
  needs already exists at the source, verified directly by reading `spawnWorker()`'s exit handler
  rather than assumed.

### The `shutdown()`/`preserveLog` fix
`Kernel.shutdown()` now calls `supervisor.stopWorker(w.id, { preserveLog: true })` for every
worker — a full-process shutdown is not a removal of any individual worker, and must not trigger
ADR-0007's removal-cleanup behavior. An individual `workerStop()`/`workerKill()` CLI call remains
a genuine removal and is unaffected.

### Alternatives considered
1. **Swallow `uncaughtException`/`unhandledRejection` and keep running.** Rejected: this is
   exactly the failure mode ADR-0005 spent an entire milestone eliminating in a different
   form — multiple silently-drifting sources of truth. An error of truly unknown origin is far
   more likely to have left some in-memory state (which store, which map, is not knowable from the
   error itself) inconsistent than to be safely ignorable.
2. **Unlimited auto-restart with no quarantine.** Rejected as the exact "infinite crash loop"
   risk flagged in the M29 roadmap's own risk register (§6, Risk 3) — indistinguishable from a
   real self-healing system until it silently burns resources forever on a worker that will never
   actually recover on its own.
3. **Infer "was this an intentional stop or a real crash" by tracking supervisor-issued kill
   intent explicitly (a flag set before calling `child.kill()`), rather than relying on the
   existing exit-code check.** Rejected as unnecessary: the existing `code !== 0 && code !== null`
   gate on `WorkerFailed` already correctly distinguishes the two cases (verified by reading the
   code, not assumed), so adding a second, parallel signal to track the same distinction would be
   exactly the kind of duplicate-source-of-truth problem ADR-0005 already fixed once.
4. **Fix the `shutdown()`/`preserveLog` conflation as an isolated one-line patch, independent of
   this ADR.** Rejected per the M29 roadmap's own stated reasoning (§1.3): the correct fix depends
   on this same ADR's shutdown-vs-crash semantics being settled first, so it belongs here, not as
   a disconnected patch.

## Consequences
- The process can no longer die silently. Every signal and every uncaught error is logged with
  context and results in either a clean shutdown or a non-zero exit — never a trace-less crash.
- A crashed worker recovers on its own, within a bounded, documented backoff, without manual
  intervention — directly addressing the milestone's core question ("can this run for weeks
  without a human"). A permanently broken worker becomes visibly `QUARANTINED` instead of
  invisibly restart-looping.
- `Kernel.shutdown()` no longer destroys worker history as a side effect of the process simply
  exiting — a real regression, introduced by ADR-0007 and fixed here rather than left open.
- **Not yet addressed by this ADR**: what happens to a worker's *in-flight execution* across a
  crash-restart cycle (was it silently lost? Is it recoverable?) is explicitly the concern of
  ADR-0009 (Workstream B), which depends on this ADR's shutdown/crash semantics being
  distinguishable in the first place. This ADR does not attempt state recovery — only process and
  worker liveness.
- `WorkerProcessState` gains `'QUARANTINED'` as a new, additive union member. No existing switch
  or exhaustive match over this type exists in the codebase (verified by search before adding it),
  so this is non-breaking.
