export type TeamSizeTier = 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE';

export interface TeamSizeEstimate {
  tier: TeamSizeTier;
  taskCount: number;
  recommendedWorkerCount: number;
  matchedKeywords: string[];
}

const ENTERPRISE_KEYWORDS = ['enterprise', 'large-scale', 'large scale', 'mission-critical', 'multi-region', 'compliance-grade'];
const LARGE_KEYWORDS = ['microservice', 'multi-tenant', 'multi tenant', 'distributed system', 'saas platform', 'saas'];
const SMALL_KEYWORDS = ['small', 'simple', 'single', 'minimal', 'tiny', 'quick', 'basic', 'health check', 'health-check'];
const SMALL_MAX_WORDS = 14;

/**
 * Deterministic, rule-based team-size scoring — not LLM-driven. Deliberately conservative:
 * ambiguous or generic goals stay at MEDIUM (the historical fixed 6-task size) rather than
 * guessing small or large. Only goals with explicit scope signals ("enterprise", "microservices",
 * "simple") move off the default tier. This keeps the planner's output stable and testable while
 * still genuinely varying team size for goals that say what scale they are.
 */
export class TeamSizeEstimator {
  estimate(goal: string): TeamSizeEstimate {
    const lower = goal.toLowerCase();
    const wordCount = lower.split(/\s+/).filter(Boolean).length;

    const enterpriseHits = ENTERPRISE_KEYWORDS.filter((k) => lower.includes(k));
    if (enterpriseHits.length > 0) {
      return { tier: 'ENTERPRISE', taskCount: 15, recommendedWorkerCount: 15, matchedKeywords: enterpriseHits };
    }

    const largeHits = LARGE_KEYWORDS.filter((k) => lower.includes(k));
    if (largeHits.length > 0) {
      return { tier: 'LARGE', taskCount: 10, recommendedWorkerCount: 10, matchedKeywords: largeHits };
    }

    const smallHits = SMALL_KEYWORDS.filter((k) => lower.includes(k));
    if (smallHits.length > 0 && wordCount <= SMALL_MAX_WORDS) {
      return { tier: 'SMALL', taskCount: 3, recommendedWorkerCount: 3, matchedKeywords: smallHits };
    }

    return { tier: 'MEDIUM', taskCount: 6, recommendedWorkerCount: 6, matchedKeywords: [] };
  }
}
