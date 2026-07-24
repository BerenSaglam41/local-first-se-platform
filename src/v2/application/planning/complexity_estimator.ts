import {
  AnalyzedGoal,
  RiskReport,
  ComplexityReport,
} from '../../contracts/iplanning_engine';
import { CostEstimator } from '../policy/cost_estimator';

// ─── Module base complexity scores (1-10 scale) ─────────────────────

const MODULE_COMPLEXITY: Record<string, number> = {
  auth:        7,
  api:         5,
  database:    6,
  frontend:    5,
  testing:     3,
  devops:      4,
  security:    8,
  config:      2,
  middleware:  5,
  documentation: 2,
  general:     4,
};

export class ComplexityEstimator {
  private costEstimator = new CostEstimator();

  estimate(analyzedGoal: AnalyzedGoal, riskReport: RiskReport): ComplexityReport {
    const modules = analyzedGoal.affectedModules;

    // ─── Per-dimension complexity (1-10) ──────────────────────────
    const implScores = modules.map(m => MODULE_COMPLEXITY[m] ?? 4);
    const implComplexity = Math.round(implScores.reduce((a, b) => a + b, 0) / Math.max(implScores.length, 1));

    const testingComplexity = Math.min(10, implComplexity + 1);
    const reviewComplexity = Math.min(10, Math.round(implComplexity * 0.8));
    const verificationComplexity = Math.min(10, Math.round(reviewComplexity * 0.7 + riskReport.overallRiskScore / 20));
    const deploymentComplexity = modules.includes('devops') ? 6 : 3;

    const overallComplexity = Math.round(
      (implComplexity + testingComplexity + reviewComplexity + verificationComplexity + deploymentComplexity) / 5
    );

    // ─── Estimation via CostEstimator ─────────────────────────────
    const taskCount = Math.max(modules.length * 2, 3);
    const costReport = this.costEstimator.estimateMissionCost(
      analyzedGoal.goalId,
      taskCount,
      15000, // profile-neutral baseline
    );

    const estimatedWorkers = costReport.expectedWorkerCount;
    const estimatedRuntimeSec = costReport.estimatedRuntimeSec;
    const estimatedTokens = costReport.promptTokens + costReport.completionTokens;

    // ─── Confidence ───────────────────────────────────────────────
    // Higher when more modules recognized, lower when risk is high
    const moduleRecognitionRate = modules.filter(m => m !== 'general').length / Math.max(modules.length, 1);
    const riskPenalty = Math.min(30, riskReport.overallRiskScore / 3);
    const confidence = Math.round(Math.min(100, moduleRecognitionRate * 70 + 30 - riskPenalty));

    return {
      goalId: analyzedGoal.goalId,
      implementationComplexity: implComplexity,
      testingComplexity,
      reviewComplexity,
      verificationComplexity,
      deploymentComplexity,
      overallComplexity,
      estimatedWorkers,
      estimatedRuntimeSec,
      estimatedTokens,
      confidence,
      planningSource: 'RULE_ENGINE',
    };
  }
}
