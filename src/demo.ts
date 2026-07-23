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
import { IProvider } from './core/domain/interfaces/iprovider';
import { ClaudeProvider } from './infrastructure/runtime/claude_provider';
import { MockProvider } from './infrastructure/runtime/mock_provider';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

function detectClaudeCli(): boolean {
  const executable = process.env.CLAUDE_EXECUTABLE || 'claude';
  try {
    // Cross-platform check if executable exists
    const checkCmd = process.platform === 'win32' ? `where ${executable}` : `which ${executable}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

async function runDemo() {
  console.log('--- Starting SE-OS E2E Executable Demo ---');

  // 1. Detect and configure provider selection dynamically
  const hasClaude = detectClaudeCli();
  if (hasClaude) {
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

  // Register selected provider implementation
  let providerInstance: IProvider;
  if (config.get().providerType === 'claude') {
    providerInstance = new ClaudeProvider(runtime, config.get().claudeExecutable);
  } else {
    providerInstance = new MockProvider(runtime);
  }
  container.register('Provider', providerInstance);

  console.log('✔ Services registered in DI container successfully.');

  // 3. Create a Mock TypeScript Workspace File
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

  // 4. Run VFS and Context Builder on the target symbol "add"
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

  // 5. Execute Resolved Provider (Claude or Mock fallback)
  console.log(`\n--- Running AI Provider: [${providerInstance.providerName()}] ---`);
  const provider = container.resolve<IProvider>('Provider');

  console.log('Streaming refactoring prompt & context to provider...');
  const result = await provider.stream(contextResult.codeContent, (chunk) => {
    process.stdout.write(chunk);
  });

  console.log('\n--- Execution Finished ---');
  console.log(`Execution Success: ${result.success}`);
  console.log(`Exit Code: ${result.exitCode}`);
  console.log(`Duration: ${result.durationMs}ms`);
  if (result.error) {
    console.error(`Provider Error: ${result.error}`);
  }

  // 6. Cleanup
  fs.rmSync(workspaceDir, { recursive: true, force: true });
  await repository.close();
  console.log('\n✔ Workspace cleaned up and database connection closed.');
  console.log('--- Demo Completed Successfully ---');
}

runDemo().catch((err) => {
  console.error('Demo failed:', err);
});
