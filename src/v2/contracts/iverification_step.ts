import { VerificationContext, VerificationPolicy } from './iverification_pipeline';

export interface VerificationStepResult {
  name: string;
  category: string;
  passed: boolean;
  message: string;
  errors: string[];
  warnings: string[];
  durationMs: number;
}

export interface IVerificationStep {
  name: string;
  category: string;
  execute(
    context: VerificationContext,
    policy?: Partial<VerificationPolicy>
  ): Promise<VerificationStepResult>;
}
