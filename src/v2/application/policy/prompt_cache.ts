import { EventEmitter } from 'events';
import { CacheInvalidationReason } from '../../contracts/iexecution_policy';

export interface PromptCacheEntry {
  response: string;
  timestamp: number;
  promptHash: string;
  tags: string[];
}

export class PromptCache extends EventEmitter {
  private cache = new Map<string, PromptCacheEntry>();

  get(promptHash: string): string | null {
    const entry = this.cache.get(promptHash);
    if (!entry) {
      this.emit('PromptCacheMiss', { promptHash });
      return null;
    }
    this.emit('PromptCacheHit', { promptHash, age: Date.now() - entry.timestamp });
    return entry.response;
  }

  set(promptHash: string, response: string, tags: string[] = []): void {
    this.cache.set(promptHash, { response, timestamp: Date.now(), promptHash, tags });
  }

  invalidate(reason?: CacheInvalidationReason): void {
    const sizeBefore = this.cache.size;
    this.cache.clear();
    this.emit('ContextOptimized', { reason: reason ?? 'MANUAL', entriesRemoved: sizeBefore });
  }

  invalidateByTag(tag: string, reason: CacheInvalidationReason): number {
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.emit('ContextOptimized', { reason, tag, entriesRemoved: removed });
    }
    return removed;
  }

  size(): number {
    return this.cache.size;
  }
}
