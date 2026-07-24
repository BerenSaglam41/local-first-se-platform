import * as crypto from 'crypto';
import * as path from 'path';
import { IStorage } from '../../domain/interfaces/istorage';
import { IVirtualFileSystem } from '../../domain/interfaces/ivfs';
import { IASTParser } from '../../domain/interfaces/iast_parser';
import { IDependencyResolver } from '../../domain/interfaces/idependency_resolver';
import { CodeSymbol } from '../../domain/models/ast';
import { standardDetectors, ITechnologyDetector } from './tech_detectors';
import { SqliteDb } from '../../../infrastructure/storage/sqlite_db';

export const KNOWLEDGE_SCHEMA_VERSION = 1;

export interface ProjectMetadata {
  projectId: string;
  schemaVersion: number;
  language: string;
  packageManager: string | null;
  buildSystem: string | null;
  testFramework: string | null;
  techStack: string[];
  lastIndexedAt: string;
}

export interface FileKnowledge {
  path: string;
  projectId: string;
  hash: string;
  imports: string[];
  exports: string[];
  symbols: CodeSymbol[];
  lastUpdatedAt: string;
}

export class ProjectKnowledgeService {
  private detectors: ITechnologyDetector[] = standardDetectors;

  constructor(
    private vfs: IVirtualFileSystem,
    private astParser: IASTParser,
    private resolver: IDependencyResolver,
    private storage: IStorage,
    private sqliteDb: SqliteDb
  ) {}

  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private isSourceFile(filePath: string): boolean {
    const ext = path.extname(filePath);
    return ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
  }

  async indexProject(projectId: string, rootPath: string, workspaceFiles: string[]): Promise<void> {
    const db = await this.sqliteDb.getDb();

    // 1. Detect environment and technology stack (Read-only VFS reads)
    let packageJson: any = null;
    const packageJsonPath = workspaceFiles.find((f) => f.endsWith('package.json'));
    if (packageJsonPath) {
      try {
        const fileContent = await this.vfs.readFile(packageJsonPath);
        packageJson = JSON.parse(fileContent.content);
      } catch (e: any) {
        console.warn(`[WARN] ProjectKnowledgeService: Failed to read package.json: ${e.message}`);
      }
    }

    // Technology Stack Detection
    const techStack: string[] = [];
    for (const detector of this.detectors) {
      if (detector.detect(packageJson, workspaceFiles)) {
        techStack.push(detector.name);
      }
    }

    // Package Manager
    let packageManager: string | null = null;
    if (workspaceFiles.some((f) => f.endsWith('yarn.lock'))) {
      packageManager = 'yarn';
    } else if (workspaceFiles.some((f) => f.endsWith('pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    } else if (packageJsonPath || workspaceFiles.some((f) => f.endsWith('package-lock.json'))) {
      packageManager = 'npm';
    }

    // Build System
    let buildSystem: string | null = null;
    if (workspaceFiles.some((f) => f.endsWith('tsconfig.json'))) {
      buildSystem = 'tsc';
    } else if (workspaceFiles.some((f) => f.endsWith('vite.config.ts') || f.endsWith('vite.config.js'))) {
      buildSystem = 'vite';
    } else if (workspaceFiles.some((f) => f.endsWith('webpack.config.js'))) {
      buildSystem = 'webpack';
    }

    // Test Framework
    let testFramework: string | null = null;
    if (workspaceFiles.some((f) => f.endsWith('jest.config.js') || f.endsWith('jest.config.ts') || f.endsWith('jest.config.json'))) {
      testFramework = 'jest';
    } else if (workspaceFiles.some((f) => f.endsWith('vitest.config.ts') || f.endsWith('vitest.config.js'))) {
      testFramework = 'vitest';
    } else if (packageJson) {
      const allDeps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
      if (allDeps.jest) testFramework = 'jest';
      else if (allDeps.vitest) testFramework = 'vitest';
    }

    // Primary language
    const language = techStack.includes('TypeScript') ? 'typescript' : 'javascript';

    // 2. Perform transactional database index and schema version invalidation
    await this.storage.runInTransaction(async () => {
      // Ensure parent project record exists in projects table to satisfy foreign key constraint
      const now = new Date().toISOString();
      await db.run(
        `INSERT OR IGNORE INTO projects (id, name, root_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, path.basename(rootPath), rootPath, now, now]
      );

      // Schema version verification — mismatch triggers a full reindex
      let forceReindex = false;
      const metaRow = await db.get(
        'SELECT schema_version FROM project_metadata WHERE project_id = ?',
        [projectId]
      );

      if (metaRow && metaRow.schema_version !== KNOWLEDGE_SCHEMA_VERSION) {
        // Schema mismatch: purge all cached file data so every file is re-parsed below
        console.warn(`[WARN] ProjectKnowledgeService: Schema version mismatch (cached=${metaRow.schema_version}, current=${KNOWLEDGE_SCHEMA_VERSION}). Triggering full reindex.`);
        await db.run('DELETE FROM project_files WHERE project_id = ?', [projectId]);
        await db.run('DELETE FROM project_metadata WHERE project_id = ?', [projectId]);
        forceReindex = true;
      }

      // Upsert project metadata
      await db.run(
        `INSERT OR REPLACE INTO project_metadata (
          project_id, schema_version, language, package_manager, build_system, test_framework, tech_stack, last_indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          KNOWLEDGE_SCHEMA_VERSION,
          language,
          packageManager,
          buildSystem,
          testFramework,
          JSON.stringify(techStack),
          new Date().toISOString()
        ]
      );

      // Load currently stored file caches (empty after schema invalidation, ensuring full reindex)
      const dbFiles = await db.all(
        'SELECT path, hash FROM project_files WHERE project_id = ?',
        [projectId]
      );
      const cacheMap = new Map<string, string>();
      for (const row of dbFiles) {
        cacheMap.set(row.path, row.hash);
      }

      const activeFiles = new Set<string>();

      // Index and parse files incrementally (or fully if forceReindex is true)
      for (const file of workspaceFiles) {
        if (!this.isSourceFile(file)) continue;

        const normPath = this.vfs.normalizePath(file);
        activeFiles.add(normPath);

        let content = '';
        try {
          const vfsFile = await this.vfs.readFile(normPath);
          content = vfsFile.content;
        } catch (e: any) {
          console.warn(`[WARN] ProjectKnowledgeService: Failed to read file ${normPath}: ${e.message}`);
          continue;
        }

        const fileHash = this.calculateHash(content);
        const cachedHash = cacheMap.get(normPath);

        if (!forceReindex && cachedHash === fileHash) {
          // File has not changed and no forced reindex: skip AST parsing
          continue;
        }

        // Parse modified/new file (Read-only AST Extract)
        let symbols: CodeSymbol[] = [];
        try {
          const lang = normPath.endsWith('.ts') || normPath.endsWith('.tsx') ? 'typescript' : 'javascript';
          symbols = this.astParser.parse(content, lang);
        } catch (e: any) {
          console.warn(`[WARN] ProjectKnowledgeService: AST parsing failed for ${normPath}: ${e.message}`);
          continue;
        }

        const imports = symbols.filter((s) => s.type === 'import').map((s) => s.name);
        const exports = symbols.filter((s) => s.type === 'export' || s.content.includes('export ')).map((s) => s.name);

        await db.run(
          `INSERT OR REPLACE INTO project_files (
            path, project_id, hash, imports, exports, dependencies, last_updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            normPath,
            projectId,
            fileHash,
            JSON.stringify(imports),
            JSON.stringify(exports),
            JSON.stringify(symbols),
            new Date().toISOString()
          ]
        );
      }

      // Purge deleted/stale entries
      for (const cachedPath of cacheMap.keys()) {
        if (!activeFiles.has(cachedPath)) {
          await db.run('DELETE FROM project_files WHERE path = ?', [cachedPath]);
        }
      }
    });
  }

  async getProjectMetadata(projectId: string): Promise<ProjectMetadata | null> {
    try {
      const db = await this.sqliteDb.getDb();
      const row = await db.get(
        'SELECT * FROM project_metadata WHERE project_id = ?',
        [projectId]
      );
      if (!row) return null;

      return {
        projectId: row.project_id,
        schemaVersion: row.schema_version,
        language: row.language,
        packageManager: row.package_manager,
        buildSystem: row.build_system,
        testFramework: row.test_framework,
        techStack: JSON.parse(row.tech_stack),
        lastIndexedAt: row.last_indexed_at
      };
    } catch (e: any) {
      console.warn(`[WARN] ProjectKnowledgeService: Failed to retrieve project metadata: ${e.message}`);
      return null;
    }
  }

  async getFileKnowledge(filePath: string): Promise<FileKnowledge | null> {
    try {
      const db = await this.sqliteDb.getDb();
      const normPath = this.vfs.normalizePath(filePath);
      const row = await db.get(
        'SELECT * FROM project_files WHERE path = ?',
        [normPath]
      );
      if (!row) return null;

      let symbolsList: CodeSymbol[] = [];
      try {
        symbolsList = JSON.parse(row.dependencies); // Symbols stored in dependencies column as serialized JSON
      } catch (parseErr: any) {
        console.warn(`[WARN] ProjectKnowledgeService: Failed to parse cached symbols for ${normPath}: ${parseErr.message}`);
      }

      return {
        path: row.path,
        projectId: row.project_id,
        hash: row.hash,
        imports: JSON.parse(row.imports),
        exports: JSON.parse(row.exports),
        symbols: symbolsList,
        lastUpdatedAt: row.last_updated_at
      };
    } catch (e: any) {
      console.warn(`[WARN] ProjectKnowledgeService: Failed to retrieve file knowledge for ${filePath}: ${e.message}`);
      return null;
    }
  }
}
