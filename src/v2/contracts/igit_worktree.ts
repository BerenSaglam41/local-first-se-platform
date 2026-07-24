export interface WorktreeInfo {
  worktreeId: string;
  workerId: string;
  missionId: string;
  branchName: string;
  worktreePath: string;
  status: 'ACTIVE' | 'ATTACHED' | 'DETACHED' | 'ARCHIVED';
  createdAt: string;
}

export interface MergeMetadata {
  worktreeId: string;
  workerId: string;
  branchName: string;
  changedFiles: string[];
  changedSymbols: string[];
  commitCount: number;
  patchSummary: string;
}
