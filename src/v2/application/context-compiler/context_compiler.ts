import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ContextPackage, ContextFile, ContextSymbol } from '../../contracts/icontext_package';
import { AstSymbolAnalyzer } from './ast_symbol_analyzer';
import { ContextCache } from './context_cache';
import { ISharedMemory } from '../../contracts/ishared_memory';
import { IEventStore } from '../../contracts/ievent_store';

export class ContextCompiler extends EventEmitter {
  private astAnalyzer = new AstSymbolAnalyzer();
  private cache = new ContextCache();

  constructor(
    private sharedMemory?: ISharedMemory,
    private eventStore?: IEventStore
  ) {
    super();
  }

  async compileContext(
    taskId: string,
    targetFile: string,
    maxTokenBudget: number = 4000
  ): Promise<ContextPackage> {
    this.emitEvent('ContextCompilationStarted', taskId, { targetFile, maxTokenBudget });

    const cached = this.cache.get(targetFile);
    if (cached) {
      this.emitEvent('ContextCompilationCompleted', taskId, { fromCache: true, totalTokenSize: cached.totalTokenSize });
      return cached;
    }

    try {
      const relevantFiles: ContextFile[] = [];
      const relevantSymbols: ContextSymbol[] = [];
      let totalTokenSize = 0;

      if (fs.existsSync(targetFile)) {
        const content = fs.readFileSync(targetFile, 'utf8');
        const tokenSize = Math.ceil(content.length / 4);
        relevantFiles.push({ filePath: targetFile, content, tokenSize });
        totalTokenSize += tokenSize;

        const symbols = this.astAnalyzer.analyzeSource(targetFile, content);
        relevantSymbols.push(...symbols);
      } else {
        const placeholderContent = `// Context placeholder for ${targetFile}`;
        relevantFiles.push({ filePath: targetFile, content: placeholderContent, tokenSize: 10 });
        totalTokenSize += 10;
      }

      let relatedADRs: any[] = [];
      let relatedGitCommits: any[] = [];

      if (this.sharedMemory) {
        const adr = await this.sharedMemory.readADR('ADR-001');
        if (adr) relatedADRs.push(adr);

        const gitStatus = await this.sharedMemory.getGitStatus();
        relatedGitCommits = Object.entries(gitStatus.activeCheckpoints).map(([subtaskId, hash]) => ({
          hash,
          message: `Checkpoint for subtask ${subtaskId}`,
        }));
      }

      // Deduplicate and enforce token budget
      if (totalTokenSize > maxTokenBudget && relevantFiles.length > 0) {
        relevantFiles[0].content = relevantFiles[0].content.substring(0, maxTokenBudget * 3);
        relevantFiles[0].tokenSize = Math.ceil(relevantFiles[0].content.length / 4);
        totalTokenSize = relevantFiles[0].tokenSize;
      }

      const pkg: ContextPackage = {
        taskId,
        targetFile,
        relevantFiles,
        relevantSymbols,
        relatedADRs,
        relatedGitCommits,
        dependencyGraph: relevantSymbols.filter((s) => s.kind === 'IMPORT').map((s) => s.name),
        totalTokenSize,
      };

      this.cache.set(targetFile, pkg);
      this.emitEvent('ContextCompilationCompleted', taskId, { fromCache: false, totalTokenSize });
      return pkg;
    } catch (err: any) {
      this.emitEvent('ContextCompilationFailed', taskId, { error: err.message });
      throw err;
    }
  }

  getCache(): ContextCache {
    return this.cache;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'ContextCompiler',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
