import { IProcessRuntime } from '../../domain/interfaces/iprocess_runtime';
import * as fs from 'fs';
import * as path from 'path';

export interface GitStatusResult {
  isClean: boolean;
  modifiedFiles: string[];
  lastCommitHash?: string;
}

export class GitManager {
  constructor(private runtime: IProcessRuntime, private workingDir?: string) {}

  private async runGit(args: string[], overrideCwd?: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    let stdout = '';
    let stderr = '';
    const handle = this.runtime.execute({
      executable: 'git',
      args,
      cwd: overrideCwd || this.workingDir,
    });
    if (!handle || typeof handle.on !== 'function') {
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    handle.on('stdout', (chunk) => {
      stdout += chunk;
    });

    handle.on('stderr', (chunk) => {
      stderr += chunk;
    });
    const result = await handle.wait();
    return {
      exitCode: result?.exitCode ?? -1,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  }

  async getRepositoryRoot(cwd?: string): Promise<string> {
    const res = await this.runGit(['rev-parse', '--show-toplevel'], cwd);
    if (res.exitCode === 0) {
      return res.stdout;
    }
    return cwd || this.workingDir || process.cwd();
  }

  async getStatus(cwd?: string): Promise<GitStatusResult> {
    const res = await this.runGit(['status', '--porcelain'], cwd);
    const hashRes = await this.runGit(['rev-parse', '--short', 'HEAD'], cwd);
    if (res.exitCode !== 0) {
      return { isClean: true, modifiedFiles: [], lastCommitHash: hashRes.exitCode === 0 ? hashRes.stdout : undefined };
    }
    const lines = res.stdout.split('\n').filter(Boolean);
    const modifiedFiles = lines.map((line) => {
      const trimmed = line.trim();
      const firstSpace = trimmed.indexOf(' ');
      if (firstSpace !== -1) {
        return trimmed.slice(firstSpace).trim();
      }
      return trimmed;
    });
    return {
      isClean: lines.length === 0,
      modifiedFiles,
      lastCommitHash: hashRes.exitCode === 0 ? hashRes.stdout : undefined,
    };
  }

  async generateDiff(files: string[], cwd?: string): Promise<string> {
    const root = await this.getRepositoryRoot(cwd);
    const relativePaths = files.map((f) => path.relative(root, f));
    const res = await this.runGit(['diff', '--', ...relativePaths], cwd);
    return res.stdout;
  }

  async commit(files: string[], message: string, cwd?: string): Promise<{ success: boolean; commitHash?: string; error?: string }> {
    const targetCwd = cwd || this.workingDir || process.cwd();
    // Stage all changes or specific files in target directory
    const stageRes = await this.runGit(['add', '-A'], targetCwd);
    if (stageRes.exitCode !== 0) {
      return { success: false, error: `Failed to stage files: stdout=${stageRes.stdout} stderr=${stageRes.stderr}` };
    }

    // Commit files
    const commitRes = await this.runGit(['commit', '-m', message, '--allow-empty'], targetCwd);
    if (commitRes.exitCode !== 0) {
      return { success: false, error: `Failed to commit: stdout=${commitRes.stdout} stderr=${commitRes.stderr}` };
    }

    // Get commit hash
    const hashRes = await this.runGit(['rev-parse', 'HEAD'], targetCwd);
    return {
      success: true,
      commitHash: hashRes.exitCode === 0 ? hashRes.stdout : undefined,
    };
  }

  async rollback(files: string[], cwd?: string): Promise<{ success: boolean; error?: string }> {
    const targetCwd = cwd || this.workingDir || process.cwd();
    const resetRes = await this.runGit(['reset', '--hard', 'HEAD'], targetCwd);
    const cleanRes = await this.runGit(['clean', '-fd'], targetCwd);
    return {
      success: resetRes.exitCode === 0 && cleanRes.exitCode === 0,
      error: resetRes.exitCode !== 0 || cleanRes.exitCode !== 0 ? `${resetRes.stderr} ${cleanRes.stderr}` : undefined,
    };
  }

  async createCheckpoint(checkpointId: string, files: string[], cwd?: string): Promise<string> {
    const targetCwd = cwd || this.workingDir || process.cwd();
    await this.commit(files, `feat(se-os): task-checkpoint-${checkpointId}`, targetCwd);
    return checkpointId;
  }

  async rollbackToCheckpoint(checkpointId: string, cwd?: string): Promise<{ success: boolean; error?: string }> {
    const targetCwd = cwd || this.workingDir || process.cwd();
    const resetRes = await this.runGit(['reset', '--hard', 'HEAD'], targetCwd);
    const cleanRes = await this.runGit(['clean', '-fd'], targetCwd);
    if (resetRes.exitCode === 0 && cleanRes.exitCode === 0) {
      return { success: true };
    }
    return {
      success: false,
      error: `Failed to rollback checkpoint ${checkpointId}: ${resetRes.stderr || cleanRes.stderr}`,
    };
  }
}
