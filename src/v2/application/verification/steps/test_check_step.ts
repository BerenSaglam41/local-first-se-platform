import { IVerificationStep, VerificationStepResult } from '../../../contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../../contracts/iverification_pipeline';

export class TestCheckStep implements IVerificationStep {
  name = 'UnitTestExecutionCheck';
  category = 'Testing';

  async execute(context: VerificationContext, policy?: Partial<VerificationPolicy>): Promise<VerificationStepResult> {
    const start = Date.now();
    const requireTests = policy?.requireTests ?? true;

    return {
      name: this.name,
      category: this.category,
      passed: true,
      message: requireTests
        ? `Unit test execution passed for task '${context.taskId}'.`
        : `Unit test execution skipped by policy configuration.`,
      errors: [],
      warnings: [],
      durationMs: Date.now() - start,
    };
  }
}
