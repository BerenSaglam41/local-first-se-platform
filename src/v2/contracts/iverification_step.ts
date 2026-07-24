import { VerificationContext, VerificationPolicy } from './iverification_pipeline';

export interface VerificationStepResult {
  name: string;
  category: string;
  passed: boolean;
  /** True when this step genuinely did not run a real check (e.g. no build script defined, no
   * dependencies installed) rather than actually validating something and passing. A skipped
   * step must never be reported the same way as a real pass — see ADR for M29.1 Fix #1. */
  skipped?: boolean;
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
