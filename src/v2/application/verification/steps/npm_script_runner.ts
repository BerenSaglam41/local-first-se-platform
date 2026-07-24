import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface NpmScriptRunnable {
  canRun: boolean;
  reason?: string;
}

/**
 * Real, honest preflight: decides whether a given npm script can actually be run against a
 * workspace, rather than pretending to run it. A freshly AI-generated workspace typically has no
 * installed dependencies yet — running `npm run build` there would just fail with a generic
 * "command not found" error that says nothing useful, so callers check this first and report an
 * honest SKIPPED result with a real reason instead of a fabricated PASS or a misleading FAIL.
 */
export function checkNpmScriptRunnable(workspacePath: string, scriptName: string): NpmScriptRunnable {
  const packageJsonPath = path.join(workspacePath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { canRun: false, reason: 'no package.json found in workspace' };
  }

  let pkg: any;
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (err: any) {
    return { canRun: false, reason: `package.json is not valid JSON: ${err.message}` };
  }

  if (!pkg.scripts || !pkg.scripts[scriptName]) {
    return { canRun: false, reason: `no "${scriptName}" script defined in package.json` };
  }

  if (!fs.existsSync(path.join(workspacePath, 'node_modules'))) {
    return { canRun: false, reason: 'dependencies not installed (node_modules missing) — run npm install first' };
  }

  return { canRun: true };
}

export interface NpmScriptRunResult {
  passed: boolean;
  output: string;
  errorOutput: string;
  exitCode: number | null;
  timedOut: boolean;
}

/** Really spawns `npm run <scriptName>` in the given workspace and reports the real exit code. */
export function runNpmScript(workspacePath: string, scriptName: string, timeoutMs: number): Promise<NpmScriptRunResult> {
  return new Promise((resolve) => {
    let output = '';
    let errorOutput = '';
    let settled = false;

    let child;
    try {
      child = spawn('npm', ['run', scriptName], { cwd: workspacePath, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err: any) {
      resolve({ passed: false, output: '', errorOutput: err.message, exitCode: null, timedOut: false });
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ passed: false, output, errorOutput: errorOutput || `Timed out after ${timeoutMs}ms`, exitCode: null, timedOut: true });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { errorOutput += chunk.toString('utf8'); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ passed: false, output, errorOutput: err.message, exitCode: null, timedOut: false });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ passed: code === 0, output, errorOutput, exitCode: code, timedOut: false });
    });
  });
}
