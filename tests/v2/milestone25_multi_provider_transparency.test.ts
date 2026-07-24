import { ProviderManager } from '../../src/v2/application/providers/provider_manager';
import { PhysicalDiskVerifier } from '../../src/v2/application/verification/physical_disk_verifier';
import { Kernel } from '../../src/v2/kernel/kernel';
import { ClaudeCodeRuntimePlugin } from '../../src/v2/application/plugins/claude/claude_code_runtime_plugin';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SE-OS v2.0 Milestone 25 — Multi-Provider AI Team & Workspace Transparency Suite', () => {
  const targetPath = path.join(os.homedir(), 'Desktop', 'test-transparency-api');

  afterEach(() => {
    try {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
    } catch (e) {}
  });

  // ─── 1. ProviderManager Verification ─────────────────────────────────

  it('should list all installed AI providers and worker role provider assignments', () => {
    const pm = new ProviderManager();
    const providers = pm.getProviders();

    expect(providers.length).toBeGreaterThanOrEqual(6);
    expect(providers.some((p) => p.name === 'Claude Code CLI')).toBe(true);
    expect(providers.some((p) => p.name === 'Codex CLI')).toBe(true);
    expect(providers.some((p) => p.name === 'Gemini CLI')).toBe(true);
    expect(providers.some((p) => p.name === 'Antigravity AI Engine')).toBe(true);

    const assignments = pm.getAssignments();
    expect(assignments.some((a) => a.workerName === 'Alice' && a.assignedProviderId === 'claude-code-cli')).toBe(true);
    expect(assignments.some((a) => a.workerName === 'Bob' && a.assignedProviderId === 'codex-cli')).toBe(true);
    expect(assignments.some((a) => a.workerName === 'Charlie' && a.assignedProviderId === 'gemini-cli')).toBe(true);
  });

  // ─── 2. PhysicalDiskVerifier Verification ──────────────────────────────

  it('should physically verify folder, files, package.json, build, and test status on disk', () => {
    fs.mkdirSync(targetPath, { recursive: true });
    fs.writeFileSync(path.join(targetPath, 'package.json'), '{"name":"test-api"}', 'utf8');
    fs.writeFileSync(path.join(targetPath, 'server.ts'), 'console.log("ready");', 'utf8');

    const result = PhysicalDiskVerifier.verify(targetPath);

    expect(result.allPassed).toBe(true);
    expect(result.checks.some((c) => c.checkName === 'FolderExistenceCheck' && c.passed)).toBe(true);
    expect(result.checks.some((c) => c.checkName === 'PackageJsonCheck' && c.passed)).toBe(true);
    expect(result.checks.some((c) => c.checkName === 'WorkspaceAccessCheck' && c.passed)).toBe(true);
  });

  // ─── 3. End-to-End Absolute Path Workspace Generation ─────────────────

  it('should generate physical files and REPORT.md in user-selected absolute path without silent hidden folders', async () => {
    const kernel = new Kernel();
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      new ClaudeCodeRuntimePlugin(kernel.getEventStore())
    );

    const orchestrator = kernel.getProjectLifecycleOrchestrator();
    const result = await orchestrator.runProject('Create REST API', { absolutePath: targetPath });

    expect(result.success).toBe(true);
    expect(fs.existsSync(targetPath)).toBe(true);
    expect(fs.existsSync(path.join(targetPath, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetPath, 'REPORT.md'))).toBe(true);

    const reportContent = fs.readFileSync(path.join(targetPath, 'REPORT.md'), 'utf8');
    expect(reportContent).toContain('# SE-OS v2.0 Execution Report');
    expect(reportContent).toContain('Create REST API');

    await kernel.shutdown();
  });
});
