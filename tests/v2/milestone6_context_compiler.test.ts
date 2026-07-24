import { Kernel } from '../../src/v2/kernel/kernel';
import { ContextCompiler } from '../../src/v2/application/context-compiler/context_compiler';
import { AstSymbolAnalyzer } from '../../src/v2/application/context-compiler/ast_symbol_analyzer';
import { WorkspaceEngine } from '../../src/v2/application/workspace/workspace_engine';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';
import * as path from 'path';

describe('SE-OS v2.0 Milestone 6 — Context Compiler & Workspace Engine Suite', () => {
  const testDbPath = './se_company_m6_test.db';
  const testWorkspacesDir = './.se_workspaces_test';
  const sampleSourceFile = './sample_module.ts';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(sampleSourceFile)) fs.unlinkSync(sampleSourceFile);
    if (fs.existsSync(testWorkspacesDir)) fs.rmSync(testWorkspacesDir, { recursive: true, force: true });

    fs.writeFileSync(
      sampleSourceFile,
      `import { Config } from './config';\nexport interface User { id: string; }\nexport class AuthService {\n  login() { return true; }\n}`
    );

    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(sampleSourceFile)) fs.unlinkSync(sampleSourceFile);
    if (fs.existsSync(testWorkspacesDir)) fs.rmSync(testWorkspacesDir, { recursive: true, force: true });
  });

  it('should analyze source code and extract AST symbols correctly', () => {
    const analyzer = new AstSymbolAnalyzer();
    const content = fs.readFileSync(sampleSourceFile, 'utf8');

    const symbols = analyzer.analyzeSource(sampleSourceFile, content);

    expect(symbols.length).toBeGreaterThan(0);
    const kinds = symbols.map((s) => s.kind);
    expect(kinds).toContain('IMPORT');
    expect(kinds).toContain('INTERFACE');
    expect(kinds).toContain('CLASS');
  });

  it('should compile Context Package and enforce token budget limits', async () => {
    await kernel.boot('./non_existent_config.json');
    const compiler = kernel.getContextCompiler();

    const pkg = await compiler.compileContext('task-auth-01', sampleSourceFile, 500);

    expect(pkg.taskId).toBe('task-auth-01');
    expect(pkg.targetFile).toBe(sampleSourceFile);
    expect(pkg.relevantFiles.length).toBe(1);
    expect(pkg.relevantSymbols.length).toBeGreaterThan(0);
    expect(pkg.totalTokenSize).toBeLessThanOrEqual(500);
  });

  it('should reuse context cache and invalidate when target file changes', async () => {
    await kernel.boot('./non_existent_config.json');
    const compiler = kernel.getContextCompiler();

    const pkg1 = await compiler.compileContext('task-auth-02', sampleSourceFile);
    const pkg2 = await compiler.compileContext('task-auth-02', sampleSourceFile);

    expect(pkg1).toBe(pkg2); // Same object from cache

    // Modify file to trigger invalidation
    setTimeout(() => {
      fs.appendFileSync(sampleSourceFile, '\n// modified');
    }, 10);

    await new Promise((r) => setTimeout(r, 50));

    const pkg3 = await compiler.compileContext('task-auth-02', sampleSourceFile);
    expect(pkg3).not.toBe(pkg1);
  });

  it('should create and destroy isolated workspace directories', () => {
    const engine = new WorkspaceEngine(testWorkspacesDir);

    const ws = engine.createWorkspace('task-101');
    expect(ws.workspaceId).toContain('ws-task-101');
    expect(fs.existsSync(ws.isolatedPath)).toBe(true);

    const destroyed = engine.destroyWorkspace(ws.workspaceId);
    expect(destroyed).toBe(true);
    expect(fs.existsSync(ws.isolatedPath)).toBe(false);
  });

  it('should execute CLI context and workspace subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');
    await cli.contextCompile('task-99', sampleSourceFile);
    await cli.contextInspect('task-99', sampleSourceFile);
    await cli.workspaceCreate('task-99');
    const list = (cli as any).kernel.getWorkspaceEngine().listWorkspaces();
    const wsId = list[0].workspaceId;

    await cli.workspaceDestroy(wsId);
    await cli.shutdown();
  });
});
