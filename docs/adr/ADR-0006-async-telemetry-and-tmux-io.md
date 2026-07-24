# ADR-0006: Non-Blocking Git Branch Lookup & Tmux Control

## Status
Approved

## Context
The Milestone 28 production-readiness audit flagged two remaining synchronous OS-process calls on
paths that matter at the project's target scale (1000+ workers, continuous SSH/mobile usage,
months-long sessions):

1. `TelemetryAggregator.getSnapshot()` called `execSync('git rev-parse --abbrev-ref HEAD', ...)`
   once per **busy** worker, every time a snapshot was taken. `TuiApp` polls `getSnapshot()` on a
   500ms `setInterval` for the entire lifetime of the TUI. `execSync` blocks the entire Node.js
   thread until the child process exits — with several busy workers in different workspaces, every
   snapshot tick could stall input handling, in-flight process stdout parsing, and rendering for
   the combined duration of N sequential `git` invocations, repeating every 500ms indefinitely.
2. `TmuxIntegration` used `spawnSync` for every tmux command, including one `tmux new-window` per
   worker in `createLayout()`. At 1000 workers, `launchTmuxDashboard()` would block the entire
   process — not just the TUI, but Node's own event loop, including any other worker's real
   in-flight execution — for as long as tmux takes to sequentially create a thousand windows.

Both were left as documented `TODO(ADR-0006)` scope during the Milestone 28 audit's Step 1
(`ADR-0005`) specifically to keep that step focused on the worker/session architecture unification.

## Decision
Replace both synchronous call sites with non-blocking equivalents, without changing their public
call shape any more than necessary.

- **`GitBranchCache`** (`src/v2/infrastructure/telemetry/git_branch_cache.ts`): a small
  read-mostly cache keyed by workspace path. `getSync(workspacePath)` never blocks — it returns the
  last known branch name immediately (or `'detecting...'` before the first resolution) and, if the
  cached value is older than 4 seconds and no fetch is already in flight for that path, kicks off an
  async `execFile('git', ['rev-parse', ...])` in the background that updates the cache when it
  resolves. `TelemetryAggregator.getSnapshot()` stays fully synchronous — its only change is calling
  `this.gitBranchCache.getSync(...)` instead of the blocking free function — so none of its many
  callers (CLI, TUI, tests) needed to become async.
- **`TmuxIntegration`**: every method now uses `spawn` wrapped in a `Promise` (resolved on the
  child's `close`/`error` event) instead of `spawnSync`, and is itself `async`. `Kernel.
  launchTmuxDashboard()` and `SeOsCli.tmuxLaunch()` now `await` it. Awaiting a real async spawn
  still executes tmux commands one at a time (simplicity over the marginal throughput gain of
  parallelizing them), but yields the event loop between each one instead of freezing it — the rest
  of the process (other workers' I/O, the TUI's own render loop if it happens to be running
  alongside) keeps making progress while tmux is being driven.

### Alternatives considered
1. **Make `getSnapshot()` async and await a fresh `git` call per worker per tick.** Rejected: this
   would still serialize N real subprocess round-trips into every 500ms tick (just without
   blocking the thread while waiting), adding real per-tick latency that scales with worker count,
   and it ripples `async`/`await` through every caller of `getSnapshot()` (CLI commands, ~10 test
   files) for no benefit over a cache — a workspace's git branch does not change fast enough to
   need sub-second freshness.
2. **Poll git branches on a separate fixed-interval timer instead of a per-read staleness check.**
   Rejected as unnecessary complexity: a lazy per-read TTL check achieves the same "never worse than
   ~4s stale" bound without needing to manage a second timer's lifecycle, and it naturally avoids
   fetching branches for workspaces that are never actually read.
3. **Parallelize `TmuxIntegration.createLayout()`'s per-worker `tmux new-window` calls with
   `Promise.all`.** Considered, not applied: tmux itself serializes commands against one server
   process, so concurrent client invocations mostly queue rather than genuinely parallelize, and
   sequential-but-async already removes the actual harm (the frozen event loop). Left as a candidate
   future optimization if real 1000-worker tmux launch latency proves to matter in practice.
4. **Drop the git branch column entirely instead of fixing its cost.** Rejected: it is genuinely
   useful telemetry (which branch is this worker's workspace on), and the fix is cheap and
   self-contained — removing a real feature to avoid a solvable performance problem is not a good
   trade.

## Consequences
- The TUI's telemetry poll loop can no longer be stalled by git subprocess latency, at any worker
  count — a hard architectural guarantee (`getSync` has no code path that spawns synchronously),
  not just an improvement under today's typical worker counts.
- Git branch names displayed in telemetry can lag reality by up to ~4 seconds after a workspace's
  branch actually changes. Acceptable: this field is informational display, not used by any
  correctness-critical logic.
- `TmuxIntegration`'s public API is now `async` throughout; the two production call sites
  (`Kernel.launchTmuxDashboard()`, `SeOsCli.tmuxLaunch()`) and the one test that exercises a real
  tmux binary were updated to `await` it. This is a breaking signature change, accepted per the
  standing instruction to migrate rather than wrap.
- `GitBranchCache` is per-`TelemetryAggregator`-instance (constructed once in `kernel.ts`, not
  re-created per snapshot), so its cache persists for the life of the kernel and does not leak
  across kernel instances in tests (`Kernel` boot creates a new `TelemetryAggregator` — and
  therefore a new cache — each time).
