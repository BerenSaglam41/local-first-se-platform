import { IVerificationStep, VerificationStepResult } from '../../../contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../../contracts/iverification_pipeline';
import { checkNpmScriptRunnable, runNpmScript } from './npm_script_runner';

/**
 * Really runs `npm test` in the workspace when it's genuinely runnable — see BuildCheckStep's
 * doc comment for why an unrunnable workspace reports `skipped`, never a fabricated pass.
 */
export class TestCheckStep implements IVerificationStep {
  name = 'UnitTestExecutionCheck';
  category = 'Testing';

  async execute(context: VerificationContext, policy?: Partial<VerificationPolicy>): Promise<VerificationStepResult> {
    const start = Date.now();
    const requireTests = policy?.requireTests ?? true;

    if (!requireTests) {
      return {
        name: this.name,
        category: this.category,
        passed: true,
        skipped: true,
        message: 'Unit test execution skipped by policy configuration.',
        errors: [],
        warnings: [],
        durationMs: Date.now() - start,
      };
    }

    const runnable = checkNpmScriptRunnable(context.workspacePath, 'test');
    if (!runnable.canRun) {
      return {
        name: this.name,
        category: this.category,
        passed: true,
        skipped: true,
        message: `Unit test execution skipped: ${runnable.reason}.`,
        errors: [],
        warnings: [],
        durationMs: Date.now() - start,
      };
    }

    const result = await runNpmScript(context.workspacePath, 'test', policy?.timeoutMs ?? 30000);
    return {
      name: this.name,
      category: this.category,
      passed: result.passed,
      message: result.passed
        ? `'npm test' really passed for task '${context.taskId}'.`
        : `'npm test' really failed (exit ${result.exitCode}${result.timedOut ? ', timed out' : ''}).`,
      errors: result.passed ? [] : [result.errorOutput.trim() || result.output.trim() || 'Tests failed with no output'],
      warnings: [],
      durationMs: Date.now() - start,
    };
  }
}
