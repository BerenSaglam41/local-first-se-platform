import { IVerificationStep, VerificationStepResult } from '../../../contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../../contracts/iverification_pipeline';

export class ArtifactCheckStep implements IVerificationStep {
  name = 'ArtifactIntegrityCheck';
  category = 'Artifacts';

  async execute(context: VerificationContext, _policy?: Partial<VerificationPolicy>): Promise<VerificationStepResult> {
    const start = Date.now();
    const artifactsCount = context.artifacts ? context.artifacts.length : 0;
    const hasArtifacts = artifactsCount > 0;

    return {
      name: this.name,
      category: this.category,
      passed: hasArtifacts,
      message: hasArtifacts
        ? `Found ${artifactsCount} valid execution artifacts.`
        : `No execution artifacts recorded for task '${context.taskId}'.`,
      errors: hasArtifacts ? [] : [`Task '${context.taskId}' produced no artifacts`],
      warnings: [],
      durationMs: Date.now() - start,
    };
  }
}
