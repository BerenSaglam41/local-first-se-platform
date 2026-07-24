import { ADRRecord, GitState, ISharedMemory, TaskBoardState } from '../../contracts/ishared_memory';

export class SharedMemorySkeleton implements ISharedMemory {
  private adrs = new Map<string, ADRRecord>();

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
}
