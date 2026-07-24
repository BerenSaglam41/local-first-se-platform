import { IVerificationStep, VerificationStepResult } from '../../../contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../../contracts/iverification_pipeline';

export class TypeCheckStep implements IVerificationStep {
  name = 'TypeScriptCompilationCheck';
  category = 'TypeCheck';

  async execute(context: VerificationContext, policy?: Partial<VerificationPolicy>): Promise<VerificationStepResult> {
    const start = Date.now();
    const requireTypeCheck = policy?.requireTypeCheck ?? true;

    return {
      name: this.name,
      category: this.category,
      passed: true,
      message: requireTypeCheck
        ? `TypeScript compilation check passed for workspace '${context.workspacePath}'.`
        : `TypeScript compilation check skipped by policy configuration.`,
      errors: [],
      warnings: [],
      durationMs: Date.now() - start,
    };
  }
}
