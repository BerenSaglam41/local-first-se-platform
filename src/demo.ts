import { DiContainer } from './infrastructure/di/di_container';
import { ConfigLoader } from './infrastructure/config/config_loader';
import { JsonLogger } from './infrastructure/logging/json_logger';
import { SqliteDb } from './infrastructure/storage/sqlite_db';
import { SqliteRepository } from './infrastructure/storage/sqlite_repository';
import { InMemoryCache } from './infrastructure/cache/in_memory_cache';
import { VirtualFileSystem } from './infrastructure/vfs/vfs';
import { CodeSliceEngine } from './infrastructure/parser/code_slice_engine';
import { TypeScriptASTParser } from './infrastructure/parser/ts_ast_parser';
import { DependencyResolver } from './infrastructure/parser/dependency_resolver';
import { ContextBuilder } from './infrastructure/parser/context_builder';
import { ProcessRuntime } from './infrastructure/runtime/process_runtime';
import { IProvider } from './core/domain/interfaces/iprovider';
import { ClaudeProvider } from './infrastructure/runtime/claude_provider';
import { MockProvider } from './infrastructure/runtime/mock_provider';
import { TaskExecutionService } from './core/application/services/task_execution_service';
import { EngineeringTask, ExecutionResult } from './core/domain/models/execution';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

function detectClaudeCli(): boolean {
  const executable = process.env.CLAUDE_EXECUTABLE || 'claude';
  try {
    const checkCmd = process.platform === 'win32' ? `where ${executable}` : `which ${executable}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function printResult(result: ExecutionResult) {
  console.log('\n--- Execution Finished ---');
  console.log(`Task ID:           ${result.taskId}`);
  console.log(`Status:            ${result.status}`);
  console.log(`Validation Status: ${result.validationStatus}`);
  console.log(`Parser Confidence: ${result.parserConfidence.toFixed(2)}`);
  console.log(`Patch Status:      ${result.patchStatus}`);
  console.log(`Duration:          ${result.durationMs}ms`);
  console.log(`Retry Count:       ${result.retryCount}`);

  if (result.retryHistory.length > 0) {
    console.log(`Retry History (${result.retryHistory.length}):`);
    result.retryHistory.forEach(history => console.log(`  - ${history}`));
  }

  console.log('\n--- Verification Summary ---');
  console.log(`Build:             ${result.buildPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Tests:             ${result.testsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Verification:      ${result.verificationStatus.toUpperCase()}`);
  if (result.verificationSteps.length > 0) {
    console.log(`Verification Steps (${result.verificationSteps.length}):`);
    result.verificationSteps.forEach(step => console.log(`  - ${step}`));
  }

  if (result.verificationLogs) {
    console.log('--- Verification Logs ---');
    console.log(result.verificationLogs);
    console.log('-------------------------');
  }

  if (result.modifiedFiles.length > 0) {
    console.log(`\n✔ Modified Files (${result.modifiedFiles.length}):`);
    result.modifiedFiles.forEach(file => {
      console.log(`  - [MODIFIED] ${path.basename(file)}`);
      if (fs.existsSync(file)) {
        console.log('--- FILE CONTENT AFTER UPDATE ---');
        console.log(fs.readFileSync(file, 'utf8'));
        console.log('---------------------------------');
      }
    });
  } else {
    console.log('ℹ No files were modified in the workspace.');
  }

  if (result.filesSkipped.length > 0) {
    console.log(`ℹ Skipped Files (${result.filesSkipped.length}):`);
    result.filesSkipped.forEach(file => console.log(`  - [SKIPPED] ${path.basename(file)}`));
  }

  if (result.validationErrors.length > 0) {
    console.log(`❌ Validation Errors (${result.validationErrors.length}):`);
    result.validationErrors.forEach(err => console.log(`  - ${err}`));
  }

  if (result.validationWarnings.length > 0) {
    console.log(`⚠ Validation Warnings (${result.validationWarnings.length}):`);
    result.validationWarnings.forEach(w => console.log(`  - ${w}`));
  }

  if (result.status !== 'SUCCESS') {
    console.log(`❌ Error: ${result.error}`);
  }
}

async function runDemo() {
  console.log('--- Starting SE-OS E2E Executable Demo ---');

  // 1. Detect and configure provider selection dynamically
  const hasClaude = detectClaudeCli();
  if (process.env.PROVIDER_TYPE === 'mock') {
    console.log('ℹ PROVIDER_TYPE=mock explicitly configured. Selecting Mock Provider.');
  } else if (hasClaude) {
    console.log('✔ Detected Claude CLI installed on host. Selecting Claude Provider.');
    process.env.PROVIDER_TYPE = 'claude';
  } else {
    console.log('ℹ Claude CLI not detected in system path. Falling back to Mock Provider.');
    process.env.PROVIDER_TYPE = 'mock';
  }

  // 2. Setup DI Container & Register Services
  const container = new DiContainer();
  const config = new ConfigLoader();
  const logger = new JsonLogger(config);
  const db = new SqliteDb(config, logger);
  const repository = new SqliteRepository(db);

  await repository.initialize();

  const cache = new InMemoryCache();
  const vfs = new VirtualFileSystem(cache);
  const sliceEngine = new CodeSliceEngine();
  const astParser = new TypeScriptASTParser(sliceEngine);
  const dependencyResolver = new DependencyResolver();
  const contextBuilder = new ContextBuilder(vfs, astParser, dependencyResolver, cache);
  const runtime = new ProcessRuntime();

  container.register('Config', config);
  container.register('Logger', logger);
  container.register('SqliteDb', db);
  container.register('Storage', repository);
  container.register('Cache', cache);
  container.register('Vfs', vfs);
  container.register('SliceEngine', sliceEngine);
  container.register('ASTParser', astParser);
  container.register('DependencyResolver', dependencyResolver);
  container.register('ContextBuilder', contextBuilder);
  container.register('ProcessRuntime', runtime);

  let providerInstance: IProvider;
  if (config.get().providerType === 'claude') {
    providerInstance = new ClaudeProvider(runtime, config.get().claudeExecutable);
  } else {
    providerInstance = new MockProvider(runtime);
  }
  container.register('Provider', providerInstance);

  const taskExecutionService = new TaskExecutionService(contextBuilder, providerInstance, config, runtime);
  container.register('TaskExecutionService', taskExecutionService);

  console.log('✔ Services registered in DI container successfully.');

  // Helper to reset workspace file
  const workspaceDir = path.join(__dirname, '..', 'demo_workspace');
  const helperFile = path.join(workspaceDir, 'math_helper.ts');

  const resetWorkspace = () => {
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }
    const helperContent = `
      // Helper interface for calculations
      export interface OperationConfig {
        precision: number;
      }

      // Core math class
      export class MathHelper {
        constructor(private config: OperationConfig) {}

        // Performs addition
        add(a: number, b: number): number {
          return a + b;
        }
      }
    `;
    fs.writeFileSync(helperFile, helperContent, 'utf8');
  };

  // ==========================================
  // RUN 1: Valid Code Response
  // ==========================================
  resetWorkspace();
  console.log(`\n✔ Mock workspace file reset at: ${helperFile}`);

  const task1: EngineeringTask = {
    id: 'task-101-valid',
    description: 'Refactor the add method in MathHelper',
    entryFile: helperFile,
    workspaceFiles: [helperFile],
  };

  console.log(`\n==================================================`);
  console.log(`[RUN 1] Dispatching Task: ${task1.id}`);
  console.log(`Description: "${task1.description}" (Should succeed & modify workspace)`);
  console.log(`==================================================`);

  const executionService = container.resolve<TaskExecutionService>('TaskExecutionService');
  const result1 = await executionService.executeTask(task1);
  printResult(result1);

  // ==========================================
  // RUN 2: Conversational Response (Safety Validation Fail)
  // ==========================================
  resetWorkspace();
  console.log(`\n✔ Mock workspace file reset at: ${helperFile}`);

  const task2: EngineeringTask = {
    id: 'task-102-conversational',
    description: 'conversational: Refactor the add method in MathHelper',
    entryFile: helperFile,
    workspaceFiles: [helperFile],
  };

  console.log(`\n==================================================`);
  console.log(`[RUN 2] Dispatching Task: ${task2.id}`);
  console.log(`Description: "${task2.description}" (Should reject & NOT modify workspace)`);
  console.log(`==================================================`);

  const result2 = await executionService.executeTask(task2);
  printResult(result2);

  // ==========================================
  // RUN 3: Retry Simulation (Autonomous Retry Engine)
  // ==========================================
  resetWorkspace();
  console.log(`\n✔ Mock workspace file reset at: ${helperFile}`);

  const task3: EngineeringTask = {
    id: 'task-103-retry',
    description: 'retry-simulation: Refactor the add method in MathHelper',
    entryFile: helperFile,
    workspaceFiles: [helperFile],
  };

  console.log(`\n==================================================`);
  console.log(`[RUN 3] Dispatching Task: ${task3.id}`);
  console.log(`Description: "${task3.description}" (Should fail first attempt, then retry and succeed)`);
  console.log(`==================================================`);

  const result3 = await executionService.executeTask(task3);
  printResult(result3);

  // Cleanup
  fs.rmSync(workspaceDir, { recursive: true, force: true });
  await repository.close();
  console.log('\n✔ Workspace cleaned up and database connection closed.');
  console.log('--- Demo Completed Successfully ---');
}

runDemo().catch((err) => {
  console.error('Demo failed:', err);
});
