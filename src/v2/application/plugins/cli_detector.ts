import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CliDetectionResult {
  available: boolean;
  executablePath?: string;
  version?: string;
  error?: string;
}

/**
 * Real, provider-agnostic CLI executable detector: resolves a custom path / env var override,
 * falls back to scanning $PATH, and confirms the binary actually runs via --version. Shared by
 * every CLI-backed runtime plugin so "is this provider installed" is answered the same honest
 * way everywhere instead of each plugin re-implementing (or faking) it.
 */
export class CliDetector {
  constructor(
    private commandName: string,
    private envVarName?: string,
    private versionArgs: string[] = ['--version']
  ) {}

  detect(customPath?: string): CliDetectionResult {
    const targetPath = customPath || (this.envVarName ? process.env[this.envVarName] : undefined) || this.commandName;

    try {
      const res = spawnSync(targetPath, this.versionArgs, { encoding: 'utf8', timeout: 5000 });
      if (res.status === 0 || (res.stdout && res.stdout.toLowerCase().includes(this.commandName))) {
        const verOutput = (res.stdout || res.stderr || `${this.commandName} unknown-version`).trim();
        return { available: true, executablePath: targetPath, version: verOutput };
      }
    } catch (err) {
      // Fall through to system PATH lookup
    }

    const resolved = this.findInPath(this.commandName);
    if (resolved) {
      try {
        const res = spawnSync(resolved, this.versionArgs, { encoding: 'utf8', timeout: 5000 });
        return { available: true, executablePath: resolved, version: (res.stdout || `${this.commandName} unknown-version`).trim() };
      } catch (err: any) {
        return { available: false, error: `Executable found at ${resolved} but failed to execute: ${err.message}` };
      }
    }

    return { available: false, error: `'${this.commandName}' executable not found in PATH${this.envVarName ? ` or ${this.envVarName}` : ''}` };
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
