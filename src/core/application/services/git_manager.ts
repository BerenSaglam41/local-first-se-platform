import { IProcessRuntime } from '../../domain/interfaces/iprocess_runtime';
import * as fs from 'fs';
import * as path from 'path';

export interface GitStatusResult {
  isClean: boolean;
  modifiedFiles: string[];
}

export class GitManager {
  constructor(private runtime: IProcessRuntime) {}

  private async runGit(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    let stdout = '';
    let stderr = '';
    const handle = this.runtime.execute({
      executable: 'git',
      args,
    });
    handle.on('stdout', (chunk) => {
      stdout += chunk;
    });
    handle.on('stderr', (chunk) => {
      stderr += chunk;
    });
    const result = await handle.wait();
    return {
      exitCode: result.exitCode ?? -1,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  }

  async getRepositoryRoot(): Promise<string> {
    const res = await this.runGit(['rev-parse', '--show-toplevel']);
    if (res.exitCode === 0) {
      return res.stdout;
    }
    return process.cwd();
  }

  async getStatus(): Promise<GitStatusResult> {
    const res = await this.runGit(['status', '--porcelain']);
    if (res.exitCode !== 0) {
      return { isClean: true, modifiedFiles: [] };
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
    };
  }

  async generateDiff(files: string[]): Promise<string> {
    const root = await this.getRepositoryRoot();
    const relativePaths = files.map((f) => path.relative(root, f));
    const res = await this.runGit(['diff', '--', ...relativePaths]);
    return res.stdout;
  }

  async commit(files: string[], message: string): Promise<{ success: boolean; commitHash?: string; error?: string }> {
    const root = await this.getRepositoryRoot();
    const relativePaths = files.map((f) => path.relative(root, f));

    // Stage files
    const stageRes = await this.runGit(['add', '--', ...relativePaths]);
    if (stageRes.exitCode !== 0) {
      return { success: false, error: `Failed to stage files: stdout=${stageRes.stdout} stderr=${stageRes.stderr}` };
    }

    // Commit files
    const commitRes = await this.runGit(['commit', '-m', message]);
    if (commitRes.exitCode !== 0) {
      return { success: false, error: `Failed to commit: stdout=${commitRes.stdout} stderr=${commitRes.stderr}` };
    }

    // Get commit hash
    const hashRes = await this.runGit(['rev-parse', 'HEAD']);
    return {
      success: true,
      commitHash: hashRes.exitCode === 0 ? hashRes.stdout : undefined,
    };
  }

  async rollback(files: string[]): Promise<{ success: boolean; error?: string }> {
    const root = await this.getRepositoryRoot();
    const relativePaths = files.map((f) => path.relative(root, f));

    const errors: string[] = [];

    // Separate tracked and untracked files
    for (const f of files) {
      if (!fs.existsSync(f)) continue;

      // Check if file is untracked
      const relPath = path.relative(root, f);
      const checkRes = await this.runGit(['status', '--porcelain', '--', relPath]);
      
      if (checkRes.stdout.startsWith('??')) {
        // Untracked file: delete it
        try {
          fs.unlinkSync(f);
        } catch (e: any) {
          errors.push(`Failed to delete untracked file ${f}: ${e.message}`);
        }
      } else {
        // Tracked file: checkout previous state
        const checkoutRes = await this.runGit(['checkout', '--', relPath]);
        if (checkoutRes.exitCode !== 0) {
          errors.push(`Failed to checkout ${f}: ${checkoutRes.stderr}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }
}
