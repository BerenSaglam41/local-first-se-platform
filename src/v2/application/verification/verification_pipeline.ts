import { EventEmitter } from 'events';
import {
  VerificationContext,
  VerificationPolicy,
  VerificationResult,
  VerificationPlan,
} from '../../contracts/iverification_pipeline';
import { IVerificationStep, VerificationStepResult } from '../../contracts/iverification_step';
import { IEventStore } from '../../contracts/ievent_store';

import { WorkspaceCheckStep } from './steps/workspace_check_step';
import { ArtifactCheckStep } from './steps/artifact_check_step';
import { BuildCheckStep } from './steps/build_check_step';
import { TypeCheckStep } from './steps/type_check_step';
import { TestCheckStep } from './steps/test_check_step';
import { LintCheckStep } from './steps/lint_check_step';

export class VerificationPipeline extends EventEmitter {
  private steps: IVerificationStep[] = [];
  private lastResult?: VerificationResult;
  private defaultPolicy: VerificationPolicy = {
    requireBuild: true,
    requireTypeCheck: true,
    requireTests: true,
    requireLint: true,
    minQualityScore: 70,
    timeoutMs: 30000,
  };

  constructor(private eventStore?: IEventStore, initialSteps?: IVerificationStep[]) {
    super();
    if (initialSteps && initialSteps.length > 0) {
      this.steps = [...initialSteps];
    } else {
      // Default 6 built-in verification steps
      this.steps = [
        new WorkspaceCheckStep(),
        new ArtifactCheckStep(),
        new BuildCheckStep(),
        new TypeCheckStep(),
        new TestCheckStep(),
        new LintCheckStep(),
      ];
    }
  }

  registerStep(step: IVerificationStep): void {
    this.steps.push(step);
  }

  getSteps(): IVerificationStep[] {
    return [...this.steps];
  }

  createVerificationPlan(planId: string = `vplan-${Date.now()}`): VerificationPlan {
    return {
      planId,
      steps: [...this.steps],
    };
  }

  async verify(
    context: VerificationContext,
    policyConfig?: Partial<VerificationPolicy>
  ): Promise<VerificationResult> {
    const policy: VerificationPolicy = { ...this.defaultPolicy, ...policyConfig };
    const startTime = Date.now();

    this.emitEvent('VerificationStarted', context.taskId, {
      workspacePath: context.workspacePath,
      stepsCount: this.steps.length,
    });

    const stepResults: VerificationStepResult[] = [];
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    let passedSteps = 0;

    for (const step of this.steps) {
      try {
        const stepRes = await step.execute(context, policy);
        stepResults.push(stepRes);

        if (stepRes.passed) {
          passedSteps++;
        } else {
          allErrors.push(...stepRes.errors);
        }
        allWarnings.push(...stepRes.warnings);
      } catch (err: any) {
        stepResults.push({
          name: step.name,
          category: step.category,
          passed: false,
          message: `Step '${step.name}' threw exception: ${err.message}`,
          errors: [err.message],
          warnings: [],
          durationMs: 0,
        });
        allErrors.push(`Exception in step '${step.name}': ${err.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    const qualityScore = Math.round((passedSteps / this.steps.length) * 100);
    const success = qualityScore >= policy.minQualityScore && allErrors.length === 0;
    const status = success ? 'PASSED' : 'FAILED';

    const result: VerificationResult = {
      success,
      status,
      taskId: context.taskId,
      workspacePath: context.workspacePath,
      stepResults,
      qualityScore,
      errors: allErrors,
      warnings: allWarnings,
      durationMs,
    };

    if (success) {
      this.emitEvent('VerificationPassed', context.taskId, { qualityScore, durationMs });
    } else {
      this.emitEvent('VerificationFailed', context.taskId, { qualityScore, errorsCount: allErrors.length });
    }

    this.emitEvent('VerificationCompleted', context.taskId, { status, qualityScore });

    this.lastResult = result;
    return result;
  }

  /** Real last verification outcome — used by telemetry so the UI shows what actually ran, not a
   * hardcoded always-100 block. */
  getLastResult(): VerificationResult | undefined {
    return this.lastResult;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'VerificationPipeline',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
