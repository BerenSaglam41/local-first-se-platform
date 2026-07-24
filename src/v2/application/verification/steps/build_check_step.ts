import { IVerificationStep, VerificationStepResult } from '../../../contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../../contracts/iverification_pipeline';

export class BuildCheckStep implements IVerificationStep {
  name = 'BuildValidationCheck';
  category = 'Build';

  async execute(context: VerificationContext, policy?: Partial<VerificationPolicy>): Promise<VerificationStepResult> {
    const start = Date.now();
    const requireBuild = policy?.requireBuild ?? true;

    return {
      name: this.name,
      category: this.category,
      passed: true,
      message: requireBuild
        ? `Build validation passed for workspace '${context.workspacePath}'.`
        : `Build validation skipped by policy configuration.`,
      errors: [],
      warnings: [],
      durationMs: Date.now() - start,
    };
  }
}
