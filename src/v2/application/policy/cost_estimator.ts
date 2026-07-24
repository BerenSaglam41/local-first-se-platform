import { EstimatedCostReport } from '../../contracts/iexecution_policy';

export class CostEstimator {
  private PROMPT_COST_PER_1K = 0.003;
  private COMPLETION_COST_PER_1K = 0.015;
  private REVIEW_COST_PER_TASK = 0.002;
  private VERIFICATION_COST_PER_TASK = 0.001;

  estimateMissionCost(missionId: string, taskCount: number, profileMaxTokens: number): EstimatedCostReport {
    const promptTokens = Math.min(taskCount * 1200, profileMaxTokens * 0.7);
    const completionTokens = Math.min(taskCount * 600, profileMaxTokens * 0.3);
    const estimatedRuntimeSec = taskCount * 15;
    const expectedWorkerCount = Math.min(taskCount, 3);

    const providerCost =
      (promptTokens / 1000) * this.PROMPT_COST_PER_1K +
      (completionTokens / 1000) * this.COMPLETION_COST_PER_1K;

    const reviewCost = taskCount * this.REVIEW_COST_PER_TASK;
    const verificationCost = taskCount * this.VERIFICATION_COST_PER_TASK;
    const rawCost = providerCost + reviewCost + verificationCost;

    const cacheSavingsUSD = rawCost * 0.35;
    const estimatedCostUSD = rawCost - cacheSavingsUSD;

    return {
      missionId,
      promptTokens: Math.round(promptTokens),
      completionTokens: Math.round(completionTokens),
      estimatedRuntimeSec,
      expectedWorkerCount,
      estimatedCostUSD: Number(estimatedCostUSD.toFixed(4)),
      expectedProviderCostUSD: Number(providerCost.toFixed(4)),
      expectedReviewCostUSD: Number(reviewCost.toFixed(4)),
      expectedVerificationCostUSD: Number(verificationCost.toFixed(4)),
      cacheSavingsUSD: Number(cacheSavingsUSD.toFixed(4)),
    };
  }
}
