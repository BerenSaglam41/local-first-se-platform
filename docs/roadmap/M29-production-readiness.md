# Milestone 29: Production Readiness

Status: **APPROVED. Workstream A in progress.**

This is a design document, not a changelog entry. Nothing in this file has been built yet.

## 0. Framing

M0–M28 built SE-OS's functionality: real workers, real multi-provider execution, real
conversations, real telemetry. Milestone 28's audit (ADR-0005/0006/0007) already fixed the
architectural debt *within* that functionality — one worker entity, no blocking I/O, bounded log
growth.

M29 asks a different question, not "does it work" but **"does it survive."** Specifically: can
one `se-os` process run for weeks, through crashes, provider outages, and process restarts,
without a human intervening? Today the honest answer is no, for reasons documented below with
file:line references, not guesses.

No new user-facing features ship in this milestone. Every deliverable either makes an existing
capability survive failure, makes failure visible, or proves survival under load.

---

## 1. Current-State Audit (why this milestone exists)

Findings below were verified by reading the actual code, not inferred from architecture docs.

### 1.1 Crash recovery / state persistence — does not exist
- `Kernel.boot()` (`src/v2/kernel/kernel.ts:145-170`) **always** spawns a fresh default (or
  config-file) workforce on every boot. It never asks "was there a workforce already running
  before this process died?" A crash and restart is indistinguishable from a first-ever boot.
- `WorkerStore`, `ProjectLifecycleOrchestrator.activeProjects`/`.projectHistory`
  (`project_lifecycle_orchestrator.ts:13-14`), and `ReasoningCoordinator.activeRequests` are all
  plain in-memory `Map`s with no persistence. Every worker's task history, token usage, active
  execution, and every project's conversation state is gone the instant the process exits, clean
  or not.
- The durable half of this already exists and is unused: `IEventStore.replayAll()` and
  `.readStream()` (`contracts/ievent_store.ts`) are fully implemented in `SqliteEventStore`
  (`infrastructure/storage/sqlite_event_store.ts:100-116`) — every domain event this whole system
  emits is already written to a real, durable, WAL-mode SQLite table. **Nothing reads it back.**
  It is a write-only audit log today. This is the single most important fact for this milestone:
  we are not inventing persistence, we are building the missing read side of persistence that
  already exists.

### 1.2 Process-level fault containment — does not exist
- `grep`-verified: there is no `process.on('SIGTERM', ...)`, `SIGINT`, `uncaughtException`, or
  `unhandledRejection` handler anywhere in `src/v2`. `Ctrl+C` or a container's `SIGTERM` kills the
  process with no chance for `Kernel.shutdown()` to run — no clean SQLite close, no drain of
  in-flight executions.
- One uncaught exception or rejected promise anywhere in the process — a plugin, a worker
  callback, a TUI render — crashes the entire company. There is currently no last line of
  defense. For "weeks of unattended uptime," this is the top risk in the whole codebase.

### 1.3 Worker lifecycle — detection exists, self-healing does not
- `LocalProcessSupervisor`'s child `exit` handler (`local_process_supervisor.ts:66-74`) correctly
  sets `processState = 'CRASHED'` and emits `WorkerFailed`. Nothing subscribes to that event to
  act on it. A crashed worker stays dead until a human runs `se-os worker-restart`.
- **Self-inflicted regression found during this audit**: `Kernel.shutdown()`
  (`kernel.ts:190-199`) calls `supervisor.stopWorker(w.id)` for every worker with no `preserveLog`
  flag. Since ADR-0007, that means a **clean, intentional shutdown** now deletes every worker's
  terminal log — the same code path meant only for *permanent removal*. `shutdown()` and
  `workerStop()` currently share one method with no way to express "the company is closing for
  the night" vs. "this employee is fired." This must be fixed as part of M29's lifecycle work, not
  patched in isolation, because the correct fix depends on the crash-recovery design (§2.2).

### 1.4 Provider lifecycle — no circuit breaking
- A provider CLI that starts failing (rate-limited, revoked credentials, binary removed
  mid-session) is retried at full speed on every single request routed to it, forever. There is no
  cool-down, no "this provider is currently unhealthy, stop trying it for N seconds," no
  distinction between "never installed" (already handled honestly, see ADR-0005/0006) and
  "was working, started failing right now."
- ADR-0007 already closed the specific leak where re-registering a plugin id orphaned the old
  instance's child process. That fix is a prerequisite for this milestone's circuit breaker (it
  needs a stable, singular plugin instance per id to track health against) but does not itself add
  the breaker.

### 1.5 Memory management / resource cleanup — partially bounded, not audited
- Good news, already in place: `Worker.history` caps at 25 entries
  (`domain/employees/worker.ts:40`), `TelemetryAggregator.logs`/`.events` cap at 100/50
  (`telemetry_aggregator.ts:51,67`), `WorkerTerminalLog` now rotates at 5MB (ADR-0007).
- Not yet done: no systematic sweep of every long-lived `Map`/array in the app for unbounded
  growth (e.g. `RuntimePluginRegistry.plugins`/`.capabilityMap`, `GitBranchCache`'s two maps keyed
  by workspace path — at 1000+ concurrently-used workspaces, is that bounded correctly?). No
  process-level RSS/heap ceiling or backpressure — nothing sheds load or refuses new work before
  hitting an OOM kill.

### 1.6 Load testing / performance profiling — does not exist
- There is no load-testing harness anywhere in the repo. Nobody has ever run SE-OS with more than
  a handful of workers or measured what happens at the stated target scale (1000+ workers, 20+
  providers). Every performance claim made in prior ADRs ("this won't block the event loop at
  scale") is a design argument, not a measurement.

### 1.7 Observability, logging, metrics, health — inconsistent, internal-only
- Logging today is plain `console.log`/`console.warn` scattered across the codebase (verified:
  `src/v2` has no structured logger; `src/infrastructure/logging/json_logger.ts` exists but is a
  **v1-only** component, never imported by anything under `src/v2`). No log levels, no
  machine-parseable format, nothing that survives past a terminal scrollback or that an external
  log aggregator could ingest.
- `TelemetryAggregator` is a real, honest source of truth (per M28's audit fixes) — but it is only
  reachable *from inside the same Node process* (`kernel.getTelemetryAggregator().getSnapshot()`).
  There is no way to ask a running `se-os` process "are you healthy" from outside it — no
  `se-os health` command, no HTTP/metrics endpoint, nothing a process supervisor (systemd, pm2,
  Docker healthcheck) could poll.

### 1.8 Documentation / test coverage — functional docs exist, operational docs do not
- The repo has good *design* documentation (`architecture.md`, ADRs, `workforce_operating_model.md`,
  etc.) but nothing that answers "the process has been running for 3 days and workers 12 and 47
  are stuck — what do I do." No coverage baseline has been measured for the reliability-critical
  modules specifically (`LocalProcessSupervisor`, `SqliteEventStore`, `ReasoningCoordinator`).
- All 48 existing test suites are correctness tests (does the feature work). None are reliability
  tests (does the system survive a kill -9 mid-task, does memory stay bounded over a sustained
  run, does a provider outage degrade gracefully).

---

## 2. Goals

1. **Zero silent total failure.** Any single unhandled error is logged, contained, and either
   recovered from or turned into a clean, observable shutdown — never a silent process death with
   no trace.
2. **A killed process comes back correctly.** `kill -9` on the `se-os` process, followed by a
   restart, reconstructs the real worker roster and in-progress project state from the durable
   event log, with the only acceptable data loss being work that was *genuinely in-flight* at the
   moment of the kill (and that work is honestly marked interrupted, not silently forgotten or
   silently resumed as if nothing happened).
3. **Workers and providers heal themselves within bounded limits.** A crashed worker restarts
   automatically with backoff; a failing provider is temporarily circuit-broken instead of
   hammered; both escalate to a visible, honest "needs a human" state after a bounded number of
   failures, rather than restart-looping forever.
4. **Memory and OS resource usage stay bounded regardless of session length.** No leak, no
   unbounded map/array, provable via a sustained load test, not just code review.
5. **The system's health is answerable from outside the process.** A health signal exists that a
   process manager or a human can check without attaching to the running TUI.
6. **All of the above is measured, not asserted.** Load tests, soak tests, and coverage numbers
   back every claim this milestone makes about itself.

## 3. Non-Goals (explicitly out of scope for M29)
- Multi-node / distributed deployment (still single-process, per ADR-0005's stated scope boundary).
- Multi-tenant isolation (still out of scope, unchanged from ADR-0005).
- Any new user-facing feature, CLI command that does something new, or UI screen.
- Real chunk-by-chunk streaming (still deliberately deleted per ADR-0005; not being revisited here).
- Horizontal scaling / clustering of the kernel itself.

---

## 4. Architecture

New code lands in new, narrowly-scoped modules rather than being smeared across existing files,
consistent with the Clean Architecture boundaries the project already holds itself to:

```
src/v2/
  infrastructure/
    resilience/
      process_guardian.ts        # installs SIGTERM/SIGINT/uncaughtException/unhandledRejection
                                  # handlers; owns graceful-drain sequencing at the process level
      circuit_breaker.ts         # generic, reusable open/half-open/closed breaker
    observability/
      structured_logger.ts       # leveled, JSON-capable logger; replaces ad hoc console.* in v2
      health_reporter.ts         # assembles a real HealthReport from kernel + telemetry state
      metrics_registry.ts        # in-process counters/gauges; exposes a snapshot, transport-agnostic
  application/
    recovery/
      event_replay_service.ts    # reads IEventStore.replayAll(), rehydrates WorkerStore /
                                  # ProjectLifecycleOrchestrator / ReasoningCoordinator state
      snapshot_store.ts          # periodic compacted snapshots so replay doesn't replay months
                                  # of history on every boot (see ADR-0009)
    worker/
      worker_lifecycle_policy.ts # auto-restart-with-backoff + quarantine decision logic,
                                  # subscribes to LocalProcessSupervisor's WorkerFailed event
    providers/
      provider_health_tracker.ts # wraps IRuntimePlugin.execute() results into circuit_breaker
                                  # state per provider id
tests/v2/
  reliability/
    crash_recovery.test.ts       # kills a real child `se-os` process, restarts it, asserts replay
    worker_self_healing.test.ts
    provider_circuit_breaker.test.ts
    memory_bounds.test.ts        # scripted sustained-load run with heap snapshots
  load/
    soak_test.ts                 # long-running (opt-in, not part of default `npm test`), scripted
docs/
  adr/
    ADR-0008 .. ADR-0012 (see §5)
  runbook/
    OPERATIONS.md                # "it's been running 3 days and X is stuck" — see §7 Workstream F
```

Nothing here replaces `WorkerStore`, `LocalProcessSupervisor`, `ReasoningCoordinator`, or
`TelemetryAggregator` — this milestone wraps and hardens the architecture ADR-0005 already
established, it does not re-litigate it.

### 4.1 How recovery actually works (the load-bearing design decision)

```
Process starts
     │
     ▼
Kernel.boot(mode: 'fresh' | 'resume')
     │
     ├─ 'fresh' (explicit, e.g. first-ever run, or --fresh flag): today's behavior, unchanged.
     │
     └─ 'resume' (default once a prior session exists):
             │
             ▼
        EventReplayService.rehydrate()
             │
             ├─ Load latest SnapshotStore snapshot (if any) — a compacted point-in-time
             │  reconstruction of WorkerStore/project state, taken periodically so replay
             │  doesn't have to walk the entire historical event log every boot.
             │
             ├─ replayAll() events strictly after the snapshot's watermark, applying them to
             │  rebuild WorkerStore / ProjectLifecycleOrchestrator / ReasoningCoordinator state
             │  in memory — the exact same state-mutation logic already triggered by those events
             │  live (e.g. WorkerSpawned → workerStore.register(), ReasoningCompleted →
             │  worker.completeExecution()), replayed instead of live-triggered.
             │
             └─ Any worker whose last known state was mid-execution (an activeExecution with no
                matching completion event) is NOT silently resumed and NOT silently marked
                completed — it is marked INTERRUPTED, honestly, because the real OS process that
                was running it is provably gone. This mirrors exactly how cancelForWorker()
                already marks manual interruptions (ADR-0005) — a crash is treated the same way a
                user-initiated interrupt already is, not as a new, special case.
     │
     ▼
Real OS processes are re-spawned for the recovered worker roster (LocalProcessSupervisor.
spawnWorker() as it does today) — recovery restores *data*, it does not attempt to resurrect the
exact old OS-level PIDs, which is impossible and unnecessary.
```

---

## 5. Proposed ADRs

Each will be written in full, in the established `docs/adr/ADR-NNNN-slug.md` format (Status /
Context / Decision / Alternatives Considered / Consequences), **during** implementation of its
corresponding workstream — not now. Listed here so their scope can be approved up front.

- **ADR-0008: Process-Level Fault Containment.** Signal handling policy (what SIGTERM does vs.
  SIGINT), the exact `uncaughtException`/`unhandledRejection` policy (log + attempt graceful
  shutdown, vs. log + continue — this is a real judgment call with real tradeoffs, see Risks §6),
  and the worker auto-restart backoff/quarantine algorithm.
- **ADR-0009: Crash Recovery via Event Replay.** Full rehydration design from §4.1: snapshot
  cadence and format, exactly which in-memory state is rehydrated vs. deliberately left ephemeral,
  how an in-flight execution at crash time is classified on resume, boot-time performance budget
  for replay at scale.
- **ADR-0010: Worker & Provider Lifecycle State Machines.** Formal worker states and legal
  transitions (extending, not replacing, `WorkerProcessState`), the provider circuit breaker's
  state machine (closed/open/half-open) and thresholds.
- **ADR-0011: Memory & Resource Ceilings.** Which maps/caches get bounds and what, backpressure
  policy when a ceiling is hit (reject new work vs. shed oldest vs. degrade a specific subsystem),
  and the load/soak test methodology used to validate it.
- **ADR-0012: Observability Architecture.** Structured logging format and levels, what the health
  report contains and how it's exposed (CLI command output is the M29 baseline; an optional
  HTTP endpoint is evaluated as an alternative, see Risks), what gets a metric vs. what stays a
  log line.

---

## 6. Risks

| # | Risk | Why it matters | Mitigation |
|---|------|-----------------|------------|
| 1 | Blanket `uncaughtException` handling can mask real bugs by "recovering" into corrupted in-memory state instead of failing loudly. | Silently continuing after an unknown-cause exception can be worse than crashing — a corrupted `WorkerStore` that limps along is harder to diagnose than a clean crash-and-restart. | ADR-0008 must define containment as *log with full context, attempt a clean drain/shutdown, exit* — not *swallow and continue* — for genuinely unknown errors. Only specific, well-understood failure types (e.g. a single plugin's execute() throwing) get contained-and-continue treatment; they already mostly do, via existing try/catch in ReasoningCoordinator. |
| 2 | Event replay at real scale (months of history, 1000+ workers) could make boot time unacceptable if done as a naive full replay every time. | A "production-ready" system that takes 20 minutes to restart isn't. | Snapshot-based replay (§4.1) bounds replay to "since last snapshot," not "since the beginning of time." Snapshot cadence and the resulting worst-case boot time are measured in the load test plan (§7), not assumed. |
| 3 | Auto-restart of crashed workers can create infinite crash loops that look like "self-healing" but are actually silently burning CPU/OS resources forever. | A worker crashing because of a real, permanent bug (bad config, missing dependency) should not restart forever. | Bounded backoff + quarantine: after N crashes within a time window, the worker is marked a stable, visible `QUARANTINED` state and stops auto-restarting — surfaced honestly, not hidden. Exact N and window are ADR-0010 decisions, tuned against the load test, not guessed. |
| 4 | Changing `Kernel.boot()`'s default behavior (fresh vs. resume) is a breaking change to all 48 existing test suites, which currently assume a fresh, deterministic default workforce every boot. | Breaking the existing green test suite mid-milestone violates the "commit only when green" discipline this project has held to since M28. | `boot()` gains an explicit `mode` parameter; tests continue passing `'fresh'` explicitly (a one-line, mechanical change per test file, done as its own sub-step with the full suite re-verified green before moving on) while real product entry points (`bin.ts`) default to `'resume'`. |
| 5 | Structured logging touches nearly every file that currently calls `console.log`. | A repo-wide mechanical rewrite done all at once is a huge, hard-to-review diff and a merge-conflict magnet if done as one commit. | Rolled out incrementally, one subsystem per commit (supervisor → reasoning → CLI → TUI), each verified green before the next — same discipline used for the M28 audit's Step 1–4 sequence. |
| 6 | Load/soak tests are slow by nature (a real soak test takes real wall-clock time). | If they're part of the default `npm test`, they will slow down or get skipped in normal development, defeating their purpose. | Kept in a separate `tests/v2/load/` path with its own `npm run test:load`/`test:soak` scripts, excluded from the default Jest `testMatch`, run deliberately (locally and/or in CI on a schedule) rather than on every commit. |
| 7 | An external HTTP metrics/health endpoint adds a network-facing surface to a tool that has had none — new attack surface, new dependency (an HTTP server), for a local-first tool. | Security/complexity cost may not be justified given SE-OS's local-first design center. | M29 ships the CLI-based health report (`se-os health` → JSON) as the baseline, load-bearing deliverable. An HTTP endpoint is evaluated but explicitly optional/deferrable in ADR-0012 — not assumed as required for "observability" to be considered done. |

---

## 7. Deliverables by Workstream

Each workstream is finished, tested, and committed independently before the next begins — the
same discipline used for M28's audit (Steps 1–4), per standing project convention.

**Workstream A — Process Resilience & Crash Containment**
- `infrastructure/resilience/process_guardian.ts` + wiring into `cli/bin.ts`
- Fix to `Kernel.shutdown()` / `LocalProcessSupervisor.stopWorker()` conflation (§1.3)
- `worker_lifecycle_policy.ts`: auto-restart with backoff + quarantine
- ADR-0008

**Workstream B — State Persistence & Crash Recovery**
- `application/recovery/event_replay_service.ts`, `snapshot_store.ts`
- `Kernel.boot(mode)` change, all 48 existing suites updated to pass `'fresh'` explicitly
- ADR-0009

**Workstream C — Worker & Provider Lifecycle Hardening**
- `infrastructure/resilience/circuit_breaker.ts`, `application/providers/provider_health_tracker.ts`
- Formal worker state machine extension
- ADR-0010

**Workstream D — Memory, Resource Cleanup & Load Testing**
- Full audit + fix pass of every long-lived Map/array in `src/v2` (documented findings, not just fixes)
- `tests/v2/load/soak_test.ts` + `npm run test:soak`
- Any backpressure/ceiling code the audit's findings require
- ADR-0011

**Workstream E — Observability: Logging, Metrics, Health**
- `infrastructure/observability/structured_logger.ts`, rolled out incrementally per §6 Risk 5
- `infrastructure/observability/health_reporter.ts` + `se-os health` CLI command
- `metrics_registry.ts` (in-process; external transport evaluated, not assumed, per §6 Risk 7)
- ADR-0012

**Workstream F — Documentation & Test Coverage**
- `docs/runbook/OPERATIONS.md`
- Coverage baseline measured and recorded for `LocalProcessSupervisor`, `SqliteEventStore`,
  `ReasoningCoordinator`, plus every module added in Workstreams A–E
- This M29 roadmap document itself, kept up to date as decisions are finalized

---

## 8. Test Plan

| Workstream | Test type | What it proves |
|---|---|---|
| A | Unit: `process_guardian` handler registration/behavior with simulated signals | Signals are actually caught and trigger the right drain sequence |
| A | Integration: spawn a real `se-os` child process, send it real `SIGTERM`, assert clean exit + closed DB | Graceful shutdown works end-to-end, not just in mocked unit tests |
| A | Unit: `worker_lifecycle_policy` given a scripted sequence of crash events | Backoff timing and quarantine threshold are correct |
| B | Integration: boot a kernel, spawn workers, do real work, `kill -9` the process, boot a new kernel against the same DB in `'resume'` mode | Real crash recovery — the actual scenario this milestone exists for |
| B | Unit: `event_replay_service` against a crafted event stream including a mid-execution crash | In-flight work at crash time is marked `INTERRUPTED`, never silently resumed or dropped |
| B | Unit: `snapshot_store` cadence and replay-since-snapshot correctness | Boot time stays bounded regardless of total historical event count |
| C | Unit: `circuit_breaker` state transitions (closed→open→half-open→closed) against scripted failure/success sequences | Breaker logic is correct in isolation |
| C | Integration: a provider plugin that fails N times in a row via `ReasoningCoordinator` | Real requests actually get short-circuited instead of hammering a broken provider |
| D | Scripted load test: spawn a large synthetic worker count, drive sustained task volume, sample heap/RSS at intervals | Memory stays bounded (no monotonic growth) under load, not just "looks fine in review" |
| D | `test:soak`: multi-hour scripted run (scaled-down proxy for "weeks") | No slow leak that only shows up over long real time |
| E | Unit: `structured_logger` output format/levels | Log output is genuinely machine-parseable |
| E | Integration: `se-os health` against a live kernel in various states (healthy, degraded, a quarantined worker present) | The health report is honest, not a static "OK" |
| F | `npm run test:coverage` run against Workstreams A–E's new modules | Coverage numbers are measured and recorded, not assumed |

Load/soak tests live in their own `npm run test:load` / `test:soak` scripts (§6 Risk 6), never
part of default `npm test`.

---

## 9. Acceptance Criteria

M29 is done when all of the following are true, each independently verifiable:

1. Killing the `se-os` process with `kill -9` mid-task, then restarting it, reconstructs the real
   worker roster and project state from the event log; the task that was genuinely in-flight is
   marked `INTERRUPTED`, not silently lost or silently resumed.
2. A worker's crashed OS process is automatically restarted within a bounded, documented backoff
   window, without any human running a CLI command — and a worker that keeps crashing is
   `QUARANTINED` (visible, honest, not hidden) after a documented threshold rather than
   restart-looping forever.
3. A provider that starts failing is circuit-broken — requests routed to it fail fast with a clear
   reason instead of each one independently retrying a broken CLI at full speed.
4. `Ctrl+C`/`SIGTERM` always results in `Kernel.shutdown()` actually running — clean SQLite close,
   no orphaned child processes — and no longer deletes worker terminal logs as a side effect (the
   §1.3 regression is fixed as part of this, not left open).
5. No unhandled exception or rejected promise anywhere in the process results in a silent crash
   with no log trace; the documented containment policy from ADR-0008 is what actually runs.
6. A scripted soak test run of at least several hours shows bounded, non-monotonic memory usage —
   numbers are in the test output, not asserted from code review.
7. `se-os health` (or equivalent) returns a real, current, honest report of kernel/worker/provider
   state, checkable without attaching to the running TUI.
8. `docs/runbook/OPERATIONS.md` exists and covers, at minimum: how to check health, how to
   interpret a `QUARANTINED` worker or an `OPEN` circuit breaker, and how to manually recover if
   automatic recovery doesn't resolve an issue.
9. ADR-0008 through ADR-0012 are written, each with real alternatives considered and rejected —
   not written after the fact to rubber-stamp whatever was already built.
10. The full existing test suite (48 suites today, more once M29's own tests are added) is green;
    `npx tsc --noEmit` and `npm run build` are clean; every workstream was committed only once
    stable, per the project's standing discipline.

---

## 10. Sequencing

A → B → C → D → E → F, in that order — each workstream depends on assumptions the previous one
either establishes or would otherwise invalidate:

- **A before B**: fixing the shutdown/log-deletion conflation and establishing clean-drain
  semantics has to happen before crash-recovery testing (B) can trust that a "clean" shutdown and
  a "crash" are actually distinguishable events.
- **B before C**: the worker lifecycle policy (C) needs to know what state a worker resumes into
  after a restart before it can correctly decide when to auto-restart vs. quarantine it.
- **C before D**: the memory/load audit (D) should run against the lifecycle policies from C in
  place, so the soak test is measuring the system M29 will actually ship, not an intermediate one.
- **D before E**: metrics/health reporting (E) should surface the real ceilings and thresholds D
  established, not invented numbers.
- **F last**, continuously updated: documentation and the coverage baseline are written against
  the finished behavior of A–E, not speculatively ahead of it.

---

## 11. Workstream Breakdown

Per-workstream operational detail, expanding §7's deliverable list. No time estimates are given —
this codebase's own history (M0–M28, the M28 audit) has no wall-clock data to honestly estimate
from, so "scope" below is relative complexity and file-count, not a duration guess. Each
workstream is completed, tested, documented, and committed independently — the next does not
start until the current one is green and committed, no exceptions.

### Workstream A — Process Resilience & Crash Containment

- **Objective**: The process never dies silently, and always gets a chance to shut down cleanly.
  Lay the self-healing foundation — a crashed worker auto-restarts with bounded backoff and
  escalates to a visible `QUARANTINED` state instead of restart-looping forever.
- **Estimated scope**: Small–Medium. ~3 new source files, ~2 new test files, 1 ADR, 3 small
  modified files.
- **Dependencies**: None on other M29 workstreams — this is first in sequence. Depends on
  existing, already-stable infrastructure: `LocalProcessSupervisor`'s `WorkerFailed` event,
  `Kernel.boot()`/`shutdown()`, the `EventEmitter`-based domain event pattern used throughout.
- **Files expected to change**:
  - New: `src/v2/infrastructure/resilience/process_guardian.ts`,
    `src/v2/application/worker/worker_lifecycle_policy.ts`,
    `tests/v2/reliability/process_guardian.test.ts`,
    `tests/v2/reliability/worker_lifecycle_policy.test.ts`,
    `docs/adr/ADR-0008-process-fault-containment.md`
  - Modified: `src/v2/cli/bin.ts` (install the guardian), `src/v2/kernel/kernel.ts` (fix the
    `shutdown()`/`preserveLog` conflation from §1.3, construct/wire the lifecycle policy, expose
    `getWorkerLifecyclePolicy()`), `src/v2/domain/employees/worker.ts` (add `'QUARANTINED'` to
    `WorkerProcessState` — an additive, honest new state, not a rename)
- **Migration risk**: Low–Medium. The `shutdown()` fix must not regress ADR-0007's genuine
  removal-cleanup behavior — a clean process exit and a permanent single-worker removal must stay
  distinguishable. Auto-restart must not fire on an *intentional* kill (`workerKill`/`workerStop`)
  — only on an unexpected non-zero exit — verified explicitly, since the existing kill test
  (`milestone2_local_runtime.test.ts`) asserts a killed worker stays removed.
- **Rollback strategy**: Single self-contained commit. `process_guardian.ts` is only invoked from
  `bin.ts`'s entrypoint — no other module imports it, so reverting removes it cleanly with zero
  cascade. `worker_lifecycle_policy.ts` is wired once, inside `Kernel.boot()`; nothing later in
  the sequence (B–F) exists yet to depend on it, so it can be reverted in isolation if a problem
  surfaces.
- **Validation strategy**: Unit tests drive real `process.emit('SIGTERM'|'SIGINT'|
  'uncaughtException'|'unhandledRejection', ...)` against a real installed `ProcessGuardian` (the
  standard, documented way to exercise real Node signal/error handlers without spawning a second
  OS process) and assert the injected shutdown/fatal callbacks fire exactly once each, with a
  second signal not double-invoking. `worker_lifecycle_policy` unit tests script a sequence of
  `WorkerFailed` events against a real `LocalProcessSupervisor` + real (fast, dummy-script) child
  processes and assert backoff timing and the quarantine threshold. Full existing suite,
  `tsc --noEmit`, and `npm run build` stay green throughout.
- **Acceptance criteria**:
  1. `SIGTERM`/`SIGINT` reliably trigger `Kernel.shutdown()` before the process exits.
  2. An uncaught exception or unhandled rejection is logged with real context and triggers a
     clean-shutdown attempt — never a silent crash, never swallow-and-continue.
  3. A worker whose process exits with a non-zero code auto-restarts within a bounded, documented
     backoff; after a documented consecutive-crash threshold it becomes `QUARANTINED` and stops
     auto-restarting.
  4. `Kernel.shutdown()` no longer deletes worker terminal logs as a side effect — covered by a
     regression test.
  5. `killWorker()`/`stopWorker()`-initiated (intentional) worker removal does not trigger
     auto-restart.
  6. Full suite green, `tsc --noEmit` clean, `npm run build` clean, ADR-0008 written and committed.

### Workstream B — State Persistence & Crash Recovery

- **Objective**: A process restart after a crash reconstructs real worker/project state from the
  already-durable event log instead of always booting a fresh default workforce.
- **Estimated scope**: Medium–Large. The largest *mechanical* footprint in the milestone: every
  existing test that calls `kernel.boot(...)` (~30+ files) needs a one-line, mechanical update to
  keep today's behavior explicit.
- **Dependencies**: Workstream A — replay's "was this worker's last state a clean stop or a
  crash" logic is only trustworthy once A's shutdown/crash semantics are actually distinguishable.
- **Files expected to change**:
  - New: `src/v2/application/recovery/event_replay_service.ts`,
    `src/v2/application/recovery/snapshot_store.ts`,
    `tests/v2/reliability/crash_recovery.test.ts`,
    `tests/v2/reliability/event_replay_service.test.ts`,
    `docs/adr/ADR-0009-event-replay-recovery.md`
  - Modified: `src/v2/kernel/kernel.ts` (`boot(configPath, mode)`), `src/v2/cli/bin.ts` (real
    entry point defaults to `'resume'`), ~30–40 existing test files (mechanical:
    `kernel.boot(path)` → `kernel.boot(path, 'fresh')`, preserving today's exact behavior
    everywhere that isn't specifically testing recovery)
- **Migration risk**: **High** — the largest risk in the milestone. Two distinct hazards: (a)
  breaking the existing green suite via the `boot()` signature change (mitigated by an explicit
  `mode` parameter defaulting to today's exact behavior when omitted — nothing changes unless a
  caller opts in); (b) replay logic subtly diverging from live mutation logic (e.g. replaying a
  `WorkerSpawned` event must reconstruct *data* only, never re-spawn a real OS process per
  historical event — real processes are spawned once, at the end, for the final reconstructed
  roster).
- **Rollback strategy**: `boot()`'s `mode` parameter is additive and defaults to current behavior
  when omitted, so any individual call site reverts independently with zero data-model migration
  — nothing is deleted, only additively read via already-existing `replayAll()`/`readStream()`.
  If `EventReplayService` proves unreliable, `bin.ts` reverts to not requesting `'resume'`,
  collapsing to exactly today's safe, fresh-boot behavior.
- **Validation strategy**: The load-bearing test is a real crash/restart cycle — boot a kernel,
  spawn real workers, do real work, send a real `SIGKILL` to a real spawned child process, boot a
  **second**, independent `Kernel` instance against the same SQLite file in `'resume'` mode, and
  assert the roster and history are reconstructed with the in-flight task honestly marked
  `INTERRUPTED`. Unit tests cover `snapshot_store` cadence and replay-since-snapshot correctness
  in isolation. Full suite green (including the mechanical `'fresh'` updates) is a hard gate
  before this workstream is considered done.
- **Acceptance criteria**:
  1. `kill -9` + restart in `'resume'` mode reconstructs the real worker roster and project state
     from the event log.
  2. An execution that was genuinely in-flight at crash time is marked `INTERRUPTED` on
     rehydration — never silently resumed, never silently dropped.
  3. Boot time in `'resume'` mode is bounded by replay-since-last-snapshot, not full event-log
     history — measured in the test output, not assumed.
  4. All existing suites pass unchanged in behavior with explicit `'fresh'` mode.
  5. Full suite green, `tsc --noEmit` clean, `npm run build` clean, ADR-0009 written and committed.

### Workstream C — Worker & Provider Lifecycle Hardening

- **Objective**: Formalize worker/provider health as real state machines; add a circuit breaker
  so a failing provider is temporarily short-circuited instead of hammered on every request.
- **Estimated scope**: Medium. One new, generic, reusable utility (`circuit_breaker.ts`) plus one
  integration point (`provider_health_tracker.ts`) wired into the reasoning dispatch path.
- **Dependencies**: Workstream B — deciding a worker's post-restart lifecycle state correctly
  depends on knowing what it resumed *into*, which B establishes.
- **Files expected to change**:
  - New: `src/v2/infrastructure/resilience/circuit_breaker.ts`,
    `src/v2/application/providers/provider_health_tracker.ts`,
    `tests/v2/reliability/circuit_breaker.test.ts`,
    `tests/v2/reliability/provider_health_tracker.test.ts`,
    `docs/adr/ADR-0010-lifecycle-state-machines.md`
  - Modified: `src/v2/application/reasoning/reasoning_coordinator.ts` (consult the breaker before
    dispatch), `src/v2/application/reasoning/worker_aware_runtime_selection_strategy.ts` (skip an
    `OPEN`-breaker provider where a sane fallback exists)
- **Migration risk**: Medium. Must be a no-op for the common/healthy case — a `CLOSED` breaker
  must behave exactly like today's direct dispatch. The real risk is threshold tuning: too
  aggressive falsely opens on transient errors; too lax never protects anything. Thresholds are
  explicit constructor parameters, not hardcoded, so they can be tuned without a redesign.
- **Rollback strategy**: `circuit_breaker.ts` is new and generic with no callers before this
  workstream — revert removes it cleanly. `provider_health_tracker`'s wiring into
  `ReasoningCoordinator` is the single integration point; reverting restores today's direct
  dispatch exactly.
- **Validation strategy**: Table-driven unit tests for every `circuit_breaker` state transition
  (closed→open→half-open→closed) against scripted failure/success sequences. An integration test
  drives a real plugin that fails N times in a row through the real `ReasoningCoordinator` and
  asserts subsequent requests short-circuit with a clear reason instead of invoking the plugin
  again. Full suite green.
- **Acceptance criteria**:
  1. A provider failing a documented number of consecutive times opens its breaker; further
     requests fail fast without invoking the real plugin.
  2. The breaker transitions to half-open after a cooldown and closes again on a real success.
  3. Worker and provider state machines are documented in ADR-0010, with `QUARANTINED`/`OPEN` as
     real, visible states — never silently hidden from telemetry.
  4. Full suite green, `tsc --noEmit` clean, `npm run build` clean, ADR-0010 written and committed.

### Workstream D — Memory, Resource Cleanup & Load Testing

- **Objective**: Systematically audit every long-lived in-memory collection for unbounded growth;
  prove bounded memory under sustained load with a real, scripted, measured soak test.
- **Estimated scope**: Medium–Large in audit breadth; likely small/surgical in code changes once
  findings are in — the audit itself is the first deliverable, matching how the M28 audit worked
  (audit, then fix what it finds, not guessed fixes ahead of evidence).
- **Dependencies**: Workstream C — the soak test should measure the system with C's lifecycle
  policy and circuit breaker already active, not an earlier intermediate state.
- **Files expected to change**:
  - New: `tests/v2/load/soak_test.ts`, `tests/v2/load/load_harness.ts`, `docs/adr/ADR-0011-memory-resource-ceilings.md`
  - Modified: `package.json` (`test:load`/`test:soak` scripts, excluded from default `test`);
    whichever specific modules the audit finds genuinely unbounded — not enumerable precisely
    until the audit runs (existing candidates already flagged: `RuntimePluginRegistry`'s maps,
    `GitBranchCache`'s maps at high concurrent-workspace counts)
- **Migration risk**: Low for the test harness (purely additive, never runs by default). Medium
  for any bounding fix applied to an existing long-lived map — an overly aggressive eviction
  policy could turn into a performance regression (e.g. evicting a cached git branch too early,
  causing more frequent real subprocess calls) rather than a correctness bug, but still worth
  care.
- **Rollback strategy**: Load/soak scripts are purely additive and never run by default `npm
  test` — zero risk to revert. Any bounding fix is a small, isolated, independently-revertible
  diff per file.
- **Validation strategy**: `soak_test.ts` run manually/on-demand (multi-hour, a scaled-down proxy
  for "weeks") sampling heap/RSS at intervals and asserting non-monotonic growth within a stated
  tolerance. A shorter, faster load test (many synthetic workers/tasks, sustained volume)
  validates the same property on a much shorter timescale for routine use.
- **Acceptance criteria**:
  1. Every long-lived `Map`/array in `src/v2` is audited; findings (bounded / unbounded-and-fixed
     / deliberately unbounded-with-justification) are documented in ADR-0011.
  2. Any genuinely unbounded collection found is either bounded or explicitly justified.
  3. A soak test run of several hours shows bounded, non-monotonic memory — numbers are real
     recorded test output, not a code-review assertion.
  4. `test:load`/`test:soak` scripts exist and are excluded from default `npm test`.
  5. Full suite green, `tsc --noEmit` clean, `npm run build` clean, ADR-0011 written and committed.

### Workstream E — Observability: Logging, Metrics, Health

- **Objective**: Give the running process a real, externally-checkable health signal; replace ad
  hoc `console.log` with structured, leveled logging; expose in-process metrics.
- **Estimated scope**: Large in file *count* touched (the logging rollout mechanically touches
  every file that currently calls `console.log`/`.warn`) but low complexity per change. Per §6
  Risk 5, this workstream itself proceeds in incremental, separately-committed sub-steps
  (supervisor → reasoning/recovery/lifecycle → CLI → TUI), the same discipline used for the M28
  audit's Steps 1–4 — not one giant commit.
- **Dependencies**: Workstream D — health/metrics should surface the real ceilings and
  thresholds D established (memory bounds, circuit-breaker state, quarantine counts), not
  invented numbers.
- **Files expected to change**:
  - New: `src/v2/infrastructure/observability/structured_logger.ts`,
    `src/v2/infrastructure/observability/health_reporter.ts`,
    `src/v2/infrastructure/observability/metrics_registry.ts`,
    `tests/v2/reliability/structured_logger.test.ts`,
    `tests/v2/reliability/health_reporter.test.ts`,
    `docs/adr/ADR-0012-observability-architecture.md`
  - Modified: incrementally, `local_process_supervisor.ts`, `reasoning_coordinator.ts`,
    `event_replay_service.ts`, `worker_lifecycle_policy.ts`, `se_os_cli.ts` (new `health`
    subcommand), TUI components — each subsystem its own commit
- **Migration risk**: Low functionally (log output format changing doesn't change program
  behavior) but high in diff-review burden if not sequenced incrementally — this is exactly §6
  Risk 5. `health_reporter` carries a distinct architectural risk: it must read from the *same*
  single sources of truth (`WorkerStore`, `ProviderRegistry`, the circuit breaker, the lifecycle
  policy) rather than becoming a second, independently-drifting source of truth — the same class
  of bug ADR-0005 already fixed once for worker state.
- **Rollback strategy**: The logging rollout is mechanical and reversible per-commit, one
  subsystem at a time. `health_reporter`/`metrics_registry` are additive new surfaces with no
  existing behavior depending on them — fully revertible without cascade.
- **Validation strategy**: Unit tests for `structured_logger` output format/levels. An
  integration test drives `se-os health` (or its underlying reporter) against a live kernel in
  multiple real states — healthy, a quarantined worker present, an open circuit breaker present —
  and asserts the report reflects that real state, not a static "OK". Full suite green after each
  incremental logging-rollout commit, not just at the end.
- **Acceptance criteria**:
  1. A real health-report surface returns current, honest kernel/worker/provider/circuit-breaker
     state as structured (JSON) output, checkable without attaching to the running TUI.
  2. Structured logging is in place for at least the reliability-critical modules added across
     A–E (supervisor, reasoning coordinator, recovery, lifecycle policy, circuit breaker) — scope
     explicitly agreed, not silently expanded mid-workstream.
  3. No behavior change to any existing feature from the logging rollout — verified by the full
     suite staying green after every incremental commit.
  4. Full suite green, `tsc --noEmit` clean, `npm run build` clean, ADR-0012 written and committed.

### Workstream F — Documentation & Test Coverage

- **Objective**: Close the milestone out honestly — an operations runbook, a measured coverage
  baseline, and this roadmap reconciled against what was actually built.
- **Estimated scope**: Small–Medium; primarily documentation, minimal-to-no source changes
  expected.
- **Dependencies**: Workstreams A–E complete — sequenced last deliberately, so documentation
  describes finished, real behavior rather than a plan.
- **Files expected to change**:
  - New: `docs/runbook/OPERATIONS.md`
  - Modified: `docs/roadmap/M29-production-readiness.md` (reconciled against final state),
    `CHANGELOG.md` (M29 completion entry, consistent with the M27/M28 changelog convention)
- **Migration risk**: Minimal — documentation-only. The only real risk is drift if written before
  A–E are genuinely finished, mitigated by being sequenced strictly last.
- **Rollback strategy**: Trivial — pure documentation changes, revert if inaccurate.
- **Validation strategy**: `npm run test:coverage` run and recorded for
  `LocalProcessSupervisor`, `SqliteEventStore`, `ReasoningCoordinator`, plus every module added in
  A–E. The runbook is reviewed line-by-line against every item in §9's milestone-level acceptance
  criteria to confirm it actually explains how to check and interpret each one.
- **Acceptance criteria**:
  1. `OPERATIONS.md` exists and covers: how to check health, how to interpret a `QUARANTINED`
     worker or an `OPEN` circuit breaker, and how to manually recover when automatic recovery
     doesn't resolve an issue.
  2. Coverage baseline is measured and recorded for the specified modules.
  3. ADR-0008 through ADR-0012 all exist with real alternatives-considered sections.
  4. Full suite green, `tsc --noEmit` clean, `npm run build` clean — the final milestone-closing
     state.

---

## 12. Implementation Reports

A workstream is not considered complete until its implementation is finished, all affected tests
pass, new tests are added where appropriate, documentation is updated, the work is committed, and
a short report exists here explaining what changed, why, and what risks remain. Each workstream
must leave the repository in a releasable state — this section is the durable record that it did.

### Workstream A — Process Resilience & Crash Containment

**Status**: Complete. Commit `ab19b16` (implementation), plus this documentation update.

**What changed**:
- `src/v2/infrastructure/resilience/process_guardian.ts` (new) — installs real
  `SIGTERM`/`SIGINT`/`uncaughtException`/`unhandledRejection` handlers. Signals trigger a supplied
  graceful-shutdown callback and exit 0; fatal errors of unknown origin are logged with full
  context, trigger the same graceful-shutdown callback, then exit 1. All callbacks and the actual
  `process.exit()` call are injectable for testing.
- `src/v2/application/worker/worker_lifecycle_policy.ts` (new) — subscribes to
  `LocalProcessSupervisor`'s existing `WorkerFailed` event; restarts a crashed worker with
  exponential backoff (default 1s→30s cap); after more than 5 crashes in a 5-minute window (both
  configurable), marks the worker `'QUARANTINED'` and stops auto-restarting it until an explicit
  `clearQuarantine()` call.
- `src/v2/domain/employees/worker.ts` — added `'QUARANTINED'` to `WorkerProcessState` (additive;
  confirmed via search that no exhaustive switch over this type exists anywhere in the codebase).
- `src/v2/kernel/kernel.ts` — constructs and registers `WorkerLifecyclePolicy` in `boot()`, exposes
  `getWorkerLifecyclePolicy()`; fixed `shutdown()` to call `stopWorker(id, { preserveLog: true })`
  for every worker instead of deleting their terminal logs on every clean exit.
- `src/v2/cli/bin.ts` — installs `ProcessGuardian` before `Kernel.boot()` runs, wired to
  `SeOsCli.shutdown()`.
- `docs/adr/ADR-0008-process-fault-containment.md` (new).
- 16 new tests across 3 new files under `tests/v2/reliability/`.

**Why it changed**: M29's current-state audit found the process had no way to shut down cleanly
on a real signal, no last line of defense against an uncaught error (which previously crashed the
entire company silently), and no self-healing for a worker whose crash was already correctly
detected but never acted on. Additionally, the audit surfaced a real regression from ADR-0007:
clean process shutdown was destroying every worker's terminal history. All three are prerequisites
for "runs for weeks without manual intervention" — see §2 Goals 1 and 3.

**Validation performed**: `npx tsc --noEmit` clean. `npm run build` clean (confirms `bin.ts`'s new
import bundles correctly). Full test suite green across 3 consecutive `npm test` runs
(274 + 7 = 281 tests total, up from 265 before this workstream). New tests exercise real behavior,
not mocks of the thing under test: real `process.emit()` against real installed handlers, a real
child process configured to genuinely crash (`node -e 'process.exit(1)'`), a real booted `Kernel`.
Explicit regression tests confirm intentional `workerStop()`/`killWorker()` never trigger
auto-restart, and that `Kernel.shutdown()` no longer deletes terminal logs.

**Risks / follow-ups deliberately left open**:
- What happens to a worker's *in-flight execution* across a crash-restart cycle (recoverable? was
  it silently dropped?) is explicitly out of scope here — that is Workstream B's (State
  Persistence & Crash Recovery) responsibility, which depends on this workstream's shutdown/crash
  semantics being settled first. Today, a crash still loses in-flight task state; only the
  worker's *liveness* self-heals.
- `LocalProcessSupervisor.restartWorker()` does not preserve the original `executable`/`args` used
  to spawn a worker — a restarted worker falls back to the default placeholder process args. This
  is not a regression from this workstream (pre-existing) and is harmless for real production
  workers (whose supervised placeholder process is always the same default `setInterval` liveness
  process regardless — actual AI provider work happens via separate, per-task child processes
  spawned by the plugins, not the supervised placeholder). Noted here for visibility; not fixed as
  part of Workstream A since it was outside this workstream's stated scope.
- Backoff/quarantine thresholds (5 crashes / 5 minutes, 1s–30s backoff) are reasonable defaults,
  not yet tuned against real load data — Workstream D's load testing is the natural place to
  revisit them if evidence suggests otherwise.

---

## Approval

This document proposes the full scope of M29 and, in §11, the operational breakdown of each
workstream. **Approved.** Implementation proceeds one workstream at a time — each fully complete,
tested, documented, and committed, with an implementation report recorded in §12, before the next
begins.
