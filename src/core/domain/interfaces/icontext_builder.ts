export interface ContextBuildResult {
  codeContent: string; // The compiled minimum code block for LLM prompt
  extractedSymbols: { filePath: string; symbolName: string; type: string }[];
  tokenEstimate: number;
}

export interface IContextBuilder {
  buildContext(
    taskDescription: string,
    entryFile: string,
    workspaceFiles: string[]
  ): Promise<ContextBuildResult>;
}
