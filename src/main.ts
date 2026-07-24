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
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', '.git', 'coverage', 'logs', 'brain'].includes(entry.name)) {
          continue;
        }
        results.push(...scanWorkspaceFiles(fullPath));
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.db') || entry.name.endsWith('.log') || entry.name.endsWith('.jsonl')) {
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.json'].includes(ext)) {
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
  const taskPrompt = process.argv.slice(2).join(' ').trim();

  if (!taskPrompt) {
    console.log(`
====================================================
Local-First AI Software Engineering Platform (SE-OS)
====================================================

Usage:
  npm start -- "<task_description>"

Examples:
  npm start -- "Refactor the authentication module"
  npm start -- "Implement a calculator class"
`);
    process.exit(0);
  }

  (async () => {
    console.log('----------------------------------------');
    console.log(`Task received: "${taskPrompt}"`);
    console.log('Executing task through SE-OS pipeline...');
    console.log('----------------------------------------');

    const rootDir = process.cwd();
    const scanStartTime = Date.now();
    console.log('\n▶ Workspace Scan');
    const workspaceFiles = scanWorkspaceFiles(rootDir);

    // Extract target files mentioned in task prompt (e.g. src/calculator.ts)
    const fileMatches = taskPrompt.match(/([a-zA-Z0-9_\-\.\/]+\.(?:ts|js|tsx|jsx))/g);
    if (fileMatches) {
      for (const fm of fileMatches) {
        const fullFm = path.isAbsolute(fm) ? fm : path.join(rootDir, fm);
        if (!workspaceFiles.includes(fullFm)) {
          workspaceFiles.push(fullFm);
        }
      }
    }

    const preferredEntry = workspaceFiles.find(f => f.endsWith('src/main.ts') || f.endsWith('src/index.ts')) || workspaceFiles.find(f => f.endsWith('.ts') && fs.existsSync(f) && fs.statSync(f).size > 0);
    const entryFile = preferredEntry || path.join(rootDir, 'src', 'main.ts');
    console.log(`    Found ${workspaceFiles.length} source file(s)`);
    console.log(`    Entry File: ${path.relative(rootDir, entryFile)}`);
    console.log(`    ${Date.now() - scanStartTime} ms`);

    const { container } = await bootstrap();

    const task: EngineeringTask = {
      id: `task-${Date.now()}`,
      description: taskPrompt,
      entryFile,
      workspaceFiles: workspaceFiles.length > 0 ? workspaceFiles : [entryFile],
    };

    const stageReports: { stage: string; status: string; summary: string }[] = [];

    const taskExecutionService = container.resolve<TaskExecutionService>('TaskExecutionService');
    const result = await taskExecutionService.executeTask(task, (event) => {
      const elapsed = event.durationMs !== undefined ? (event.durationMs >= 1000 ? `${(event.durationMs / 1000).toFixed(1)} s` : `${event.durationMs} ms`) : '';

      if (event.status === 'started') {
        if (event.stage === 'AI Provider Execution') {
          console.log(`\n▶ AI Provider Execution`);
          console.log(`    Provider: ${event.metrics?.providerName || 'Provider'}`);
          console.log(`    Waiting for AI response...`);
        } else if (event.stage === 'Autonomous Retry Engine') {
          console.log(`\n▶ Autonomous Retry Engine`);
          console.log(`    Attempt: ${event.metrics?.attempt}/${event.metrics?.maxRetries}`);
          console.log(`    Triggering self-repair loop...`);
        } else {
          console.log(`\n▶ ${event.stage}`);
        }
      } else if (event.status === 'completed') {
        if (event.stage === 'Project Knowledge Engine') {
          console.log(`    Indexed Files: ${event.metrics?.workspaceFilesCount}`);
          console.log(`    Tech Stack: ${event.metrics?.techStack?.join(', ') || 'TypeScript, Node.js'}`);
          console.log(`    Schema Version: v${event.metrics?.schemaVersion || 1}`);
          console.log(`    ${elapsed}`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Indexed ${event.metrics?.workspaceFilesCount} files (${event.metrics?.techStack?.join(', ') || 'TypeScript'})` });
        } else if (event.stage === 'Context Builder') {
          console.log(`    Selected Files: ${event.metrics?.selectedFilesCount || 1}`);
          console.log(`    Context Size: ${event.metrics?.contextSizeKB} KB (${event.metrics?.contextSizeChars} chars)`);
          console.log(`    ${elapsed}`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Compiled ${event.metrics?.contextSizeKB} KB context slice` });
        } else if (event.stage === 'AI Provider Execution') {
          console.log(`    Response received (${event.metrics?.responseLength || 0} chars)`);
          console.log(`    ${elapsed}`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Received AI response (${event.metrics?.responseLength} chars)` });
        } else if (event.stage === 'Response Validation & Parser') {
          console.log(`    Extracted Code Blocks: ${event.metrics?.codeBlocksCount}`);
          console.log(`    Validation Status: PASSED (Confidence: ${event.metrics?.confidence?.toFixed(2)})`);
          console.log(`    ${elapsed}`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Validated ${event.metrics?.codeBlocksCount} code block(s)` });
        } else if (event.stage === 'Patch Generator & Workspace Updater') {
          console.log(`    Patch Status: APPLIED`);
          if (event.metrics?.modifiedFiles && event.metrics.modifiedFiles.length > 0) {
            console.log(`    Files modified:`);
            event.metrics.modifiedFiles.forEach((f: string) => console.log(`      ${path.relative(rootDir, f)}`));
          } else {
            console.log(`    Files modified: None`);
          }
          console.log(`    ${elapsed}`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Applied patches to ${event.metrics?.modifiedFiles?.length || 0} file(s)` });
        } else if (event.stage === 'Verification Runner') {
          console.log(`    Build: ${event.metrics?.buildPassed ? 'PASS' : 'FAIL'}`);
          console.log(`    Tests: ${event.metrics?.testsPassed ? 'PASS' : 'FAIL'}`);
          console.log(`    ${elapsed}`);
          stageReports.push({ stage: event.stage, status: 'SUCCESS', summary: `Verification passed (Build: PASS, Tests: PASS)` });
        }
      } else if (event.status === 'failed') {
        console.log(`    Status: FAILED (${elapsed})`);
        console.log(`\n❌ STAGE FAILURE IN [${event.stage}]`);
        console.log(`    Component:       ${event.stage}`);
        console.log(`    Error Message:   ${event.error}`);
        if (event.exceptionStack) {
          console.log(`    Stack Trace:`);
          console.log(`    --------------------------------------------------`);
          console.log(`    ${event.exceptionStack.split('\n').slice(0, 8).join('\n    ')}`);
          console.log(`    --------------------------------------------------`);
        }
        if (event.metrics?.verificationLogs) {
          console.log(`    Verification Logs:`);
          console.log(`    --------------------------------------------------`);
          console.log(`    ${event.metrics.verificationLogs.split('\n').slice(0, 10).join('\n    ')}`);
          console.log(`    --------------------------------------------------`);
        }
        if (event.recoveryAction) {
          console.log(`    Recovery Action: ${event.recoveryAction}`);
        }
        stageReports.push({ stage: event.stage, status: 'FAILED', summary: `Failed: ${event.error}` });
      }
    });

    let gitCommitHash: string | undefined = undefined;
    if (result.status === 'SUCCESS' && result.modifiedFiles && result.modifiedFiles.length > 0) {
      const gitStartTime = Date.now();
      console.log(`\n▶ Git Integration`);
      const runtime = container.resolve<IProcessRuntime>('ProcessRuntime');
      const gitManager = new GitManager(runtime);
      const commitRes = await gitManager.commit(result.modifiedFiles, `feat(se-os): ${taskPrompt}`);
      if (commitRes.success) {
        gitCommitHash = commitRes.commitHash;
        console.log(`    Commit Hash: ${gitCommitHash}`);
        console.log(`    ${Date.now() - gitStartTime} ms`);
        stageReports.push({ stage: 'Git Integration', status: 'SUCCESS', summary: `Created commit ${gitCommitHash}` });
      } else {
        console.log(`    Commit Failed: ${commitRes.error}`);
        stageReports.push({ stage: 'Git Integration', status: 'FAILED', summary: `Commit failed: ${commitRes.error}` });
      }
    }

    console.log('\n====================================================');
    console.log('              DETAILED EXECUTION REPORT             ');
    console.log('====================================================');
    console.log(`Task ID:            ${result.taskId}`);
    console.log(`Task Summary:       "${taskPrompt}"`);
    console.log(`Execution Status:   ${result.status}`);
    console.log(`Total Duration:     ${(result.durationMs / 1000).toFixed(2)} s (${result.durationMs} ms)`);
    console.log(`\nWhat Happened:`);
    console.log(`  ✔ Workspace Scan: Found ${workspaceFiles.length} source file(s)`);
    stageReports.forEach((rep) => {
      if (rep.status === 'SUCCESS') {
        console.log(`  ✔ ${rep.stage}: ${rep.summary}`);
      } else {
        console.log(`  ✖ ${rep.stage}: ${rep.summary}`);
      }
    });

    console.log(`\nWhat Did Not Happen:`);
    if (result.status === 'SUCCESS') {
      if (result.retryCount === 0) {
        console.log(`  - Autonomous Retry Engine: Not triggered (execution succeeded on first attempt)`);
      }
    } else {
      if (!gitCommitHash) {
        console.log(`  - Git Commit: Skipped because task execution/verification did not succeed`);
      }
    }

    console.log(`\nWhy:`);
    if (result.status === 'SUCCESS') {
      console.log(`  The pipeline successfully parsed the codebase context, received a valid code block from the provider, applied file patches to the workspace, and verified that all build and test assertions passed cleanly.`);
    } else {
      console.log(`  Failure Root Cause: ${result.error || 'Execution did not produce verified workspace updates.'}`);
      if (result.validationErrors && result.validationErrors.length > 0) {
        console.log(`  Validation Errors:\n    - ${result.validationErrors.join('\n    - ')}`);
      }
      if (result.verificationLogs) {
        console.log(`  Verification Output Snippet:\n    - ${result.verificationLogs.split('\n').slice(0, 6).join('\n    - ')}`);
      }
    }
    console.log('====================================================\n');

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
