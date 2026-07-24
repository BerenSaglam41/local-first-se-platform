import * as fs from 'fs';
import { ContextPackage } from '../../contracts/icontext_package';

export interface CacheEntry {
  pkg: ContextPackage;
  mtime: number;
}

export class ContextCache {
  private cache = new Map<string, CacheEntry>();

  get(filePath: string): ContextPackage | null {
    if (!this.cache.has(filePath)) return null;

    const entry = this.cache.get(filePath)!;
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs > entry.mtime) {
        this.cache.delete(filePath);
        return null;
      }
    }
    return entry.pkg;
  }

  set(filePath: string, pkg: ContextPackage): void {
    const mtime = fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : Date.now();
    this.cache.set(filePath, { pkg, mtime });
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  clear(): void {
    this.cache.clear();
  }
}
