import { PhysicalDiskVerifier } from '../../src/v2/application/verification/physical_disk_verifier';
import { Kernel } from '../../src/v2/kernel/kernel';
import { registerDefaultProviders } from '../../src/v2/application/providers/default_provider_bootstrap';
import { createFakeClaudeCodeRuntimePlugin, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';
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

  // ─── 1. Real ProviderRegistry & per-worker assignment ─────────────────

  it('should list all real registered AI providers and per-worker provider assignments', async () => {
    const kernel = new Kernel();
    await kernel.boot('./non_existent_config.json');
    await registerDefaultProviders(kernel, createSafeTestProviderOverrides());

    const providers = kernel.getProviderRegistry().listProviders();
    expect(providers.length).toBeGreaterThanOrEqual(4);
    expect(providers.some((p) => p.id === 'plugin-claude-code')).toBe(true);
    expect(providers.some((p) => p.id === 'plugin-codex-cli')).toBe(true);
    expect(providers.some((p) => p.id === 'plugin-gemini-cli')).toBe(true);
    expect(providers.some((p) => p.id === 'plugin-antigravity')).toBe(true);

    const claude = providers.find((p) => p.id === 'plugin-claude-code');
    expect(claude?.installed).toBe(true);

    const workerStore = kernel.getWorkerStore();
    expect(workerStore.get('emp-alice')?.assignedProviderId).toBe('plugin-claude-code');
    expect(workerStore.get('emp-bob')?.assignedProviderId).toBe('plugin-codex-cli');
    expect(workerStore.get('emp-charlie')?.assignedProviderId).toBe('plugin-gemini-cli');

    await kernel.shutdown();
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
      createFakeClaudeCodeRuntimePlugin({ eventStore: kernel.getEventStore() })
    );

    const orchestrator = kernel.getProjectLifecycleOrchestrator();
    const result = await orchestrator.runProject('Create REST API', { absolutePath: targetPath });

    expect(result.success).toBe(true);
    expect(fs.existsSync(targetPath)).toBe(true);
    // Real file actually produced from the fake spawner's `// FILE: index.ts` content, copied
    // from the task's isolated workspace into the real project directory — not a hardcoded stub.
    expect(fs.existsSync(path.join(targetPath, 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(targetPath, 'REPORT.md'))).toBe(true);

    const reportContent = fs.readFileSync(path.join(targetPath, 'REPORT.md'), 'utf8');
    expect(reportContent).toContain('# SE-OS v2.0 Execution Report');
    expect(reportContent).toContain('Create REST API');

    await kernel.shutdown();
  });
});
