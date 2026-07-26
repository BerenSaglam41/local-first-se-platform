import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BuildCheckStep } from '../../../src/v2/application/verification/steps/build_check_step';
import { TestCheckStep } from '../../../src/v2/application/verification/steps/test_check_step';
import { LintCheckStep } from '../../../src/v2/application/verification/steps/lint_check_step';
import { TypeCheckStep } from '../../../src/v2/application/verification/steps/type_check_step';
import { VerificationPipeline } from '../../../src/v2/application/verification/verification_pipeline';
import { Kernel } from '../../../src/v2/kernel/kernel';
import {
  createFakeClaudeSpawner,
  createAvailableDetector,
  createUnavailableDetector,
  createFakeClaudeCodeRuntimePlugin,
} from '../helpers/fake_claude_process';

function makeTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'se-os-verify-test-'));
}

describe('SE-OS v2.0 M29.1 Fix #1 — Honest verification steps (no fabricated pass/fail)', () => {
  let workspace: string;

  afterEach(() => {
    if (workspace && fs.existsSync(workspace)) {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  // ─── Build / Test / Lint steps: honest skip when unrunnable ───────────

  it('BuildCheckStep should report skipped (not a fabricated pass) when no package.json exists', async () => {
    workspace = makeTempWorkspace();
    const step = new BuildCheckStep();
    const result = await step.execute({ taskId: 't1', workspacePath: workspace });
    expect(result.skipped).toBe(true);
    expect(result.message).toContain('no package.json found');
  });

  it('TestCheckStep should report skipped when no test script is defined', async () => {
    workspace = makeTempWorkspace();
    fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ name: 'x', scripts: {} }), 'utf8');
    const step = new TestCheckStep();
    const result = await step.execute({ taskId: 't1', workspacePath: workspace });
    expect(result.skipped).toBe(true);
    expect(result.message).toContain('no "test" script');
  });

  it('LintCheckStep should report skipped when dependencies are not installed', async () => {
    workspace = makeTempWorkspace();
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { lint: 'eslint .' } }),
      'utf8'
    );
    const step = new LintCheckStep();
    const result = await step.execute({ taskId: 't1', workspacePath: workspace });
    expect(result.skipped).toBe(true);
    expect(result.message).toContain('node_modules missing');
  });

  // ─── Build / Test steps: really execute real commands when runnable ───

  it('BuildCheckStep should really run npm run build and report a genuine pass', async () => {
    workspace = makeTempWorkspace();
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { build: 'node -e "process.exit(0)"' } }),
      'utf8'
    );
    fs.mkdirSync(path.join(workspace, 'node_modules'));
    const step = new BuildCheckStep();
    const result = await step.execute({ taskId: 't1', workspacePath: workspace }, { timeoutMs: 5000 });
    expect(result.skipped).toBeFalsy();
    expect(result.passed).toBe(true);
    expect(result.message).toContain('really passed');
  });

  it('BuildCheckStep should really run npm run build and report a genuine failure with real error output', async () => {
    workspace = makeTempWorkspace();
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { build: 'node -e "console.error(\'real build error\'); process.exit(1)"' } }),
      'utf8'
    );
    fs.mkdirSync(path.join(workspace, 'node_modules'));
    const step = new BuildCheckStep();
    const result = await step.execute({ taskId: 't1', workspacePath: workspace }, { timeoutMs: 5000 });
    expect(result.skipped).toBeFalsy();
    expect(result.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('real build error');
  });

  // ─── TypeCheckStep: real syntax diagnostics ────────────────────────────

  it('TypeCheckStep should report skipped when no .ts files exist', async () => {
    workspace = makeTempWorkspace();
    fs.writeFileSync(path.join(workspace, 'README.md'), '# hi', 'utf8');
    const step = new TypeCheckStep();
    const result = await step.execute({ taskId: 't1', workspacePath: workspace });
    expect(result.skipped).toBe(true);
  });

  it('TypeCheckStep should bound its scan cost instead of walking an unbounded directory tree', async () => {
    // Regression test: a real, self-inflicted perf bug found via a flaky full-suite run —
    // scanning a large shared directory (thousands of accumulated files across the whole test
    // suite) took long enough under load to intermittently blow past Jest's default per-test
    // timeout. Proves the scan stops at a bounded number of files instead of enumerating
    // everything under a much larger tree.
    workspace = makeTempWorkspace();
    for (let i = 0; i < 500; i++) {
      const dir = path.join(workspace, `d${i}`);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'f.ts'), 'export const x = 1;\n', 'utf8');
    }
    const step = new TypeCheckStep();
    const start = Date.now();
    const result = await step.execute({ taskId: 't1', workspacePath: workspace });
    const elapsedMs = Date.now() - start;

    expect(result.skipped).toBeFalsy();
    expect(elapsedMs).toBeLessThan(4000); // generous — should really take well under 1s
  }, 10000);

  it('TypeCheckStep should really catch a genuine syntax error in generated TypeScript', async () => {
    workspace = makeTempWorkspace();
    fs.writeFileSync(path.join(workspace, 'broken.ts'), 'export function broken( {\n  return 1\n', 'utf8');
    const step = new TypeCheckStep();
    const result = await step.execute({ taskId: 't1', workspacePath: workspace });
    expect(result.skipped).toBeFalsy();
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('TypeCheckStep should really pass valid TypeScript with no fabrication', async () => {
    workspace = makeTempWorkspace();
    fs.writeFileSync(path.join(workspace, 'valid.ts'), 'export function ok(): number {\n  return 1;\n}\n', 'utf8');
    const step = new TypeCheckStep();
    const result = await step.execute({ taskId: 't1', workspacePath: workspace });
    expect(result.skipped).toBeFalsy();
    expect(result.passed).toBe(true);
  });

  // ─── VerificationPipeline: skipped steps never inflate or deflate the score dishonestly ───

  it('should score 100 from an all-skipped pipeline instead of dividing by zero or fabricating a partial number', async () => {
    workspace = makeTempWorkspace(); // no package.json, no .ts files — every non-mandatory step skips
    const pipeline = new VerificationPipeline();
    const result = await pipeline.verify({ taskId: 't1', workspacePath: workspace, artifacts: [{ path: 'x' }] });
    expect(result.qualityScore).toBe(100);
    expect(result.stepResults.some((s) => s.skipped)).toBe(true);
  });

  it('should reflect a real failing build in the overall verification result, not a fabricated pass', async () => {
    workspace = makeTempWorkspace();
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { build: 'node -e "process.exit(1)"' } }),
      'utf8'
    );
    fs.mkdirSync(path.join(workspace, 'node_modules'));
    const pipeline = new VerificationPipeline();
    const result = await pipeline.verify(
      { taskId: 't1', workspacePath: workspace, artifacts: [{ path: 'x' }] },
      { timeoutMs: 5000 }
    );
    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');
  });
});

describe('SE-OS v2.0 M29.1 Fix #1 — Honest ProjectLifecycleOrchestrator REPORT.md', () => {
  const testDbPath = './se_company_m29_1_fix1_test.db';
  let kernel: Kernel;
  let targetPath: string;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    kernel = new Kernel();
    targetPath = fs.mkdtempSync(path.join(os.tmpdir(), 'se-os-report-test-'));
  });

  afterEach(async () => {
    if (kernel.isReady()) await kernel.shutdown();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { recursive: true, force: true });
  });

  it('should never claim COMPLETED or a passing score when the real provider CLI is unavailable', async () => {
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      createFakeClaudeCodeRuntimePlugin({ eventStore: kernel.getEventStore(), available: false })
    );

    const orchestrator = kernel.getProjectLifecycleOrchestrator();
    const result = await orchestrator.runProject('Create REST API', { absolutePath: targetPath });

    expect(result.success).toBe(false);

    const reportPath = path.join(targetPath, 'REPORT.md');
    expect(fs.existsSync(reportPath)).toBe(true); // honest failure report still written

    const report = fs.readFileSync(reportPath, 'utf8');
    expect(report).not.toContain('`COMPLETED`');
    expect(report).not.toContain('100 / 100 [PASSED]');
    expect(report).not.toContain('Unit Tests: PASSED (6 / 6 passed)');
  });

  it('should list only really-generated files, never a hardcoded scaffold that was never written', async () => {
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      createFakeClaudeCodeRuntimePlugin({ eventStore: kernel.getEventStore() })
    );

    const orchestrator = kernel.getProjectLifecycleOrchestrator();
    const result = await orchestrator.runProject('Create REST API', { absolutePath: targetPath });

    expect(result.success).toBe(true);

    const report = fs.readFileSync(path.join(targetPath, 'REPORT.md'), 'utf8');
    // The old hardcoded fake report always listed these exact files, none of which any real
    // task in this test ever produces.
    expect(report).not.toContain('src/controllers/user.controller.ts');
    expect(report).not.toContain('src/middleware/auth.middleware.ts');
    expect(report).not.toContain('tests/user_api.test.ts');

    // Every file the report claims was generated must really exist on disk.
    const generatedSection = report.split('## Generated Files')[1] || '';
    const listedFiles = Array.from(generatedSection.matchAll(/`([^`]+)`/g)).map((m) => m[1]);
    expect(listedFiles.length).toBeGreaterThan(0);
    for (const relativeFile of listedFiles) {
      expect(fs.existsSync(path.join(targetPath, relativeFile))).toBe(true);
    }
  });
});
