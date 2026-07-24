export interface ContextSlice {
  taskId: string;
  targetFile: string;
  codeContent: string;
  importedSymbols: string[];
  tokenSize: number;
}

export interface IContextCompiler {
  compileContext(taskPrompt: string, targetFile: string, maxTokens: number): Promise<ContextSlice>;
  invalidateCache(filePath: string): void;
}
