import {
  AnalyzedGoal,
  DependencyReport,
  RiskReport,
  RiskEntry,
  RiskSeverity,
} from '../../contracts/iplanning_engine';

// ─── Rule-based risk indicators ─────────────────────────────────────

interface RiskRule {
  keyword: string;
  category: string;
  description: string;
  severity: RiskSeverity;
  baseProbability: number;
  mitigation: string;
}

const RISK_RULES: RiskRule[] = [
  { keyword: 'auth',       category: 'Security',    description: 'Authentication changes may introduce security vulnerabilities',         severity: 'HIGH',     baseProbability: 40, mitigation: 'Mandatory security review and penetration testing' },
  { keyword: 'database',   category: 'Data',        description: 'Schema changes risk data loss or migration failures',                  severity: 'HIGH',     baseProbability: 35, mitigation: 'Backup before migration; reversible migration scripts' },
  { keyword: 'api',        category: 'Breaking',    description: 'API changes may break existing consumers',                              severity: 'MEDIUM',   baseProbability: 30, mitigation: 'Versioned API endpoints; backward compatibility layer' },
  { keyword: 'security',   category: 'Security',    description: 'Security-related code changes carry elevated risk',                     severity: 'CRITICAL', baseProbability: 50, mitigation: 'Mandatory security audit; no merge without approval' },
  { keyword: 'middleware', category: 'Refactor',    description: 'Middleware changes affect all request processing',                      severity: 'MEDIUM',   baseProbability: 25, mitigation: 'Incremental rollout with feature flags' },
  { keyword: 'frontend',   category: 'Regression',  description: 'UI changes may cause visual regressions',                               severity: 'LOW',      baseProbability: 20, mitigation: 'Visual regression snapshot tests' },
  { keyword: 'config',     category: 'Deployment',  description: 'Configuration changes may cause environment-specific failures',          severity: 'MEDIUM',   baseProbability: 25, mitigation: 'Environment-specific validation before deploy' },
  { keyword: 'devops',     category: 'Deployment',  description: 'CI/CD pipeline changes risk breaking the deployment process',            severity: 'HIGH',     baseProbability: 30, mitigation: 'Dry-run pipeline execution before merge' },
];

export class RiskAnalyzer {
  analyze(analyzedGoal: AnalyzedGoal, dependencyReport: DependencyReport): RiskReport {
    const risks: RiskEntry[] = [];
    let riskCounter = 1;

    // ─── Module-based risk rules ──────────────────────────────────
    for (const mod of analyzedGoal.affectedModules) {
      for (const rule of RISK_RULES) {
        if (mod === rule.keyword) {
          risks.push({
            id: `risk-${analyzedGoal.goalId}-${riskCounter++}`,
            category: rule.category,
            description: rule.description,
            severity: rule.severity,
            probability: rule.baseProbability,
            mitigation: rule.mitigation,
          });
        }
      }
    }

    // ─── Coupling-derived risks ───────────────────────────────────
    for (const coupling of dependencyReport.couplingRisks) {
      risks.push({
        id: `risk-${analyzedGoal.goalId}-${riskCounter++}`,
        category: 'Coupling',
        description: coupling,
        severity: 'MEDIUM',
        probability: 35,
        mitigation: 'Decouple modules via interfaces; minimize shared state',
      });
    }

    // ─── Circular dependency risks ────────────────────────────────
    for (const circular of dependencyReport.circularRisks) {
      risks.push({
        id: `risk-${analyzedGoal.goalId}-${riskCounter++}`,
        category: 'Architecture',
        description: `Potential circular dependency: ${circular}`,
        severity: 'HIGH',
        probability: 45,
        mitigation: 'Introduce dependency inversion or event-driven decoupling',
      });
    }

    // ─── Merge risk (multi-module changes) ────────────────────────
    if (analyzedGoal.affectedModules.length >= 3) {
      risks.push({
        id: `risk-${analyzedGoal.goalId}-${riskCounter++}`,
        category: 'Merge',
        description: `Large change spanning ${analyzedGoal.affectedModules.length} modules increases merge conflict probability`,
        severity: 'MEDIUM',
        probability: 40,
        mitigation: 'Use isolated worktrees per module; merge sequentially',
      });
    }

    // ─── Context risk (large scope) ───────────────────────────────
    if (analyzedGoal.affectedModules.length >= 4) {
      risks.push({
        id: `risk-${analyzedGoal.goalId}-${riskCounter++}`,
        category: 'Context',
        description: 'Large scope may exceed context window limits for AI workers',
        severity: 'LOW',
        probability: 30,
        mitigation: 'Use Context Compiler to minimize token usage per task',
      });
    }

    const overallRiskScore = this.computeOverallScore(risks);

    return {
      goalId: analyzedGoal.goalId,
      risks,
      overallRiskScore,
      planningSource: 'RULE_ENGINE',
    };
  }

  private computeOverallScore(risks: RiskEntry[]): number {
    if (risks.length === 0) return 0;
    const severityWeight: Record<RiskSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    const total = risks.reduce((sum, r) => sum + severityWeight[r.severity] * (r.probability / 100), 0);
    return Math.min(100, Math.round((total / risks.length) * 25));
  }
}
