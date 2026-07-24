import * as fs from 'fs';
import * as path from 'path';
import { IVirtualFileSystem, VfsFile } from '../../core/domain/interfaces/ivfs';
import { ICache } from '../../core/domain/interfaces/icache';
import { StorageException } from '../../core/domain/errors/exceptions';

export class VirtualFileSystem implements IVirtualFileSystem {
  constructor(private cache: ICache) {}

  normalizePath(filePath: string): string {
    const resolved = path.resolve(path.normalize(filePath));
    try {
      // Resolves symbolic links and ensures correct physical casing on case-insensitive filesystems
      return fs.realpathSync(resolved);
    } catch (err) {
      // Fallback to absolute normalized path if file does not exist yet (e.g. during creation)
      return resolved;
    }
  }

  async readFile(filePath: string): Promise<VfsFile> {
    const normPath = this.normalizePath(filePath);
    const cached = this.cache.get<VfsFile>(`file:${normPath}`);

    try {
      if (!fs.existsSync(normPath)) {
        return {
          path: normPath,
          content: '',
          language: this.detectLanguage(normPath),
          lastModifiedMs: 0,
        };
      }

      const stats = fs.statSync(normPath);
      const lastModifiedMs = stats.mtimeMs;

      if (cached && cached.lastModifiedMs === lastModifiedMs) {
        return cached;
      }

      const content = fs.readFileSync(normPath, 'utf8');
      const language = this.detectLanguage(normPath);
      
      const vfsFile: VfsFile = {
        path: normPath,
        content,
        language,
        lastModifiedMs,
      };

      this.cache.set(`file:${normPath}`, vfsFile);
      return vfsFile;
    } catch (error) {
      throw new StorageException(`Failed to read file at ${normPath}`, error);
    }
  }

  async hasFileChanged(filePath: string): Promise<boolean> {
    const normPath = this.normalizePath(filePath);
    const cached = this.cache.get<VfsFile>(`file:${normPath}`);
    if (!cached) return true;

    try {
      const stats = fs.statSync(normPath);
      return cached.lastModifiedMs !== stats.mtimeMs;
    } catch (err) {
      return true; // Treat as changed if file has been deleted
    }
  }

  invalidateCache(filePath: string): void {
    const normPath = this.normalizePath(filePath);
    this.cache.delete(`file:${normPath}`);
    this.cache.delete(`ast:${normPath}`);
    this.cache.delete(`deps:${normPath}`);
  }

  clearCache(): void {
    this.cache.clear();
  }

  listCachedFiles(): string[] {
    return [];
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
        return 'typescript';
      case '.tsx':
        return 'tsx';
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        return 'javascript';
      default:
        return 'unknown';
    }
  }
}
