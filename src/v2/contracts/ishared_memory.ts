export interface ADRRecord {
  id: string;
  title: string;
  author: string;
  status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';
  content: string;
  timestamp: string;
}

export interface TaskBoardState {
  backlog: string[];
  inProgress: string[];
  review: string[];
  completed: string[];
}

export interface GitState {
  currentBranch: string;
  cleanState: boolean;
  activeCheckpoints: Record<string, string>;
}

export interface MemoryRecord {
  id: string;
  scope: 'PROJECT' | 'WORKER' | 'MISSION';
  scopeId: string;
  author: string;
  kind: 'DECISION' | 'SUMMARY' | 'QUESTION' | 'ANSWER' | 'REVIEW' | 'FAILURE';
  content: string;
  timestamp: string;
}

export interface ISharedMemory {
  readADR(adrId: string): Promise<ADRRecord | null>;
  writeADR(adr: ADRRecord): Promise<void>;
  getTaskBoard(): Promise<TaskBoardState>;
  getGitStatus(): Promise<GitState>;
  writeGitCheckpoint(subTaskId: string, message: string): Promise<string>;
  writeMemory(record: MemoryRecord): Promise<void>;
  listMemory(scope: MemoryRecord['scope'], scopeId: string, limit?: number): Promise<MemoryRecord[]>;
}
