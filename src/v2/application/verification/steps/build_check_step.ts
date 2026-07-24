import { IVerificationStep, VerificationStepResult } from '../../../contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../../contracts/iverification_pipeline';
import { checkNpmScriptRunnable, runNpmScript } from './npm_script_runner';

/**
 * Really runs `npm run build` in the workspace when it's genuinely runnable — previously this
 * step unconditionally returned `passed: true` without executing anything (see M29.1 Fix #1 /
 * the UAT that found REPORT.md fabricating a "Build Validation: PASSED" claim no build had ever
 * produced). A freshly-generated workspace usually has no installed dependencies yet; in that
 * case this honestly reports `skipped`, never a fabricated pass.
 */
export class BuildCheckStep implements IVerificationStep {
  name = 'BuildValidationCheck';
  category = 'Build';

  async execute(context: VerificationContext, policy?: Partial<VerificationPolicy>): Promise<VerificationStepResult> {
    const start = Date.now();
    const requireBuild = policy?.requireBuild ?? true;

    if (!requireBuild) {
      return {
        name: this.name,
        category: this.category,
        passed: true,
        skipped: true,
        message: 'Build validation skipped by policy configuration.',
        errors: [],
        warnings: [],
        durationMs: Date.now() - start,
      };
    }

    const runnable = checkNpmScriptRunnable(context.workspacePath, 'build');
    if (!runnable.canRun) {
      return {
        name: this.name,
        category: this.category,
        passed: true,
        skipped: true,
        message: `Build validation skipped: ${runnable.reason}.`,
        errors: [],
        warnings: [],
        durationMs: Date.now() - start,
      };
    }

    const result = await runNpmScript(context.workspacePath, 'build', policy?.timeoutMs ?? 30000);
    return {
      name: this.name,
      category: this.category,
      passed: result.passed,
      message: result.passed
        ? `'npm run build' really passed for workspace '${context.workspacePath}'.`
        : `'npm run build' really failed (exit ${result.exitCode}${result.timedOut ? ', timed out' : ''}).`,
      errors: result.passed ? [] : [result.errorOutput.trim() || result.output.trim() || 'Build failed with no output'],
      warnings: [],
      durationMs: Date.now() - start,
    };
  }
}
