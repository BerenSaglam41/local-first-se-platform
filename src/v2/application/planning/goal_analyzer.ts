import {
  BusinessGoal,
  AnalyzedGoal,
  PlanningSource,
  PlanningConfig,
  DEFAULT_PLANNING_CONFIG,
} from '../../contracts/iplanning_engine';
import { PromptCache } from '../policy/prompt_cache';
import { ISharedMemory } from '../../contracts/ishared_memory';

// ─── Module keyword map (rule-based) ────────────────────────────────

const MODULE_KEYWORDS: Record<string, string[]> = {
  'auth':        ['jwt', 'auth', 'login', 'signup', 'session', 'token', 'password', 'oauth', 'sso'],
  'api':         ['api', 'rest', 'graphql', 'endpoint', 'route', 'controller', 'handler'],
  'database':    ['database', 'db', 'sql', 'migration', 'schema', 'model', 'orm', 'query', 'table'],
  'frontend':    ['ui', 'frontend', 'component', 'page', 'view', 'layout', 'css', 'style', 'react'],
  'testing':     ['test', 'spec', 'coverage', 'e2e', 'integration', 'unit'],
  'devops':      ['deploy', 'ci', 'cd', 'docker', 'pipeline', 'build', 'infra'],
  'security':    ['security', 'encryption', 'hash', 'rbac', 'permission', 'role', 'access'],
  'config':      ['config', 'env', 'environment', 'settings', 'options'],
  'middleware':  ['middleware', 'interceptor', 'guard', 'filter', 'pipe'],
  'documentation': ['docs', 'readme', 'documentation', 'changelog'],
};

export class GoalAnalyzer {
  constructor(
    private promptCache?: PromptCache,
    private sharedMemory?: ISharedMemory,
    private config: PlanningConfig = DEFAULT_PLANNING_CONFIG,
  ) {}

  async analyze(goal: BusinessGoal): Promise<AnalyzedGoal> {
    const goalId = `goal-${Date.now()}`;
    const goalHash = this.hashGoal(goal);

    // ─── Tier 1: Cache reuse ──────────────────────────────────────
    if (this.promptCache) {
      const cached = this.promptCache.get(goalHash);
      if (cached) {
        const parsed = JSON.parse(cached) as AnalyzedGoal;
        return { ...parsed, goalId, planningSource: 'CACHE' };
      }
    }

    // ─── Tier 2: ADR reuse — enrich from SharedMemory ─────────────
    let adrModules: string[] = [];
    if (this.sharedMemory) {
      const knownAdrIds = ['adr-001', 'adr-002', 'adr-003'];
      for (const id of knownAdrIds) {
        const adr = await this.sharedMemory.readADR(id);
        if (adr && this.textOverlap(adr.content, goal.description)) {
          adrModules.push(adr.title);
        }
      }
    }

    // ─── Tier 3: Rule-based keyword extraction ────────────────────
    const text = `${goal.title} ${goal.description}`.toLowerCase();
    const affectedModules = this.extractModules(text);
    if (adrModules.length > 0) {
      affectedModules.push(...adrModules.filter(m => !affectedModules.includes(m)));
    }

    const dependencies = this.extractDependencies(text, affectedModules);
    const constraints = goal.constraints ?? [];
    const acceptanceCriteria = this.generateAcceptanceCriteria(goal, affectedModules);
    const confidence = this.computeConfidence(affectedModules, text);

    const result: AnalyzedGoal = {
      goalId,
      businessObjective: goal.title,
      affectedModules,
      dependencies,
      constraints,
      acceptanceCriteria,
      planningSource: 'RULE_ENGINE',
      confidence,
    };

    // ─── Tier 4: AI fallback decision gate ────────────────────────
    // This milestone only DECIDES when AI is needed. HOW it executes
    // is outside scope. We flag but do not invoke.
    if (confidence < this.config.aiConfidenceThreshold && this.config.enableAIFallback) {
      result.planningSource = 'RULE_ENGINE'; // stays rule-based; AI not yet wired
    }

    // Cache for future reuse
    if (this.promptCache) {
      this.promptCache.set(goalHash, JSON.stringify(result), [`goal:${goalId}`]);
    }

    return result;
  }

  // ─── Private helpers ────────────────────────────────────────────

  private extractModules(text: string): string[] {
    const found: string[] = [];
    for (const [mod, keywords] of Object.entries(MODULE_KEYWORDS)) {
      if (keywords.some(kw => text.includes(kw))) {
        found.push(mod);
      }
    }
    return found.length > 0 ? found : ['general'];
  }

  private extractDependencies(text: string, modules: string[]): string[] {
    const deps: string[] = [];
    if (modules.includes('auth')) deps.push('crypto', 'jsonwebtoken');
    if (modules.includes('database')) deps.push('database-driver');
    if (modules.includes('api')) deps.push('http-framework');
    if (modules.includes('frontend')) deps.push('component-library');
    if (modules.includes('devops')) deps.push('ci-toolchain');
    return deps;
  }

  private generateAcceptanceCriteria(goal: BusinessGoal, modules: string[]): string[] {
    const criteria: string[] = [
      `${goal.title} is implemented and functional`,
      'All unit tests pass',
      'No regressions in existing functionality',
    ];
    if (modules.includes('auth')) criteria.push('Authentication flow works end-to-end');
    if (modules.includes('api')) criteria.push('API endpoints respond with correct status codes');
    if (modules.includes('database')) criteria.push('Database migrations execute cleanly');
    if (modules.includes('security')) criteria.push('Security audit passes with no critical findings');
    return criteria;
  }

  private computeConfidence(modules: string[], text: string): number {
    // More recognized modules and longer description → higher confidence
    const moduleScore = Math.min(modules.length * 15, 60);
    const lengthScore = Math.min(text.length / 10, 40);
    return Math.min(100, Math.round(moduleScore + lengthScore));
  }

  private hashGoal(goal: BusinessGoal): string {
    return `goal:${goal.title.toLowerCase().replace(/\s+/g, '-')}`;
  }

  private textOverlap(a: string, b: string): boolean {
    const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    let overlap = 0;
    for (const w of wordsB) {
      if (wordsA.has(w)) overlap++;
    }
    return overlap >= 2;
  }
}
