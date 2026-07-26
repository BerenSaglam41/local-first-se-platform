# ADR-0011: Real Effect for the Runtime Selection Screen

## Status
Approved

## Context
While discussing a future feature idea (per-worker provider login/accounts) with the user, a
direct question — "does the system currently route everything through one selected provider?" —
led to inspecting the TUI's startup "Select Active Runtime Provider" screen. It turned out to be
almost entirely decorative: selecting a provider there called
`TelemetryAggregator.setActiveRuntimeProvider(providerId)`, which only sets a display field (used
to render `[Active: YES/NO]` next to each provider and a `Runtime: X` label on the dashboard). It
had **no effect on real task routing whatsoever** — a user picking "Mock" on this screen, expecting
that to mean something, would still see every worker execute against whatever their real per-role
assignment already was.

This is exactly the class of dishonest-UI problem this whole milestone exists to fix: a control
that implies it does something, but doesn't.

## Decision
Give the screen genuine effect without breaking the per-worker-ownership architecture ADR-0005
already established (workers must never share a single global runtime):

- `WorkerAwareRuntimeSelectionStrategy.defaultPluginId` — previously a constructor-only value,
  fixed for the process's lifetime — gained `setDefaultPluginId()`/`getDefaultPluginId()`. This
  field was already real: it's the fallback `selectPlugin()` uses for any reasoning request whose
  worker has no explicit `assignedProviderId` of its own (concretely: `AutonomousPlanner`'s
  planning-level reasoning, which runs under the virtual `'emp-planner'` id, not a real registered
  worker). It was simply never exposed as mutable.
- `Kernel.setDefaultRuntimeProvider(providerId)` is the one real entry point: it updates both the
  selection strategy's real default (actual routing) and the telemetry aggregator's display field
  (what the UI shows), in one call — a single source of truth for "what does selecting a provider
  on this screen mean," rather than two independent, driftable state updates.
- The TUI's `RuntimeSelector` `onSelectRuntime` handler now calls `kernel.setDefaultRuntimeProvider()`
  instead of only updating telemetry.
- Deliberately, **no real worker's own per-role assignment is touched**. Alice, Bob, Charlie,
  Diana, and Eve keep using their own real assigned providers regardless of what's selected on
  this screen — changing that would contradict ADR-0005's explicit "workers should never share a
  global runtime" decision. What the screen now genuinely controls is the fallback for callers
  with no assignment of their own: today, specifically, planning-level reasoning.

### Alternatives considered
1. **Make the screen override every worker's assignment to the selected provider.** Rejected
   outright: this is precisely the shared-global-runtime architecture ADR-0005 replaced with
   per-worker ownership, for good reason (see that ADR's context). Reintroducing it here to make
   one screen "feel" more powerful would be a real regression.
2. **Remove the screen entirely, since real per-worker routing already exists and doesn't need a
   global selection step.** Considered, and a reasonable simplification candidate for Fix #6's
   broader TUI UX pass — but the screen does have one genuine, real use once wired up (choosing
   the planning-level fallback), so removing it outright was left to the broader UX review rather
   than decided unilaterally here.
3. **Leave it decorative and just document the limitation.** Rejected: matching the pattern of
   every other fix in this milestone, a control that visibly claims to do something and doesn't is
   exactly the dishonesty this milestone exists to eliminate, and a real, correct fix was available
   at low cost.

## Consequences
- Selecting a provider on the Runtime Selection screen now has one real, verifiable, honest
  effect: it changes what unassigned/virtual reasoning callers use.
- Verified two ways: unit tests
  (`tests/v2/reliability/runtime_selection_real_effect.test.ts`) proving the routing genuinely
  changes for an unassigned worker id while a real worker's own assignment stays untouched; and a
  live real-TUI run — selecting "Mock" and starting a project with a deliberately low-confidence
  goal (so the planner's real AI-fallback path actually triggers) showed the real, fresh terminal
  log entry `Mock Reference Runtime Plugin <- "Project ..."` for the planning call, while Alice's
  own task execution in the same run still correctly used her real assigned Claude plugin.
- A secondary, real finding surfaced while verifying this: for common, high-confidence goals
  (e.g. "Create a REST API"), `AutonomousPlanner` never invokes AI reasoning at all — pure
  rule-based decomposition handles it (by design, per `DEFAULT_PLANNING_CONFIG.aiConfidenceThreshold`).
  This means the Runtime Selection screen's real effect, while genuine, is only observable for
  goals the planner's rule-based analysis finds ambiguous enough to need AI help. This is expected
  and correct, not a new gap — just worth documenting so it isn't mistaken for the fix not working.
