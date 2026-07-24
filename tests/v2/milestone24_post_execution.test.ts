import { WorkspaceScanner } from '../../src/v2/application/workspace/workspace_scanner';
import { Kernel } from '../../src/v2/kernel/kernel';
import { createFakeClaudeCodeRuntimePlugin } from './helpers/fake_claude_process';
import * as fs from 'fs';
import * as path from 'path';

describe('SE-OS v2.0 Milestone 24 — Post-Execution Experience & Workspace Explorer Suite', () => {
  const wsPath = './.se_workspaces/ws-t-104';

  beforeEach(() => {
    if (!fs.existsSync(wsPath)) {
      fs.mkdirSync(wsPath, { recursive: true });
    }
    fs.writeFileSync(path.join(wsPath, 'server.ts'), 'console.log("Server running");\nprocess.exit(0);\n', 'utf8');
    fs.writeFileSync(path.join(wsPath, 'package.json'), '{\n  "name": "sample-api"\n}\n', 'utf8');
  });

  // ─── 1. WorkspaceScanner Tree & Metrics Verification ────────────────

  it('should scan workspace directory recursively and return tree ASCII, file count, and LOC metrics', () => {
    const scanResult = WorkspaceScanner.scan(wsPath);

    expect(scanResult.fileCount).toBeGreaterThanOrEqual(2);
    expect(scanResult.totalLines).toBeGreaterThan(0);
    expect(scanResult.totalBytes).toBeGreaterThan(0);
    expect(scanResult.treeAscii).toContain('server.ts');
    expect(scanResult.files.length).toBeGreaterThanOrEqual(2);

    const serverFile = scanResult.files.find((f) => f.relativePath === 'server.ts');
    expect(serverFile).toBeDefined();
    expect(serverFile?.lines).toBe(3);
  });

  // ─── 2. REPORT.md Generation Verification ──────────────────────────

  it('should generate REPORT.md inside workspace upon project completion', async () => {
    const kernel = new Kernel();
    await kernel.boot('./non_existent_config.json');
    await kernel.getRuntimePluginSystemManager().loadAndRegisterPlugin(
      createFakeClaudeCodeRuntimePlugin({ eventStore: kernel.getEventStore() })
    );

    const orchestrator = kernel.getProjectLifecycleOrchestrator();
    const goal = 'Create a REST API for User Management';

    const result = await orchestrator.runProject(goal);

    expect(result.success).toBe(true);

    const reportPath = path.join(wsPath, 'REPORT.md');
    expect(fs.existsSync(reportPath)).toBe(true);

    const reportContent = fs.readFileSync(reportPath, 'utf8');
    expect(reportContent).toContain('# SE-OS v2.0 Execution Report');
    expect(reportContent).toContain(goal);
    expect(reportContent).toContain('**Execution Status**: `COMPLETED`');
    // Real per-task data, not a fabricated static worker roster — the actual assigned worker id
    // for at least one real executed task must appear.
    expect(reportContent).toMatch(/Worker `emp-\w+`/);
    expect(reportContent).toContain('## Verification');
    expect(reportContent).toContain('## Generated Files');

    await kernel.shutdown();
  });
});
