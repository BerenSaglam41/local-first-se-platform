import { ICache } from '../../core/domain/interfaces/icache';

export class InMemoryCache implements ICache {
  private storeMap = new Map<string, any>();

  get<T>(key: string): T | null {
    if (!this.storeMap.has(key)) return null;
    return this.storeMap.get(key) as T;
  }

  set<T>(key: string, value: T): void {
    this.storeMap.set(key, value);
  }

  delete(key: string): void {
    this.storeMap.delete(key);
  }

  clear(): void {
    this.storeMap.clear();
  }
}
