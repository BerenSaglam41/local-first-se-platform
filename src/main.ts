import { DiContainer } from './infrastructure/di/di_container';
import { ConfigLoader } from './infrastructure/config/config_loader';
import { JsonLogger } from './infrastructure/logging/json_logger';
import { SqliteDb } from './infrastructure/storage/sqlite_db';
import { SqliteRepository } from './infrastructure/storage/sqlite_repository';
import { IConfig } from './core/domain/interfaces/iconfig';
import { ILogger } from './core/domain/interfaces/ilogger';
import { IStorage } from './core/domain/interfaces/istorage';
import { randomUUID } from 'crypto';

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

// Run bootstrap if script is executed directly
if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
  });
}

export { bootstrap };
