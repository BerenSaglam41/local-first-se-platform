# ADR-0009: Honest Execution Reporting (No Fabricated Success)

## Status
Approved

## Context
A real user-acceptance test (M29.1, driving the actual built TUI through a real terminal session
— not code inspection, not mocks) found that `REPORT.md`, the final artifact a real user reads to
know whether their project actually worked, unconditionally claimed success regardless of reality.
Concretely, in one real run: the real `claude` CLI hung on stdin and failed twice (exit 1); the
real `gemini` CLI failed on a trusted-directory check (exit 55); yet `REPORT.md` reported
`Execution Status: COMPLETED`, `Quality Score: 100/100 [PASSED]`, `Unit Tests: PASSED (6/6)`, and
listed generated files (`user.controller.ts`, `auth.middleware.ts`, `user_api.test.ts`) that were
never written. The actual on-disk output was a 2-line stub (`console.log("Server online")`).

Tracing the root cause surfaced fabrication at **three separate layers**, not one:

1. **`ProjectLifecycleOrchestrator.runProject()`** unconditionally wrote a hardcoded block of
   fake files (`src/server.ts`, `package.json`, `README.md`) and a hardcoded `REPORT.md` template
   with static claims, completely disconnected from `result.reports` — the real, already-available
   per-task execution data. It also only ran on `result.success === true`, so a failed project got
   no report at all.
2. **Four of `VerificationPipeline`'s six built-in steps were pure stubs**
   (`BuildCheckStep`, `TypeCheckStep`, `TestCheckStep`, `LintCheckStep`) — each unconditionally
   returned `passed: true` without executing anything. Only `WorkspaceCheckStep` and
   `ArtifactCheckStep` ever did real work.
3. **`ReasoningCoordinator.requestReasoning()`** unconditionally returned `{ success: true,
   response }` regardless of whether the underlying provider execution actually succeeded — even
   though it correctly computed `execRes.success` two lines earlier for the worker's own
   bookkeeping. This silently converted a genuine provider failure into a "successful" reasoning
   result for every caller up the stack, which is how a task whose AI provider was entirely
   unavailable still ended up marked `COMPLETED`.

## Decision
Fix all three layers so success can only ever be reported when it's real, with no new AI
capability added — this is entirely about correctly using and propagating data that already
existed.

- **`ReasoningCoordinator.requestReasoning()`** now returns `{ success: execRes.success, ... }`,
  matching the value already used correctly for `worker.completeExecution()`. A provider failure
  now genuinely propagates as a genuine task failure all the way up.
- **The four fake verification steps now really run**, using a shared `npm_script_runner.ts`
  helper: `BuildCheckStep`/`TestCheckStep`/`LintCheckStep` really execute `npm run
  build`/`test`/`lint` when a `package.json` with that script and installed `node_modules` exist,
  and honestly report `skipped` (a new `VerificationStepResult.skipped` field — never a fabricated
  pass) when they don't, with the real reason stated. `TypeCheckStep` runs a real single-file
  syntax check via SE-OS's own bundled `typescript` compiler API against every generated `.ts`
  file (works with zero installed dependencies — a freshly-generated project rarely has its own —
  and is honestly labeled as syntax-only, never claiming cross-file type resolution it didn't do).
  `VerificationPipeline`'s quality score now excludes skipped steps from the denominator entirely
  (neutral — neither inflates nor penalizes) instead of treating every step as a guaranteed pass.
- **`ProjectLifecycleOrchestrator.runProject()`/`continueProject()`** now always materialize real
  output, success or failure: every task's real `CREATED_FILE`/`MODIFIED_FILE` artifacts are
  copied from that task's real isolated workspace (re-rooted via a new `ExecutionReport.
  workspacePath` field, populated by `WorkerExecutionEngine`) into the user's chosen project
  directory, and `REPORT.md` is generated entirely from real data: real execution status, real
  per-task outcomes and summaries, real aggregated verification results per step category, and a
  de-duplicated real list of files that actually exist on disk. Nothing in the new report is a
  static string.
- `MissionExecutionOrchestrator` was also fixed to pass the task's real `workspacePath` to
  `VerificationPipeline.verify()` — it previously used the path of an arbitrary artifact
  (`artifacts.find(a => a.path)?.path`, a *file*, not the workspace root) as a workaround for not
  having the real workspace path available, which this ADR's new field makes unnecessary.

### Alternatives considered
1. **Only fix `REPORT.md`'s template, leave the fake verification steps and the
   `ReasoningCoordinator` success-propagation bug alone.** Rejected: a prettier report built from
   `VerificationPipeline`'s output would still be fabricating, just one layer removed — the
   underlying data feeding it was fake. Fixing only the visible symptom while leaving two real
   fabrication bugs in the pipeline that produces its data would not satisfy "never fabricate."
2. **Have the fake verification steps report a hardcoded `FAILED` instead of a hardcoded `PASSED`
   when they can't really check something.** Rejected: equally dishonest in the other direction —
   a task with no test suite defined isn't a *failing* task, it's one where that check doesn't
   apply. The correct honest state is `skipped`, which is why that field was added rather than
   reusing the boolean `passed`.
3. **Auto-install dependencies (`npm install`) in a generated workspace so Build/Test/Lint checks
   could always run for real.** Rejected as scope creep: this is new capability (network access,
   arbitrary install time, security surface of running an AI-generated project's own install
   scripts), not a fabrication fix, and explicitly out of scope per the M29.1 rules ("do not add
   new AI capabilities or unrelated features").
4. **Full project-aware `tsc --noEmit` for TypeCheckStep always, accepting it will fail/skip on
   any workspace without installed dependencies.** Considered; kept as a real path when a
   workspace *does* have `node_modules`/`tsconfig.json`, but a dependency-free single-file syntax
   check via the bundled compiler is real, honest, meaningful, and available in the overwhelmingly
   common case (a freshly-generated project with nothing installed yet) instead of skipping
   entirely.

## Consequences
- `REPORT.md` can now legitimately say `FAILED` — and does, when that's what actually happened.
  This is by design: the milestone this ADR belongs to exists specifically to make failure honest
  and visible rather than papered over.
- Several existing integration tests asserted the *old fabricated* behavior (e.g. a mixed-provider
  mission always reporting `COMPLETED`) — these were rewritten to assert the honest outcome
  instead of the old assumption, per standing project convention (tests validate the real
  architecture, not preserved fake expectations).
- A freshly-generated project's `REPORT.md` will usually show most Build/Test/Lint checks as
  `skipped` rather than `passed`, because most generated projects have no installed dependencies
  yet. This is correct and intentional, not a regression — it replaces a lie with an honest gap.
- `ExecutionReport` and `VerificationStepResult` both gained one small, additive, non-breaking
  field (`workspacePath`, `skipped`) to support this — no existing consumer of either interface
  needed to change.
