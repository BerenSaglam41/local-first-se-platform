import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ClaudeCliDetectionResult {
  available: boolean;
  executablePath?: string;
  version?: string;
  error?: string;
}

export class ClaudeCliDetector {
  detect(customPath?: string): ClaudeCliDetectionResult {
    // 1. Check custom path or environment variable override
    const targetPath = customPath || process.env.CLAUDE_PATH || 'claude';

    try {
      const res = spawnSync(targetPath, ['--version'], { encoding: 'utf8', timeout: 5000 });
      if (res.status === 0 || (res.stdout && res.stdout.includes('claude'))) {
        const verOutput = (res.stdout || res.stderr || 'claude 1.0.0').trim();
        return {
          available: true,
          executablePath: targetPath,
          version: verOutput,
        };
      }
    } catch (err) {
      // Fall through to system PATH lookup
    }

    // 2. System PATH resolution
    const resolved = this.findInPath('claude');
    if (resolved) {
      try {
        const res = spawnSync(resolved, ['--version'], { encoding: 'utf8', timeout: 5000 });
        return {
          available: true,
          executablePath: resolved,
          version: (res.stdout || 'claude 1.0.0').trim(),
        };
      } catch (err: any) {
        return {
          available: false,
          error: `Executable found at ${resolved} but failed to execute: ${err.message}`,
        };
      }
    }

    return {
      available: false,
      error: `Claude Code CLI executable ('claude') not found in PATH or CLAUDE_PATH`,
    };
  }

  private findInPath(binaryName: string): string | null {
    const isWindows = process.platform === 'win32';
    const pathDelimiter = isWindows ? ';' : ':';
    const pathDirs = (process.env.PATH || '').split(pathDelimiter);
    const extensions = isWindows ? ['.exe', '.cmd', '.bat', ''] : [''];

    for (const dir of pathDirs) {
      for (const ext of extensions) {
        const fullPath = path.join(dir, binaryName + ext);
        try {
          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            return fullPath;
          }
        } catch (err) {
          // Ignore permission or access errors
        }
      }
    }
    return null;
  }
}
