import { EventEmitter } from 'events';
import { BudgetScope, BudgetEntry, BudgetConsumeResult } from '../../contracts/iexecution_policy';

export class TokenBudgetManager extends EventEmitter {
  private budgets = new Map<string, BudgetEntry>();

  private key(scope: BudgetScope, scopeId: string): string {
    return `${scope}:${scopeId}`;
  }

  setBudget(scope: BudgetScope, scopeId: string, hardLimit: number, softLimit?: number, warningThresholdPercent?: number): void {
    this.budgets.set(this.key(scope, scopeId), {
      scope,
      scopeId,
      hardLimit,
      softLimit: softLimit ?? Math.round(hardLimit * 0.8),
      currentUsage: 0,
      warningThresholdPercent: warningThresholdPercent ?? 75,
    });
  }

  /** Convenience alias kept for backward compatibility */
  setMissionBudget(missionId: string, hardLimitTokens: number): void {
    this.setBudget('MISSION', missionId, hardLimitTokens);
  }

  consumeTokens(scopeIdOrMissionId: string, tokens: number, scope: BudgetScope = 'MISSION'): BudgetConsumeResult {
    const k = this.key(scope, scopeIdOrMissionId);
    const b = this.budgets.get(k) || {
      scope,
      scopeId: scopeIdOrMissionId,
      hardLimit: 10000,
      softLimit: 8000,
      currentUsage: 0,
      warningThresholdPercent: 75,
    };

    b.currentUsage += tokens;
    this.budgets.set(k, b);

    const remaining = Math.max(0, b.hardLimit - b.currentUsage);
    const exceeded = b.currentUsage > b.hardLimit;
    const warningThreshold = b.hardLimit * (b.warningThresholdPercent / 100);
    const warning = b.currentUsage >= warningThreshold && !exceeded;

    // Automatic reduction: when soft limit is breached, reduce the remaining
    // allocation proportionally so downstream consumers get smaller chunks.
    let reduced = false;
    let reductionAmount = 0;
    if (b.currentUsage > b.softLimit && !exceeded) {
      reductionAmount = Math.round((b.currentUsage - b.softLimit) * 0.5);
      reduced = true;
      this.emit('BudgetReduced', { scope, scopeId: scopeIdOrMissionId, reductionAmount, currentUsage: b.currentUsage });
    }

    if (exceeded) {
      this.emit('BudgetExceeded', { scope, scopeId: scopeIdOrMissionId, currentUsage: b.currentUsage, hardLimit: b.hardLimit });
    }

    return { exceeded, warning, reduced, remaining, reductionAmount };
  }

  getBudgetStatus(scopeIdOrMissionId: string, scope: BudgetScope = 'MISSION'): BudgetEntry & { remaining: number } {
    const k = this.key(scope, scopeIdOrMissionId);
    const b = this.budgets.get(k) || {
      scope,
      scopeId: scopeIdOrMissionId,
      hardLimit: 10000,
      softLimit: 8000,
      currentUsage: 0,
      warningThresholdPercent: 75,
    };
    return {
      ...b,
      remaining: Math.max(0, b.hardLimit - b.currentUsage),
    };
  }
}
