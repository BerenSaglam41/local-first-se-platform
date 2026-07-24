import * as fs from 'fs';
import * as path from 'path';
import { DiContainer } from './infrastructure/di/di_container';
import { ConfigLoader } from './infrastructure/config/config_loader';
import { JsonLogger } from './infrastructure/logging/json_logger';
import { SqliteDb } from './infrastructure/storage/sqlite_db';
import { SqliteRepository } from './infrastructure/storage/sqlite_repository';
import { IConfig } from './core/domain/interfaces/iconfig';
import { ILogger } from './core/domain/interfaces/ilogger';
import { IStorage } from './core/domain/interfaces/istorage';
import { randomUUID } from 'crypto';
import { EngineeringTask } from './core/domain/models/execution';
import { GitManager } from './core/application/services/git_manager';
import { IDashboard } from './core/domain/interfaces/idashboard';
import { TmuxDashboard } from './infrastructure/logging/tmux_dashboard';
import { IWorkspaceManager } from './core/domain/interfaces/iworkspace_manager';
import { WorkspaceManager } from './infrastructure/workspace/workspace_manager';

// Milestone 2 Interfaces & Implementations
import { ICache } from './core/domain/interfaces/icache';
import { IVirtualFileSystem } from './core/domain/interfaces/ivfs';
import { ICodeSliceEngine } from './core/domain/interfaces/icode_slice_engine';
import { IASTParser } from './core/domain/interfaces/iast_parser';
import { IDependencyResolver } from './core/domain/interfaces/idependency_resolver';
import { IContextBuilder } from './core/domain/interfaces/icontext_builder';

import { InMemoryCache } from './infrastructure/cache/in_memory_cache';
import { VirtualFileSystem } from './infrastructure/vfs/vfs';
import { CodeSliceEngine } from './infrastructure/parser/code_slice_engine';
import { TypeScriptASTParser } from './infrastructure/parser/ts_ast_parser';
import { DependencyResolver } from './infrastructure/parser/dependency_resolver';
import { ContextBuilder } from './infrastructure/parser/context_builder';

import { IProcessRuntime } from './core/domain/interfaces/iprocess_runtime';
import { ProcessRuntime } from './infrastructure/runtime/process_runtime';

// Milestone 3 Provider Abstractions & Implementations
import { IProvider } from './core/domain/interfaces/iprovider';
import { MockProvider } from './infrastructure/runtime/mock_provider';
import { ClaudeProvider } from './infrastructure/runtime/claude_provider';

// Application Services
import { TaskExecutionService } from './core/application/services/task_execution_service';

async function bootstrap() {
  const container = new DiContainer();

  // 1. Initialize Configuration
  const configLoader = new ConfigLoader();
  container.register<IConfig>('Config', configLoader);

  // 2. Initialize Logger
  const logger = new JsonLogger(configLoader);
  container.register<ILogger>('Logger', logger);

  const traceId = randomUUID();
  logger.info('Starting Local-First AI SE Platform...', { traceId });

  // 3. Initialize SQLite DB Wrapper
  const sqliteDb = new SqliteDb(configLoader, logger);
  container.register('SqliteDb', sqliteDb);

  // 4. Initialize Repository and Run Migrations
  const repository = new SqliteRepository(sqliteDb);
  container.register<IStorage>('Storage', repository);

  try {
    await repository.initialize();
    logger.info('Database initialized and migrations executed successfully', { traceId });
  } catch (error) {
    logger.error('Failed to initialize database', error, { traceId });
    process.exit(1);
  }

  // 4b. Initialize VFS & AST Context Optimization Modules
  const cache = new InMemoryCache();
  container.register<ICache>('Cache', cache);

  const vfs = new VirtualFileSystem(cache);
  container.register<IVirtualFileSystem>('Vfs', vfs);

  const sliceEngine = new CodeSliceEngine();
  container.register<ICodeSliceEngine>('SliceEngine', sliceEngine);

  const astParser = new TypeScriptASTParser(sliceEngine);
  container.register<IASTParser>('ASTParser', astParser);

  const dependencyResolver = new DependencyResolver();
  container.register<IDependencyResolver>('DependencyResolver', dependencyResolver);

  const contextBuilder = new ContextBuilder(vfs, astParser, dependencyResolver, cache);
  container.register<IContextBuilder>('ContextBuilder', contextBuilder);

  // 4c. Initialize Process Runtime Kernel
  const processRuntime = new ProcessRuntime();
  container.register<IProcessRuntime>('ProcessRuntime', processRuntime);

  // 4d. Initialize Provider based on configuration
  const providerType = configLoader.get().providerType;
  let provider: IProvider;
  if (providerType === 'claude') {
    provider = new ClaudeProvider(processRuntime, configLoader.get().claudeExecutable);
  } else {
    provider = new MockProvider(processRuntime);
  }
  container.register<IProvider>('Provider', provider);

  // 4e. Initialize Application Services
  const taskExecutionService = new TaskExecutionService(contextBuilder, provider, configLoader, processRuntime);
  container.register<TaskExecutionService>('TaskExecutionService', taskExecutionService);

  // 5. Health Check
  const healthCheck = async () => {
    try {
      const db = await sqliteDb.getDb();
      await db.get('SELECT 1');
      return { status: 'healthy', db: 'connected' };
    } catch (err) {
      return { status: 'unhealthy', db: 'disconnected', error: err };
    }
  };

  const health = await healthCheck();
  logger.info('System Health Check:', { ...health, traceId });

  // 6. Graceful Shutdown Handlers
  const gracefulShutdown = async (signal: string) => {
    logger.warn(`Received ${signal}. Starting graceful shutdown...`, { traceId });
    try {
      await repository.close();
      logger.info('Database connections closed cleanly. Shutdown complete.', { traceId });
      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', err, { traceId });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  logger.info('SE-OS Kernel is online and ready.', { traceId });

  return { container, traceId };
}

function scanWorkspaceFiles(dir: string): string[] {
  const results: string[] = [];
  const ignoredDirs = [
    'node_modules',
    'dist',
    'target',
    'build',
    '.venv',
    'venv',
    '__pycache__',
    '.git',
    'coverage',
    'logs',
    'brain',
    '.gradle',
    '.idea',
    '.vscode',
  ];
  const allowedExts = [
    '.ts', '.tsx', '.js', '.jsx', '.json',
    '.py', '.rs', '.go', '.java',
    '.toml', '.xml', '.gradle', '.properties',
    '.yaml', '.yml', '.md',
  ];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.includes(entry.name)) {
          continue;
        }
        results.push(...scanWorkspaceFiles(fullPath));
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.db') || entry.name.endsWith('.log') || entry.name.endsWith('.jsonl')) {
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (allowedExts.includes(ext) || entry.name === 'Dockerfile' || entry.name === 'Makefile') {
          results.push(fullPath);
        }
      }
    }
  } catch (e) {
    // Ignore unreadable dirs
  }
  return results;
}

// Run CLI / bootstrap if script is executed directly
if (require.main === module) {
  let taskPrompt = '';
  let targetWorkspace = process.cwd();

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'run') continue;
    if (arg === '--workspace' && args[i + 1]) {
      targetWorkspace = path.resolve(args[i + 1]);
      i++;
    } else if (arg === '--task' && args[i + 1]) {
      taskPrompt = args[i + 1];
      i++;
    } else if (!taskPrompt && !arg.startsWith('--')) {
      taskPrompt = args.slice(i).join(' ').trim();
      break;
    }
  }

  if (!taskPrompt) {
    console.log(`
====================================================
Local-First AI Software Engineering Platform (SE-OS)
====================================================

Usage:
  se-os run --workspace <path> --task "<task_description>"
  npm start -- "<task_description>"

Examples:
  npm start -- "Refactor the authentication module"
  npm start -- --workspace . --task "Implement a calculator class"
`);
    process.exit(0);
  }

  (async () => {
    const workspaceManager = new WorkspaceManager();
    let wsMeta;
    try {
      wsMeta = await workspaceManager.resolveWorkspace(targetWorkspace);
    } catch (err: any) {
      console.error(`❌ Workspace Error: ${err.message}`);
      process.exit(1);
    }

    const rootDir = wsMeta.rootPath;
    const dashboard = new TmuxDashboard(rootDir);
    await dashboard.initialize('se-os');

    const mainLog = (msg: string) => {
      console.log(msg);
      dashboard.writeMain(msg);
    };

    mainLog('----------------------------------------');
    mainLog(`Task received: "${taskPrompt}"`);
    mainLog(`Workspace Name: ${wsMeta.name}`);
    mainLog(`Project Type:   ${wsMeta.projectType}`);
    mainLog(`Project Root:   ${wsMeta.rootPath}`);
    if (wsMeta.buildCommand) mainLog(`Build Command:  ${wsMeta.buildCommand}`);
    if (wsMeta.testCommand)  mainLog(`Test Command:   ${wsMeta.testCommand}`);
    mainLog('Executing task through SE-OS pipeline...');
    mainLog('----------------------------------------');

    dashboard.writeKnowledge(`\n====================================================`);
    dashboard.writeKnowledge(` Workspace:      ${wsMeta.name}`);
    dashboard.writeKnowledge(` Project Type:   ${wsMeta.projectType}`);
    dashboard.writeKnowledge(` Project Root:   ${wsMeta.rootPath}`);
    dashboard.writeKnowledge(` Detected Commands:`);
    dashboard.writeKnowledge(`   Build: ${wsMeta.buildCommand || 'none'}`);
    dashboard.writeKnowledge(`   Test:  ${wsMeta.testCommand || 'none'}`);
    dashboard.writeKnowledge(`====================================================\n`);

    const scanStartTime = Date.now();
    mainLog('\n▶ Workspace Scan');
    dashboard.writeKnowledge(`[INFO] Starting Workspace Scan in directory: ${rootDir}`);
    const workspaceFiles = scanWorkspaceFiles(rootDir);

    // Extract target files mentioned in task prompt (e.g. src/calculator.ts)
    const fileMatches = taskPrompt.match(/([a-zA-Z0-9_\-\.\/]+\.(?:ts|js|tsx|jsx|py|rs|go|java))/g);
    if (fileMatches) {
      for (const fm of fileMatches) {
        const fullFm = path.isAbsolute(fm) ? fm : path.join(rootDir, fm);
        if (!workspaceFiles.includes(fullFm)) {
          workspaceFiles.push(fullFm);
        }
      }
    }

    const preferredEntry = workspaceFiles.find(f => f.endsWith('src/main.ts') || f.endsWith('src/index.ts') || f.endsWith('main.py') || f.endsWith('main.rs') || f.endsWith('main.go')) || workspaceFiles.find(f => fs.existsSync(f) && fs.statSync(f).size > 0);
    const entryFile = preferredEntry || path.join(rootDir, 'src', 'main.ts');
    
    dashboard.writeKnowledge(`[SUCCESS] Workspace scan completed. Found ${workspaceFiles.length} file(s). Entry file: ${entryFile}`);
    mainLog(`    Found ${workspaceFiles.length} source file(s)`);
    mainLog(`    Entry File: ${path.relative(rootDir, entryFile)}`);
    mainLog(`    ${Date.now() - scanStartTime} ms`);

    const { container } = await bootstrap();

    const task: EngineeringTask = {
      id: `task-${Date.now()}`,
      description: taskPrompt,
      entryFile,
      workspaceFiles: workspaceFiles.length > 0 ? workspaceFiles : [entryFile],
      workspaceRoot: wsMeta.rootPath,
      verificationCommands: wsMeta.verificationCommands,
    };

    const stageReports: { stage: string; status: string; summary: string }[] = [];

    const taskExecutionService = container.resolve<TaskExecutionService>('TaskExecutionService');
    const result = await taskExecutionService.executeTask(task, (event) => {
      const elapsed = event.durationMs !== undefined ? (event.durationMs >= 1000 ? `${(event.durationMs / 1000).toFixed(1)} s` : `${event.durationMs} ms`) : '';

      if (event.stage === 'Provider Stream') {
        if (event.metrics?.chunk) {
          dashboard.writeProvider(event.metrics.chunk);
        }
        return;
      }

      if (event.stage === 'Verification Stream') {
        if (event.metrics?.chunk) {
          dashboard.writeVerification(event.metrics.chunk);
        }
        return;
      }

      if (event.status === 'started') {
        if (event.stage === 'AI Provider Execution') {
          mainLog(`\n▶ AI Provider Execution`);
          mainLog(`    Provider: ${event.metrics?.providerName || 'Provider'}`);
          mainLog(`    Waiting for AI response...`);
          dashboard.writeProvider(`\n--- PROMPT SENT TO CLAUDE PROVIDER ---\nPrompt size: ${event.metrics?.promptLength || 0} chars\nWaiting for response...\n`);
        } else if (event.stage === 'Autonomous Retry Engine') {
          mainLog(`\n▶ Autonomous Retry Engine`);
          mainLog(`    Attempt: ${event.metrics?.attempt}/${event.metrics?.maxRetries}`);
          mainLog(`    Triggering self-repair loop...`);
          dashboard.writeMain(`[RETRY] Triggering self-repair attempt ${event.metrics?.attempt}/${event.metrics?.maxRetries}`);
        } else {
          mainLog(`\n▶ ${event.stage}`);
        }
      } else if (event.status === 'completed') {
        if (event.stage === 'Project Knowledge Engine') {
          mainLog(`    Indexed Files: ${event.metrics?.workspaceFilesCount}`);
          mainLog(`    Tech Stack: ${event.metrics?.techStack?.join(', ') || wsMeta.projectType}`);
          mainLog(`    Schema Version: v${event.metrics?.schemaVersion || 1}`);
          mainLog(`    ${elapsed}`);
          dashboard.writeKnowledge(`[KNOWLEDGE] Indexed ${event.metrics?.workspaceFilesCount} files. Tech stack: ${event.metrics?.techStack?.join(', ') || wsMeta.projectType}. Schema: v${event.metrics?.schemaVersion}`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Indexed ${event.metrics?.workspaceFilesCount} files (${wsMeta.projectType})` });
        } else if (event.stage === 'Context Builder') {
          mainLog(`    Selected Files: ${event.metrics?.selectedFilesCount || 1}`);
          mainLog(`    Context Size: ${event.metrics?.contextSizeKB} KB (${event.metrics?.contextSizeChars} chars)`);
          mainLog(`    ${elapsed}`);
          dashboard.writeKnowledge(`[CONTEXT] Compiled ${event.metrics?.contextSizeKB} KB context slice (${event.metrics?.contextSizeChars} chars)`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Compiled ${event.metrics?.contextSizeKB} KB context slice` });
        } else if (event.stage === 'AI Provider Execution') {
          mainLog(`    Response received (${event.metrics?.responseLength || 0} chars)`);
          mainLog(`    ${elapsed}`);
          dashboard.writeProvider(`\n[RESPONSE RECEIVED] Completed in ${elapsed}. Size: ${event.metrics?.responseLength} chars\n`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Received AI response (${event.metrics?.responseLength} chars)` });
        } else if (event.stage === 'Response Validation & Parser') {
          mainLog(`    Extracted Code Blocks: ${event.metrics?.codeBlocksCount}`);
          mainLog(`    Validation Status: PASSED (Confidence: ${event.metrics?.confidence?.toFixed(2)})`);
          mainLog(`    ${elapsed}`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Validated ${event.metrics?.codeBlocksCount} code block(s)` });
        } else if (event.stage === 'Patch Generator & Workspace Updater') {
          mainLog(`    Patch Status: APPLIED`);
          if (event.metrics?.modifiedFiles && event.metrics.modifiedFiles.length > 0) {
            mainLog(`    Files modified:`);
            event.metrics.modifiedFiles.forEach((f: string) => mainLog(`      ${path.relative(rootDir, f)}`));
          } else {
            mainLog(`    Files modified: None`);
          }
          mainLog(`    ${elapsed}`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Applied patches to ${event.metrics?.modifiedFiles?.length || 0} file(s)` });
        } else if (event.stage === 'Verification Runner') {
          mainLog(`    Build: ${event.metrics?.buildPassed ? 'PASS' : 'FAIL'}`);
          mainLog(`    Tests: ${event.metrics?.testsPassed ? 'PASS' : 'FAIL'}`);
          mainLog(`    ${elapsed}`);
          dashboard.writeVerification(`\n[VERIFICATION RESULT] Build: ${event.metrics?.buildPassed ? 'PASS' : 'FAIL'}, Tests: ${event.metrics?.testsPassed ? 'PASS' : 'FAIL'} (${elapsed})\n`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Verification passed (Build: PASS, Tests: PASS)` });
        }
      } else if (event.status === 'failed') {
        mainLog(`    Status: FAILED (${elapsed})`);
        mainLog(`\n❌ STAGE FAILURE IN [${event.stage}]`);
        mainLog(`    Component:       ${event.stage}`);
        mainLog(`    Error Message:   ${event.error}`);
        if (event.exceptionStack) {
          mainLog(`    Stack Trace:`);
          mainLog(`    --------------------------------------------------`);
          mainLog(`    ${event.exceptionStack.split('\n').slice(0, 8).join('\n    ')}`);
          mainLog(`    --------------------------------------------------`);
        }
        if (event.metrics?.verificationLogs) {
          mainLog(`    Verification Logs:`);
          mainLog(`    --------------------------------------------------`);
          mainLog(`    ${event.metrics.verificationLogs.split('\n').slice(0, 10).join('\n    ')}`);
          mainLog(`    --------------------------------------------------`);
        }
        if (event.recoveryAction) {
          mainLog(`    Recovery Action: ${event.recoveryAction}`);
        }
        stageReports.push({ stage: event.stage, status: 'FAILED', summary: `Failed: ${event.error}` });
      }
    });

    let gitCommitHash: string | undefined = undefined;
    if (result.status === 'SUCCESS' && result.modifiedFiles && result.modifiedFiles.length > 0) {
      const gitStartTime = Date.now();
      mainLog(`\n▶ Git Integration`);
      const runtime = container.resolve<IProcessRuntime>('ProcessRuntime');
      const gitManager = new GitManager(runtime, wsMeta.rootPath);
      
      const gitDiff = await gitManager.generateDiff(result.modifiedFiles);
      dashboard.writeGit(`--- GIT DIFF ---\n${gitDiff || '(no diff)'}\n`);

      const gitStatus = await gitManager.getStatus();
      dashboard.writeGit(`--- GIT STATUS ---\nClean: ${gitStatus.isClean}, Files: ${gitStatus.modifiedFiles.join(', ')}\n`);

      const commitRes = await gitManager.commit(result.modifiedFiles, `feat(se-os): ${taskPrompt}`);
      if (commitRes.success) {
        gitCommitHash = commitRes.commitHash;
        mainLog(`    Commit Hash: ${gitCommitHash}`);
        mainLog(`    ${Date.now() - gitStartTime} ms`);
        dashboard.writeGit(`[COMMIT CREATED] Hash: ${gitCommitHash}\nMessage: feat(se-os): ${taskPrompt}\n`);
        stageReports.push({ stage: 'Git Integration', status: 'SUCCESS', summary: `Created commit ${gitCommitHash}` });
      } else {
        mainLog(`    Commit Failed: ${commitRes.error}`);
        dashboard.writeGit(`[COMMIT FAILED] ${commitRes.error}\n`);
        stageReports.push({ stage: 'Git Integration', status: 'FAILED', summary: `Commit failed: ${commitRes.error}` });
      }
    } else {
      const runtime = container.resolve<IProcessRuntime>('ProcessRuntime');
      const gitManager = new GitManager(runtime, wsMeta.rootPath);
      const gitStatus = await gitManager.getStatus();
      dashboard.writeGit(`--- GIT STATUS ---\nClean: ${gitStatus.isClean}, Files: ${gitStatus.modifiedFiles.join(', ')}\n`);
    }

    mainLog('\n====================================================');
    mainLog('              DETAILED EXECUTION REPORT             ');
    mainLog('====================================================');
    mainLog(`Task ID:            ${result.taskId}`);
    mainLog(`Task Summary:       "${taskPrompt}"`);
    mainLog(`Execution Status:   ${result.status}`);
    mainLog(`Total Duration:     ${(result.durationMs / 1000).toFixed(2)} s (${result.durationMs} ms)`);
    mainLog(`\nWhat Happened:`);
    mainLog(`  ✔ Workspace Scan: Found ${workspaceFiles.length} source file(s)`);
    stageReports.forEach((rep) => {
      if (rep.status === 'SUCCESS') {
        mainLog(`  ✔ ${rep.stage}: ${rep.summary}`);
      } else {
        mainLog(`  ✖ ${rep.stage}: ${rep.summary}`);
      }
    });

    mainLog(`\nWhat Did Not Happen:`);
    if (result.status === 'SUCCESS') {
      if (result.retryCount === 0) {
        mainLog(`  - Autonomous Retry Engine: Not triggered (execution succeeded on first attempt)`);
      }
    } else {
      if (!gitCommitHash) {
        mainLog(`  - Git Commit: Skipped because task execution/verification did not succeed`);
      }
    }

    mainLog(`\nWhy:`);
    if (result.status === 'SUCCESS') {
      mainLog(`  The pipeline successfully parsed the codebase context, received a valid code block from the provider, applied file patches to the workspace, and verified that all build and test assertions passed cleanly.`);
    } else {
      mainLog(`  Failure Root Cause: ${result.error || 'Execution did not produce verified workspace updates.'}`);
      if (result.validationErrors && result.validationErrors.length > 0) {
        mainLog(`  Validation Errors:\n    - ${result.validationErrors.join('\n    - ')}`);
      }
      if (result.verificationLogs) {
        mainLog(`  Verification Output Snippet:\n    - ${result.verificationLogs.split('\n').slice(0, 6).join('\n    - ')}`);
      }
    }
    mainLog('====================================================\n');

    console.log(dashboard.attachBanner('se-os'));

    const storage = container.resolve<IStorage>('Storage');
    await storage.close();

    process.exit(result.status === 'SUCCESS' ? 0 : 1);
  })().catch((err) => {
    console.error('\n❌ Fatal Execution Exception:');
    console.error(err);
    process.exit(1);
  });
}

export { bootstrap };
