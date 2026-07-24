import * as fs from 'fs';
import * as path from 'path';
import { ProjectKnowledgeService, KNOWLEDGE_SCHEMA_VERSION } from '../src/core/application/services/project_knowledge_service';
import { InMemoryCache } from '../src/infrastructure/cache/in_memory_cache';
import { VirtualFileSystem } from '../src/infrastructure/vfs/vfs';
import { DependencyResolver } from '../src/infrastructure/parser/dependency_resolver';
import { SqliteDb } from '../src/infrastructure/storage/sqlite_db';
import { SqliteRepository } from '../src/infrastructure/storage/sqlite_repository';
import { IASTParser } from '../src/core/domain/interfaces/iast_parser';
import { CodeSymbol } from '../src/core/domain/models/ast';
import { IConfig } from '../src/core/domain/interfaces/iconfig';
import { ILogger } from '../src/core/domain/interfaces/ilogger';

/**
 * Mock AST parser that returns predictable symbols without loading
 * the tree-sitter native C++ addon. This avoids the Jest sandbox
 * conflict where multiple test suites loading the same native module
 * corrupt each other's runtime context.
 */
class MockASTParser implements IASTParser {
  public parseCalls: { content: string; language: string }[] = [];

  supportsLanguage(language: string): boolean {
    return language === 'typescript' || language === 'tsx' || language === 'javascript';
  }

  parse(content: string, language: string): CodeSymbol[] {
    this.parseCalls.push({ content, language });

    // Extract a predictable set of symbols from the content
    const symbols: CodeSymbol[] = [];

    // Detect export class declarations
    const classRegex = /export\s+class\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = classRegex.exec(content)) !== null) {
      symbols.push({
        name: match[1],
        type: 'class',
        startLine: 1,
        endLine: 1,
        content: `export class ${match[1]} {}`,
        dependencies: [],
      });
    }

    // Detect export function declarations
    const funcRegex = /export\s+function\s+(\w+)/g;
    while ((match = funcRegex.exec(content)) !== null) {
      symbols.push({
        name: match[1],
        type: 'function',
        startLine: 1,
        endLine: 1,
        content: `export function ${match[1]}() {}`,
        dependencies: [],
      });
    }

    // Detect import statements
    const importRegex = /import\s+\{([^}]+)\}\s+from/g;
    while ((match = importRegex.exec(content)) !== null) {
      const names = match[1].split(',').map((n) => n.trim());
      for (const name of names) {
        symbols.push({
          name,
          type: 'import',
          startLine: 1,
          endLine: 1,
          content: `import { ${name} }`,
          dependencies: [],
        });
      }
    }

    return symbols;
  }
}

describe('ProjectKnowledgeService', () => {
  const tempDir = path.join(__dirname, 'temp_knowledge_test');
  let db: SqliteDb;
  let repository: SqliteRepository;
  let vfs: VirtualFileSystem;
  let mockParser: MockASTParser;
  let resolver: DependencyResolver;
  let service: ProjectKnowledgeService;

  const mockConfig: IConfig = {
    get: () => ({
      port: 3000,
      env: 'test',
      dbPath: ':memory:',
      logPath: './test.jsonl',
      maxConcurrentAgents: 5,
      approvalMode: 'automatic',
      defaultContextBudget: 4096,
      providerType: 'mock',
      claudeExecutable: 'claude',
      verificationCommands: ['npm run build', 'npm test'],
      maxRetryCount: 3,
    }),
  };

  const mockLogger: ILogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  beforeEach(async () => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Set up in-memory database
    db = new SqliteDb(mockConfig, mockLogger);
    repository = new SqliteRepository(db);
    await repository.initialize();

    // Create project record (required by foreign key constraint)
    await repository.createProject({
      id: 'test-project',
      name: 'Test Project',
      rootPath: tempDir,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Set up service dependencies
    const cache = new InMemoryCache();
    vfs = new VirtualFileSystem(cache);
    mockParser = new MockASTParser();
    resolver = new DependencyResolver();

    service = new ProjectKnowledgeService(vfs, mockParser, resolver, repository, db);
  });

  afterEach(async () => {
    await db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should perform initial indexing and persist metadata and file records', async () => {
    // Write a source file
    const sourceFile = path.join(tempDir, 'calculator.ts');
    fs.writeFileSync(sourceFile, `
      import { Config } from './config';
      export class Calculator {
        add(a: number, b: number): number { return a + b; }
      }
      export function createCalc(): Calculator { return new Calculator(); }
    `, 'utf8');

    // Write a package.json
    const pkgFile = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgFile, JSON.stringify({
      name: 'test-project',
      devDependencies: { typescript: '^5.0.0', jest: '^29.0.0' }
    }), 'utf8');

    // Write a tsconfig.json
    const tsconfigFile = path.join(tempDir, 'tsconfig.json');
    fs.writeFileSync(tsconfigFile, '{}', 'utf8');

    // Write a jest config
    const jestConfigFile = path.join(tempDir, 'jest.config.js');
    fs.writeFileSync(jestConfigFile, 'module.exports = {};', 'utf8');

    const workspaceFiles = [sourceFile, pkgFile, tsconfigFile, jestConfigFile];
    await service.indexProject('test-project', tempDir, workspaceFiles);

    // Verify project metadata
    const metadata = await service.getProjectMetadata('test-project');
    expect(metadata).not.toBeNull();
    expect(metadata!.schemaVersion).toBe(KNOWLEDGE_SCHEMA_VERSION);
    expect(metadata!.language).toBe('typescript');
    expect(metadata!.packageManager).toBe('npm');
    expect(metadata!.buildSystem).toBe('tsc');
    expect(metadata!.testFramework).toBe('jest');
    expect(metadata!.techStack).toContain('TypeScript');
    expect(metadata!.techStack).toContain('Node.js');
    expect(metadata!.techStack).toContain('Jest');

    // Verify file knowledge was persisted
    const fileKnowledge = await service.getFileKnowledge(sourceFile);
    expect(fileKnowledge).not.toBeNull();
    expect(fileKnowledge!.exports).toContain('Calculator');
    expect(fileKnowledge!.exports).toContain('createCalc');
    expect(fileKnowledge!.imports).toContain('Config');
    expect(fileKnowledge!.symbols.length).toBeGreaterThan(0);

    // Verify the parser was called for source files (calculator.ts and jest.config.js)
    expect(mockParser.parseCalls.length).toBe(2);
    expect(mockParser.parseCalls.some(c => c.language === 'typescript')).toBe(true);
    expect(mockParser.parseCalls.some(c => c.language === 'javascript')).toBe(true);
  });

  it('should skip unchanged files during incremental indexing', async () => {
    const sourceFile = path.join(tempDir, 'service.ts');
    fs.writeFileSync(sourceFile, `export class UserService {}`, 'utf8');

    const workspaceFiles = [sourceFile];

    // First index
    await service.indexProject('test-project', tempDir, workspaceFiles);
    expect(mockParser.parseCalls.length).toBe(1);

    // Clear call tracking
    mockParser.parseCalls = [];

    // Second index without modifying the file — should skip AST parsing
    await service.indexProject('test-project', tempDir, workspaceFiles);
    expect(mockParser.parseCalls.length).toBe(0);
  });

  it('should re-parse files that have changed since last index', async () => {
    const sourceFile = path.join(tempDir, 'module.ts');
    fs.writeFileSync(sourceFile, `export class OldModule {}`, 'utf8');

    const workspaceFiles = [sourceFile];

    // First index
    await service.indexProject('test-project', tempDir, workspaceFiles);
    expect(mockParser.parseCalls.length).toBe(1);

    const knowledge1 = await service.getFileKnowledge(sourceFile);
    expect(knowledge1!.exports).toContain('OldModule');

    // Clear call tracking
    mockParser.parseCalls = [];

    // Modify the file
    fs.writeFileSync(sourceFile, `export class NewModule {}`, 'utf8');

    // Invalidate VFS cache so the new content is read
    const cache2 = new InMemoryCache();
    const vfs2 = new VirtualFileSystem(cache2);
    const service2 = new ProjectKnowledgeService(vfs2, mockParser, resolver, repository, db);

    await service2.indexProject('test-project', tempDir, workspaceFiles);
    expect(mockParser.parseCalls.length).toBe(1);

    const knowledge2 = await service2.getFileKnowledge(sourceFile);
    expect(knowledge2!.exports).toContain('NewModule');
    expect(knowledge2!.exports).not.toContain('OldModule');
  });

  it('should purge database records for deleted files', async () => {
    const fileA = path.join(tempDir, 'a.ts');
    const fileB = path.join(tempDir, 'b.ts');
    fs.writeFileSync(fileA, `export class A {}`, 'utf8');
    fs.writeFileSync(fileB, `export class B {}`, 'utf8');

    // Index both files
    await service.indexProject('test-project', tempDir, [fileA, fileB]);
    expect(await service.getFileKnowledge(fileA)).not.toBeNull();
    expect(await service.getFileKnowledge(fileB)).not.toBeNull();

    // Delete file B from workspace
    fs.unlinkSync(fileB);

    // Re-index with only file A in workspace list
    const cache2 = new InMemoryCache();
    const vfs2 = new VirtualFileSystem(cache2);
    const service2 = new ProjectKnowledgeService(vfs2, mockParser, resolver, repository, db);
    await service2.indexProject('test-project', tempDir, [fileA]);

    // File A should still exist, file B should be purged
    expect(await service2.getFileKnowledge(fileA)).not.toBeNull();
    expect(await service2.getFileKnowledge(fileB)).toBeNull();
  });

  it('should detect technology stack from package.json and workspace files', async () => {
    const pkgFile = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgFile, JSON.stringify({
      name: 'react-app',
      dependencies: { react: '^18.0.0', express: '^4.0.0' },
      devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' }
    }), 'utf8');

    const vitestConfig = path.join(tempDir, 'vitest.config.ts');
    fs.writeFileSync(vitestConfig, '', 'utf8');

    const sourceFile = path.join(tempDir, 'app.tsx');
    fs.writeFileSync(sourceFile, 'export function App() {}', 'utf8');

    await service.indexProject('test-project', tempDir, [pkgFile, vitestConfig, sourceFile]);

    const metadata = await service.getProjectMetadata('test-project');
    expect(metadata).not.toBeNull();
    expect(metadata!.techStack).toContain('TypeScript');
    expect(metadata!.techStack).toContain('React');
    expect(metadata!.techStack).toContain('Express');
    expect(metadata!.techStack).toContain('Node.js');
    expect(metadata!.testFramework).toBe('vitest');
  });

  it('should trigger full reindex when schema version mismatches', async () => {
    const sourceFile = path.join(tempDir, 'core.ts');
    fs.writeFileSync(sourceFile, `export class Core {}`, 'utf8');

    // First index at current schema version
    await service.indexProject('test-project', tempDir, [sourceFile]);
    expect(mockParser.parseCalls.length).toBe(1);
    mockParser.parseCalls = [];

    // Simulate schema version mismatch by directly updating the metadata record
    const rawDb = await db.getDb();
    await rawDb.run(
      'UPDATE project_metadata SET schema_version = ? WHERE project_id = ?',
      [999, 'test-project']
    );

    // Re-index — should detect mismatch, purge cache, and force full reindex
    const cache2 = new InMemoryCache();
    const vfs2 = new VirtualFileSystem(cache2);
    const service2 = new ProjectKnowledgeService(vfs2, mockParser, resolver, repository, db);
    await service2.indexProject('test-project', tempDir, [sourceFile]);

    // The parser should have been called again despite the file not changing
    expect(mockParser.parseCalls.length).toBe(1);

    // Verify the schema version is now correct
    const metadata = await service2.getProjectMetadata('test-project');
    expect(metadata!.schemaVersion).toBe(KNOWLEDGE_SCHEMA_VERSION);
  });

  it('should return null for unknown files in getFileKnowledge (graceful fallback)', async () => {
    const result = await service.getFileKnowledge('/nonexistent/file.ts');
    expect(result).toBeNull();
  });

  it('should return null for unknown projects in getProjectMetadata', async () => {
    const result = await service.getProjectMetadata('nonexistent-project');
    expect(result).toBeNull();
  });

  it('should only index source files and ignore non-source files', async () => {
    const tsFile = path.join(tempDir, 'index.ts');
    const jsonFile = path.join(tempDir, 'config.json');
    const mdFile = path.join(tempDir, 'README.md');
    fs.writeFileSync(tsFile, 'export function main() {}', 'utf8');
    fs.writeFileSync(jsonFile, '{}', 'utf8');
    fs.writeFileSync(mdFile, '# Readme', 'utf8');

    await service.indexProject('test-project', tempDir, [tsFile, jsonFile, mdFile]);

    // Only the .ts file should have been parsed
    expect(mockParser.parseCalls.length).toBe(1);

    // Only the .ts file should be in the database
    expect(await service.getFileKnowledge(tsFile)).not.toBeNull();
    expect(await service.getFileKnowledge(jsonFile)).toBeNull();
    expect(await service.getFileKnowledge(mdFile)).toBeNull();
  });
});
