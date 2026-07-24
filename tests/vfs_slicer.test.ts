import * as fs from 'fs';
import * as path from 'path';
import { InMemoryCache } from '../src/infrastructure/cache/in_memory_cache';
import { VirtualFileSystem } from '../src/infrastructure/vfs/vfs';
import { CodeSliceEngine } from '../src/infrastructure/parser/code_slice_engine';
import { TypeScriptASTParser } from '../src/infrastructure/parser/ts_ast_parser';
import { DependencyResolver } from '../src/infrastructure/parser/dependency_resolver';
import { ContextBuilder } from '../src/infrastructure/parser/context_builder';
import { FileAst } from '../src/core/domain/models/ast';
import { ValidationException } from '../src/core/domain/errors/exceptions';

describe('VFS & AST Context Slicer', () => {
  let tempDir: string;
  let cache: InMemoryCache;
  let vfs: VirtualFileSystem;
  let sliceEngine: CodeSliceEngine;
  let astParser: TypeScriptASTParser;
  let resolver: DependencyResolver;
  let builder: ContextBuilder;

  beforeEach(() => {
    tempDir = path.join(__dirname, `temp_slicer_test_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cache = new InMemoryCache();
    vfs = new VirtualFileSystem(cache);
    sliceEngine = new CodeSliceEngine();
    astParser = new TypeScriptASTParser(sliceEngine);
    resolver = new DependencyResolver();
    builder = new ContextBuilder(vfs, astParser, resolver, cache);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should parse class declarations, nested functions, and attach comments correctly', async () => {
    const fileContent = `
      // This is a test class comment
      /* Block comment example */
      export class UserService {
        // Constructor helper
        constructor(private db: any) {}

        // Authenticate method
        async authenticateUser(username: string): Promise<boolean> {
          const helper = () => {
            return true;
          };
          return helper();
        }
      }
    `;

    const filePath = path.join(tempDir, 'user_service.ts');
    fs.writeFileSync(filePath, fileContent, 'utf8');

    const vfsFile = await vfs.readFile(filePath);
    expect(vfsFile.language).toBe('typescript');

    const symbols = astParser.parse(vfsFile.content, vfsFile.language);

    // Should find the UserService class
    const classSym = symbols.find((s) => s.name === 'UserService');
    expect(classSym).toBeDefined();
    expect(classSym!.type).toBe('class');
    expect(classSym!.attachedComment).toContain('This is a test class comment');

    // Should find nested function authenticateUser
    const funcSym = symbols.find((s) => s.name === 'authenticateUser');
    expect(funcSym).toBeDefined();
    expect(funcSym!.type).toBe('function');
    expect(funcSym!.attachedComment).toContain('Authenticate method');

    // Should find nested helper function (arrow function) inside authenticateUser
    const helperSym = symbols.find((s) => s.name === 'helper');
    expect(helperSym).toBeDefined();
    expect(helperSym!.type).toBe('function');
  });

  it('should resolve local and external dependencies, including imports/exports', async () => {
    // Write auth helper (external dependency)
    const helperContent = `
      // Helper to match passwords
      export function verifyPassword(pwd: string): boolean {
        return pwd === 'secret';
      }
    `;
    const helperPath = path.join(tempDir, 'helpers.ts');
    fs.writeFileSync(helperPath, helperContent, 'utf8');

    // Write main auth service
    const serviceContent = `
      import { verifyPassword } from './helpers';
      
      export interface AuthConfig {
        minLen: number;
      }

      export class AuthService {
        constructor(private config: AuthConfig) {}

        login(user: string, pass: string): boolean {
          const localCheck = () => {
            return user.length > this.config.minLen;
          };
          return localCheck() && verifyPassword(pass);
        }
      }
    `;
    const servicePath = path.join(tempDir, 'auth_service.ts');
    fs.writeFileSync(servicePath, serviceContent, 'utf8');

    // Parse both files to form the workspace pool
    const helperVfs = await vfs.readFile(helperPath);
    const helperAst: FileAst = {
      filePath: helperPath,
      symbols: astParser.parse(helperVfs.content, helperVfs.language),
    };

    const serviceVfs = await vfs.readFile(servicePath);
    const serviceAst: FileAst = {
      filePath: servicePath,
      symbols: astParser.parse(serviceVfs.content, serviceVfs.language),
    };

    const workspace = [helperAst, serviceAst];

    // Resolve dependencies of login function inside AuthService
    const loginDeps = resolver.resolveDependencies('login', serviceAst, workspace);

    // 1. Should resolve local dependency 'localCheck'
    const hasLocalCheck = loginDeps.localDependencies.some((s) => s.name === 'localCheck');
    expect(hasLocalCheck).toBe(true);

    // 2. Should resolve local dependency 'AuthConfig' (referenced in constructor config type)
    const hasConfigType = loginDeps.localDependencies.some((s) => s.name === 'AuthConfig');
    expect(hasConfigType).toBe(true);

    // 3. Should resolve external dependency 'verifyPassword' in helpers.ts
    const hasVerifyPassword = loginDeps.externalDependencies.some(
      (d) => d.symbolName === 'verifyPassword' && d.filePath === helperPath
    );
    expect(hasVerifyPassword).toBe(true);
  });

  it('should compile the minimal code context using the Context Builder and reuse cache', async () => {
    const fileContent = `
      export interface User {
        id: string;
      }
      export function getUser(): User {
        return { id: 'u1' };
      }
    `;
    const filePath = path.join(tempDir, 'user.ts');
    fs.writeFileSync(filePath, fileContent, 'utf8');

    const workspace = [filePath];

    // Build context for getUser
    const result = await builder.buildContext('Extract the getUser function', filePath, workspace);

    expect(result.codeContent).toContain('export function getUser()');
    expect(result.codeContent).toContain('export interface User');
    expect(result.extractedSymbols.some((s) => s.symbolName === 'getUser')).toBe(true);
    expect(result.extractedSymbols.some((s) => s.symbolName === 'User')).toBe(true);

    // Token estimation check
    expect(result.tokenEstimate).toBeGreaterThan(0);

    // Verify cache hit (cache.get should return the AST)
    const cached = cache.get<FileAst>(`ast:${vfs.normalizePath(filePath)}`);
    expect(cached).not.toBeNull();
    expect(cached!.symbols.length).toBeGreaterThan(0);

    // Invalidate and verify cache deletion
    vfs.invalidateCache(filePath);
    const deleted = cache.get<FileAst>(`ast:${vfs.normalizePath(filePath)}`);
    expect(deleted).toBeNull();
  });

  it('should handle circular imports gracefully without infinite loops', async () => {
    // File A imports B, B imports A
    const fileAContent = `
      import { funcB } from './fileB';
      export function funcA(): string {
        return funcB() + ' A';
      }
    `;
    const fileBContent = `
      import { funcA } from './fileA';
      export function funcB(): string {
        return 'B';
      }
    `;
    const fileAPath = path.join(tempDir, 'fileA.ts');
    const fileBPath = path.join(tempDir, 'fileB.ts');
    fs.writeFileSync(fileAPath, fileAContent, 'utf8');
    fs.writeFileSync(fileBPath, fileBContent, 'utf8');

    const vfsA = await vfs.readFile(fileAPath);
    const astA = { filePath: fileAPath, symbols: astParser.parse(vfsA.content, vfsA.language) };

    const vfsB = await vfs.readFile(fileBPath);
    const astB = { filePath: fileBPath, symbols: astParser.parse(vfsB.content, vfsB.language) };

    const workspace = [astA, astB];

    // Resolve dependencies of funcA - should not result in infinite loop
    const deps = resolver.resolveDependencies('funcA', astA, workspace);
    expect(deps.externalDependencies.length).toBeGreaterThan(0);
    expect(deps.externalDependencies.some((d) => d.symbolName === 'funcB' && d.filePath === fileBPath)).toBe(true);
  });

  it('should throw ValidationException on malformed syntax containing ERROR nodes', async () => {
    const fileContent = `
      export class BadCode {
        const error = ; // Syntax error
      }
    `;
    const filePath = path.join(tempDir, 'bad_code.ts');
    fs.writeFileSync(filePath, fileContent, 'utf8');

    await expect(async () => {
      const vfsFile = await vfs.readFile(filePath);
      astParser.parse(vfsFile.content, vfsFile.language);
    }).rejects.toThrow(ValidationException);
  });

  it('should de-duplicate overloaded methods by preferring the one with the body', async () => {
    const fileContent = `
      export class Calc {
        add(a: number, b: number): number;
        add(a: string, b: string): string;
        add(a: any, b: any): any {
          return a + b;
        }
      }
    `;
    const filePath = path.join(tempDir, 'calc.ts');
    fs.writeFileSync(filePath, fileContent, 'utf8');

    const vfsFile = await vfs.readFile(filePath);
    const symbols = astParser.parse(vfsFile.content, vfsFile.language);

    const addSyms = symbols.filter((s) => s.name === 'add');
    expect(addSyms.length).toBe(1); // De-duplicated to 1
    expect(addSyms[0].content).toContain('return a + b'); // Implementation body is preferred
  });

  it('should eliminate nested member duplicates in Context Builder output', async () => {
    const fileContent = `
      export class SimpleClass {
        helper(): void {
          console.log('nested helper');
        }
      }
    `;
    const filePath = path.join(tempDir, 'nested_dup.ts');
    fs.writeFileSync(filePath, fileContent, 'utf8');

    const result = await builder.buildContext('Extract the SimpleClass', filePath, [filePath]);

    // Should contain class declaration
    expect(result.codeContent).toContain('export class SimpleClass');
    
    // Should NOT print helper twice (since it is already inside SimpleClass body)
    const occurrences = (result.codeContent.match(/helper\(\)/g) || []).length;
    expect(occurrences).toBe(1);
  });
});
