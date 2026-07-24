import { IContextBuilder, ContextBuildResult } from '../../core/domain/interfaces/icontext_builder';
import { IVirtualFileSystem } from '../../core/domain/interfaces/ivfs';
import { IASTParser } from '../../core/domain/interfaces/iast_parser';
import { IDependencyResolver } from '../../core/domain/interfaces/idependency_resolver';
import { FileAst, CodeSymbol } from '../../core/domain/models/ast';
import { ICache } from '../../core/domain/interfaces/icache';
import { ProjectKnowledgeService } from '../../core/application/services/project_knowledge_service';

export class ContextBuilder implements IContextBuilder {
  constructor(
    private vfs: IVirtualFileSystem,
    private parser: IASTParser,
    private resolver: IDependencyResolver,
    private cache: ICache,
    private projectKnowledgeService?: ProjectKnowledgeService
  ) {}

  async buildContext(
    taskDescription: string,
    entryFile: string,
    workspaceFiles: string[]
  ): Promise<ContextBuildResult> {
    const allFileAsts: FileAst[] = [];
    const normEntryPath = this.vfs.normalizePath(entryFile);

    // 1. Parse workspace files using cache check
    for (const file of workspaceFiles) {
      const normPath = this.vfs.normalizePath(file);
      const cachedAst = this.cache.get<FileAst>(`ast:${normPath}`);
      const changed = await this.vfs.hasFileChanged(normPath);

      if (cachedAst && !changed) {
        allFileAsts.push(cachedAst);
        continue;
      }

      let fileAst: FileAst | null = null;

      if (this.projectKnowledgeService) {
        try {
          const knowledge = await this.projectKnowledgeService.getFileKnowledge(normPath);
          if (knowledge) {
            fileAst = {
              filePath: normPath,
              symbols: knowledge.symbols
            };
          }
        } catch (e: any) {
          console.warn(`[WARN] ContextBuilder: Knowledge cache lookup failed for ${normPath}, falling back to dynamic parsing: ${e.message}`);
        }
      }

      if (!fileAst) {
        const vfsFile = await this.vfs.readFile(normPath);
        if (this.parser.supportsLanguage(vfsFile.language)) {
          const symbols = this.parser.parse(vfsFile.content, vfsFile.language);
          fileAst = { filePath: normPath, symbols };
        } else {
          fileAst = { filePath: normPath, symbols: [] };
        }
      }

      this.cache.set(`ast:${normPath}`, fileAst);
      allFileAsts.push(fileAst);
    }

    const entryAst = allFileAsts.find((f) => f.filePath === normEntryPath);
    if (!entryAst) {
      return { codeContent: '', extractedSymbols: [], tokenEstimate: 0 };
    }

    // 2. Resolve targeted symbol name from task description using word boundaries
    let targetSymbol = entryAst.symbols.find((s) => {
      const regex = new RegExp(`\\b${s.name}\\b`);
      return regex.test(taskDescription);
    });
    if (!targetSymbol) {
      targetSymbol = entryAst.symbols.find((s) => s.type !== 'import' && s.type !== 'export' && s.name !== 'anonymous');
    }

    if (!targetSymbol) {
      return { codeContent: '', extractedSymbols: [], tokenEstimate: 0 };
    }

    // 3. Resolve transitive dependencies
    const deps = this.resolver.resolveDependencies(targetSymbol.name, entryAst, allFileAsts);

    // Helper to identify if a symbol is nested within any of the other included symbols
    const isNestedWithinAny = (symbol: CodeSymbol, includedSymbols: CodeSymbol[]): boolean => {
      return includedSymbols.some((parent) => {
        if (parent.name === symbol.name && parent.type === symbol.type) return false;
        return symbol.startLine >= parent.startLine && symbol.endLine <= parent.endLine;
      });
    };

    // 4. Compile sliced context blocks (eliminating nested class/interface duplicates)
    const compiledParts: string[] = [];
    const extracted: { filePath: string; symbolName: string; type: string }[] = [];

    // Filter entry symbols: if parent is included, do not emit the child separately
    const entrySymbolsToPrint = [targetSymbol, ...deps.localDependencies];
    const filteredEntrySymbols = entrySymbolsToPrint.filter((s) => !isNestedWithinAny(s, entrySymbolsToPrint));

    compiledParts.push(`// FILE: ${entryFile}`);
    for (const sym of filteredEntrySymbols) {
      if (sym.attachedComment) {
        compiledParts.push(sym.attachedComment);
      }
      compiledParts.push(sym.content);
      compiledParts.push('');
      extracted.push({ filePath: entryFile, symbolName: sym.name, type: sym.type });
    }

    // Group and filter external dependencies by file path
    const externalByFile = new Map<string, CodeSymbol[]>();
    for (const ext of deps.externalDependencies) {
      const fileAst = allFileAsts.find((f) => f.filePath === ext.filePath);
      if (!fileAst) continue;

      const extSymbol = fileAst.symbols.find((s) => s.name === ext.symbolName);
      if (!extSymbol) continue;

      const list = externalByFile.get(ext.filePath) || [];
      if (!list.some((s) => s.name === extSymbol.name)) {
        list.push(extSymbol);
      }
      externalByFile.set(ext.filePath, list);
    }

    for (const [filePath, symbolsList] of externalByFile.entries()) {
      const filteredExtSymbols = symbolsList.filter((s) => !isNestedWithinAny(s, symbolsList));
      if (filteredExtSymbols.length === 0) continue;

      compiledParts.push(`// FILE: ${filePath} (External Dependency)`);
      for (const sym of filteredExtSymbols) {
        if (sym.attachedComment) {
          compiledParts.push(sym.attachedComment);
        }
        compiledParts.push(sym.content);
        compiledParts.push('');
        extracted.push({ filePath, symbolName: sym.name, type: sym.type });
      }
    }

    const codeContent = compiledParts.join('\n').trim();
    const tokenEstimate = Math.ceil(codeContent.length / 4);

    return {
      codeContent,
      extractedSymbols: extracted,
      tokenEstimate,
    };
  }
}
