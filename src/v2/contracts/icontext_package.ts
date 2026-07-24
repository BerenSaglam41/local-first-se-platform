import { ADRRecord } from './ishared_memory';

export interface ContextSymbol {
  name: string;
  kind: 'FUNCTION' | 'CLASS' | 'INTERFACE' | 'ENUM' | 'IMPORT' | 'EXPORT';
  filePath: string;
  lineRange?: { start: number; end: number };
}

export interface ContextFile {
  filePath: string;
  content: string;
  tokenSize: number;
}

export interface ContextPackage {
  taskId: string;
  targetFile: string;
  relevantFiles: ContextFile[];
  relevantSymbols: ContextSymbol[];
  relatedADRs: ADRRecord[];
  relatedGitCommits: { hash: string; message: string }[];
  dependencyGraph: string[];
  totalTokenSize: number;
}

export interface WorkspaceInfo {
  workspaceId: string;
  taskId: string;
  isolatedPath: string;
  createdAt: string;
}
