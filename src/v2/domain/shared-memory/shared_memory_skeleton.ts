import { ADRRecord, GitState, ISharedMemory, MemoryRecord, TaskBoardState } from '../../contracts/ishared_memory';

export class SharedMemorySkeleton implements ISharedMemory {
  private adrs = new Map<string, ADRRecord>();
  private memories: MemoryRecord[] = [];

  async readADR(adrId: string): Promise<ADRRecord | null> {
    return this.adrs.get(adrId) || null;
  }

  async writeADR(adr: ADRRecord): Promise<void> {
    this.adrs.set(adr.id, adr);
  }

  async getTaskBoard(): Promise<TaskBoardState> {
    return {
      backlog: [],
      inProgress: [],
      review: [],
      completed: [],
    };
  }

  async getGitStatus(): Promise<GitState> {
    return {
      currentBranch: 'master',
      cleanState: true,
      activeCheckpoints: {},
    };
  }

  async writeGitCheckpoint(subTaskId: string, message: string): Promise<string> {
    return `checkpoint-hash-${Date.now()}`;
  }

  async writeMemory(record: MemoryRecord): Promise<void> {
    this.memories = [record, ...this.memories.filter((existing) => existing.id !== record.id)];
  }

  async listMemory(scope: MemoryRecord['scope'], scopeId: string, limit = 12): Promise<MemoryRecord[]> {
    return this.memories.filter((record) => record.scope === scope && record.scopeId === scopeId).slice(0, limit);
  }
}
