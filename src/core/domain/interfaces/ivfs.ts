export interface VfsFile {
  path: string;
  content: string;
  language: string; // e.g. 'typescript', 'javascript', 'unknown'
  lastModifiedMs: number;
}

export interface IVirtualFileSystem {
  readFile(filePath: string): Promise<VfsFile>;
  normalizePath(filePath: string): string;
  hasFileChanged(filePath: string): Promise<boolean>;
  invalidateCache(filePath: string): void;
  clearCache(): void;
  listCachedFiles(): string[];
}
