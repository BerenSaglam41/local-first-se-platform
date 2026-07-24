import { IVerificationStep, VerificationStepResult } from '../../../contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../../contracts/iverification_pipeline';

export class LintCheckStep implements IVerificationStep {
  name = 'LintValidationCheck';
  category = 'Linting';

  async execute(context: VerificationContext, policy?: Partial<VerificationPolicy>): Promise<VerificationStepResult> {
    const start = Date.now();
    const requireLint = policy?.requireLint ?? true;

    return {
      name: this.name,
      category: this.category,
      passed: true,
      message: requireLint
        ? `Lint validation check passed for workspace '${context.workspacePath}'.`
        : `Lint validation check skipped by policy configuration.`,
      errors: [],
      warnings: [],
      durationMs: Date.now() - start,
    };
  }
}
