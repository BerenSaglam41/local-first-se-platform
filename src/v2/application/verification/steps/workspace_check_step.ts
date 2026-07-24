import { IVerificationStep, VerificationStepResult } from '../../../contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../../contracts/iverification_pipeline';
import * as fs from 'fs';

export class WorkspaceCheckStep implements IVerificationStep {
  name = 'WorkspaceExistenceCheck';
  category = 'Workspace';

  async execute(context: VerificationContext, _policy?: Partial<VerificationPolicy>): Promise<VerificationStepResult> {
    const start = Date.now();
    const exists = fs.existsSync(context.workspacePath);

    return {
      name: this.name,
      category: this.category,
      passed: exists,
      message: exists
        ? `Workspace directory '${context.workspacePath}' exists.`
        : `Workspace directory '${context.workspacePath}' does not exist.`,
      errors: exists ? [] : [`Workspace directory '${context.workspacePath}' missing`],
      warnings: [],
      durationMs: Date.now() - start,
    };
  }
}
