# ADR-0012: Realistic Reasoning Timeouts (Not a Stdin Bug)

## Status
Approved

## Context
The original UAT reported this as "Claude Code CLI stdin handling hangs real executions,"
observing a `Warning: no stdin data received in 3s, proceeding without it` message on stderr
immediately followed by a 60-second failure. Investigating with the real, installed `claude` CLI
(not a mock) disproved that diagnosis:

- A short prompt (`"Say OK"`) completed in ~7s with default stdio, no issue.
- The real, full-length prompt `WorkerExecutionEngine` actually sends for an architecture-design
  task — reproduced verbatim — **hung past 65 seconds** with default stdio.
- The same prompt with `stdio: ['ignore', ...]` (stdin explicitly closed) **also** hung past 65s —
  ruling out stdin entirely as the cause.
- Given a genuinely patient wait (no artificial kill), the identical real call **completed
  successfully after 124,930ms** (~125s), exit code 0, with real, correct architecture output
  (a `// FILE: ARCHITECTURE.md` block, 27,951 bytes).

Conclusion: there was no hang and no stdin bug. `claude -p` on a real, complex, multi-paragraph
prompt legitimately takes on the order of two minutes to respond — this is real model latency,
not a process-handling defect. The actual bug was that **every timeout governing this call chain
defaulted to 60,000ms**, so genuine, in-progress work was killed roughly half way through,
every time, and misreported as a failure. The stdin warning was real but incidental — it happens
to be the only stderr content the CLI had emitted by the time the (wrong) 60s timeout fired,
which is why it looked like the cause.

A second, real, independent gap surfaced during this investigation: `WorkerExecutionRequest.
policy.maxDurationMs` was already a designed configuration field — `TaskScheduler.scheduleTask()`
already populated it from `MissionExecutionPolicy.timeoutMs` — but `WorkerExecutionEngine.
executeTask()` never read it. The intended per-mission timeout configuration path was silently
dead from `WorkerExecutionEngine` onward; every real reasoning call was stuck with
`ReasoningCoordinator`'s own internal default regardless of what a caller configured.

## Decision
- Raised the three timeout defaults that govern this call chain from `60000` to `240000` (4
  minutes — comfortable headroom above the measured ~125s real latency, without being so large
  that a genuinely broken/hung call takes unreasonably long to be detected):
  `ReasoningCoordinator.defaultPolicy.maxTimeoutMs`, `MissionExecutionOrchestrator.
  defaultPolicy.timeoutMs`, and the plugin-level `DEFAULT_EXECUTION_TIMEOUT_MS` in both
  `ClaudeCodeRuntimePlugin` and `CliRuntimePlugin` (the fallback used only when a caller invokes
  `execute()` directly, bypassing `ReasoningCoordinator`).
- Wired the dead configuration path: `WorkerExecutionEngine.executeTask()` now passes
  `request.policy?.maxDurationMs` as the real reasoning call's `timeoutMs`, so
  `MissionExecutionPolicy.timeoutMs` — already threaded this far by existing code — actually
  reaches the real CLI invocation instead of being silently discarded.
- As a genuine, separate clarity improvement (not the root-cause fix, but a real symptom worth
  removing): `defaultCliProcessSpawner` now explicitly closes stdin (`stdio: ['ignore', 'pipe',
  'pipe']`). SE-OS never pipes anything to a spawned CLI's stdin, so this has no functional
  effect on real calls, but it removes the confusing, coincidental warning from every real
  worker's terminal log — a log a user reads expecting it to reflect real problems, not noise.

### Alternatives considered
1. **Investigate and "fix" stdin handling**, per the original UAT's diagnosis. Rejected once
   direct, repeated, controlled reproduction disproved it as the actual cause — implementing a
   fix for a bug that doesn't exist would have left the real 60s-timeout problem in place.
2. **Make the timeout dynamically adaptive** (e.g., start conservative, extend based on observed
   output activity). Considered as a more sophisticated future improvement; rejected for this fix
   as unnecessary complexity — a realistic fixed default, now actually reachable via real
   configuration, directly solves the observed problem without new mechanism.
3. **Leave `WorkerExecutionRequest.policy.maxDurationMs` unused and only fix the default
   values.** Rejected: raising only the defaults would have papered over the real, separate bug
   (a designed configuration path silently doing nothing) rather than fixing it — a future
   caller wanting a shorter or longer timeout for a specific mission would still have had no way
   to actually set one.
4. **Leave the stdin warning in place since it's cosmetic, not a functional bug.** Rejected: this
   whole milestone exists because confusing, misleading signals in what a user reads (terminal
   logs, reports) erode trust even when nothing is functionally broken — this is a real, cheap
   fix that removes real, observed confusion, directly relevant to Fix #6/#7's broader UX goals.

## Consequences
- Real, complex Claude Code CLI calls are no longer killed mid-flight by an unrealistic timeout.
  Verified end-to-end through the real built TUI: a full 6-task mission against real Claude and
  Codex CLIs completed 4/6 tasks successfully with 20 real files genuinely generated and copied
  to the project directory — zero stdin/timeout-related failures. The 2 remaining failures in
  that same real run were both legitimate, different, already-tracked issues (Antigravity not
  installed; Gemini's trusted-directory gate, Fix #4's target) — not the bug this ADR closes.
- A genuinely hung or broken provider call now takes up to 4 minutes to be detected and killed
  instead of 1 — a real, deliberate tradeoff: tolerating real latency necessarily means tolerating
  a longer worst-case detection time for an actually-broken call. Acceptable given the alternative
  (killing real, successful work) is worse, and this is still a hard upper bound, not unbounded.
- `MissionExecutionPolicy.timeoutMs` is now a real, load-bearing configuration value end-to-end
  rather than dead metadata — any future caller of `executeMissionPlan()` with a custom policy
  now genuinely controls real reasoning timeout behavior.
