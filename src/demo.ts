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
import { IContextBuilder } from './core/domain/interfaces/icontext_builder';
import { IProcessRuntime } from './core/domain/interfaces/iprocess_runtime';
import * as fs from 'fs';
import * as path from 'path';

async function runDemo() {
  console.log('--- Starting SE-OS E2E Executable Demo ---');

  // 1. Setup DI Container & Register Services
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

  console.log('✔ Services registered in DI container successfully.');

  // 2. Create a Mock TypeScript Workspace File
  const workspaceDir = path.join(__dirname, '..', 'demo_workspace');
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }

  const helperFile = path.join(workspaceDir, 'math_helper.ts');
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
  console.log(`✔ Mock workspace file created at: ${helperFile}`);

  // 3. Run VFS and Context Builder on the target symbol "add"
  const targetSymbol = 'add';
  const taskDesc = `Refactor the ${targetSymbol} method in MathHelper`;
  console.log(`\n--- Running VFS and Context Builder for: "${taskDesc}" ---`);

  const resolvedContextBuilder = container.resolve<IContextBuilder>('ContextBuilder');
  const contextResult = await resolvedContextBuilder.buildContext(taskDesc, helperFile, [helperFile]);

  console.log('✔ Sliced AST Context generated successfully:');
  console.log('=========================================');
  console.log(contextResult.codeContent);
  console.log('=========================================');
  console.log(`Estimated Token Count: ${contextResult.tokenEstimate}`);

  // 4. Run Process Runtime with a Mock Provider Process
  console.log('\n--- Running Mock AI Provider Process Runtime ---');
  const resolvedRuntime = container.resolve<IProcessRuntime>('ProcessRuntime');

  // Spawn an inline node process acting as an AI Provider CLI
  const mockProviderScript = `
    process.stdin.on('data', (data) => {
      const prompt = data.toString().trim();
      console.log('\\n[Mock Provider stdout] Received context slice. Generating refactored response...');
      console.log('[Mock Provider stdout] RESPONSE:');
      console.log('export class MathHelper {');
      console.log('  // Refactored method with logging');
      console.log('  add(a: number, b: number): number {');
      console.log('    console.log(\\'Adding: \\' + a + \\' and \\' + b);');
      console.log('    return a + b;');
      console.log('  }');
      console.log('}');
      process.exit(0);
    });
  `;

  const handle = resolvedRuntime.execute({
    executable: process.execPath,
    args: ['-e', mockProviderScript],
  });

  handle.on('stdout', (chunk) => {
    process.stdout.write(chunk);
  });

  handle.on('stderr', (chunk) => {
    process.stderr.write(`[Error Stream] ${chunk}`);
  });

  // Write the sliced context code as input (stdin) to the mock provider
  await new Promise((resolve) => setTimeout(resolve, 100)); // wait for spawn
  console.log('Feeding sliced context to Mock Provider stdin...');
  await handle.write(contextResult.codeContent);

  const result = await handle.wait();
  console.log('\n--- Execution Finished ---');
  console.log(`Execution State: ${result.state}`);
  console.log(`Exit Code: ${result.exitCode}`);
  console.log(`PID: ${result.metrics.pid}`);
  console.log(`Duration: ${result.metrics.durationMs}ms`);

  // 5. Cleanup
  fs.rmSync(workspaceDir, { recursive: true, force: true });
  await repository.close();
  console.log('\n✔ Workspace cleaned up and database connection closed.');
  console.log('--- Demo Completed Successfully ---');
}

runDemo().catch((err) => {
  console.error('Demo failed:', err);
});
