import { IVerificationStep, VerificationStepResult } from '../../../contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../../contracts/iverification_pipeline';
import { checkNpmScriptRunnable, runNpmScript } from './npm_script_runner';

/**
 * Really runs `npm run lint` in the workspace when it's genuinely runnable — see
 * BuildCheckStep's doc comment for why an unrunnable workspace reports `skipped`, never a
 * fabricated pass.
 */
export class LintCheckStep implements IVerificationStep {
  name = 'LintValidationCheck';
  category = 'Linting';

  async execute(context: VerificationContext, policy?: Partial<VerificationPolicy>): Promise<VerificationStepResult> {
    const start = Date.now();
    const requireLint = policy?.requireLint ?? true;

    if (!requireLint) {
      return {
        name: this.name,
        category: this.category,
        passed: true,
        skipped: true,
        message: 'Lint validation check skipped by policy configuration.',
        errors: [],
        warnings: [],
        durationMs: Date.now() - start,
      };
    }

    const runnable = checkNpmScriptRunnable(context.workspacePath, 'lint');
    if (!runnable.canRun) {
      return {
        name: this.name,
        category: this.category,
        passed: true,
        skipped: true,
        message: `Lint validation check skipped: ${runnable.reason}.`,
        errors: [],
        warnings: [],
        durationMs: Date.now() - start,
      };
    }

    const result = await runNpmScript(context.workspacePath, 'lint', policy?.timeoutMs ?? 30000);
    return {
      name: this.name,
      category: this.category,
      passed: result.passed,
      message: result.passed
        ? `'npm run lint' really passed for workspace '${context.workspacePath}'.`
        : `'npm run lint' really failed (exit ${result.exitCode}${result.timedOut ? ', timed out' : ''}).`,
      errors: result.passed ? [] : [result.errorOutput.trim() || result.output.trim() || 'Lint failed with no output'],
      warnings: [],
      durationMs: Date.now() - start,
    };
  }
}
