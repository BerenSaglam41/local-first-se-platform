export interface QualityGatesConfig {
  enableBuild: boolean;
  enableTests: boolean;
  enableLint: boolean;
  enableTypeCheck: boolean;
  minCoveragePercent: number;
}

export interface VerificationReport {
  taskId: string;
  worktreeId: string;
  workerId: string;
  passed: boolean;
  buildPassed: boolean;
  testsPassed: boolean;
  lintPassed: boolean;
  typeCheckPassed: boolean;
  coveragePercent: number;
  qualityScore: number; // 0-100
  warnings: string[];
  errors: string[];
  durationMs: number;
  timestamp: string;
}

export interface MergeConflictDetail {
  type: 'AST_CONFLICT' | 'GIT_CONFLICT' | 'SYMBOL_CONFLICT' | 'DELETED_SYMBOL';
  file: string;
  description: string;
}

export interface MergePlan {
  taskId: string;
  worktreeId: string;
  sourceBranch: string;
  targetBranch: string;
  hasConflicts: boolean;
  canMerge: boolean;
  conflicts: MergeConflictDetail[];
  patchSummary: string;
}

export interface MergeCandidate {
  id: string;
  taskId: string;
  worktreeId: string;
  priority: number;
  enqueuedAt: string;
  status: 'QUEUED' | 'INSPECTING' | 'READY' | 'REJECTED';
}
