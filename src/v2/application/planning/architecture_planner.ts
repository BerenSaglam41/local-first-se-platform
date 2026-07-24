import {
  AnalyzedGoal,
  ArchitectureDecision,
  PlanningSource,
} from '../../contracts/iplanning_engine';
import { PromptCache } from '../policy/prompt_cache';
import { ISharedMemory, ADRRecord } from '../../contracts/ishared_memory';

// ─── Rule-based architecture pattern map ────────────────────────────

const PATTERN_RULES: Record<string, { pattern: string; rationale: string; components: string[]; extensionPoints: string[] }> = {
  auth: {
    pattern: 'Middleware + Token Service',
    rationale: 'Authentication is best implemented as middleware intercepting requests, with a dedicated token service for issuance and validation.',
    components: ['AuthMiddleware', 'TokenService', 'UserRepository', 'SessionStore'],
    extensionPoints: ['OAuth provider adapters', 'Custom claim transformers'],
  },
  api: {
    pattern: 'Controller + Service + Repository',
    rationale: 'RESTful APIs benefit from layered architecture separating routing, business logic, and data access.',
    components: ['Router', 'Controller', 'Service', 'Repository', 'Validator'],
    extensionPoints: ['Custom middleware', 'Request/response interceptors'],
  },
  database: {
    pattern: 'Repository + Migration + Schema',
    rationale: 'Database changes require versioned migrations and a repository abstraction layer for testability.',
    components: ['MigrationRunner', 'SchemaDefinition', 'Repository', 'QueryBuilder'],
    extensionPoints: ['Custom dialect adapters', 'Seed data providers'],
  },
  frontend: {
    pattern: 'Component + State + View',
    rationale: 'UI development benefits from component-driven architecture with centralized state management.',
    components: ['PageComponent', 'StateStore', 'ViewRenderer', 'StyleModule'],
    extensionPoints: ['Theme providers', 'Plugin slots'],
  },
  security: {
    pattern: 'Guard + Policy + Audit',
    rationale: 'Security concerns require policy-based access control with comprehensive audit logging.',
    components: ['SecurityGuard', 'PolicyEngine', 'AuditLogger', 'PermissionResolver'],
    extensionPoints: ['Custom policy rules', 'External identity providers'],
  },
  testing: {
    pattern: 'Test Suite + Fixture + Mock',
    rationale: 'Testing requires structured suites with fixtures for reproducibility and mocks for isolation.',
    components: ['TestSuite', 'FixtureFactory', 'MockProvider', 'CoverageReporter'],
    extensionPoints: ['Custom assertions', 'Test data generators'],
  },
  devops: {
    pattern: 'Pipeline + Stage + Artifact',
    rationale: 'CI/CD pipelines are composed of ordered stages producing deployable artifacts.',
    components: ['PipelineConfig', 'BuildStage', 'TestStage', 'DeployStage'],
    extensionPoints: ['Custom build steps', 'Notification hooks'],
  },
  general: {
    pattern: 'Module + Interface + Implementation',
    rationale: 'General-purpose modules follow interface-driven design for decoupling and testability.',
    components: ['Interface', 'Implementation', 'Factory', 'Config'],
    extensionPoints: ['Custom implementations', 'Plugin hooks'],
  },
};

export class ArchitecturePlanner {
  constructor(
    private promptCache?: PromptCache,
    private sharedMemory?: ISharedMemory,
  ) {}

  async plan(analyzedGoal: AnalyzedGoal): Promise<ArchitectureDecision[]> {
    const cacheKey = `arch:${analyzedGoal.businessObjective.toLowerCase().replace(/\s+/g, '-')}`;

    // ─── Tier 1: Cache reuse ──────────────────────────────────────
    if (this.promptCache) {
      const cached = this.promptCache.get(cacheKey);
      if (cached) {
        const decisions = JSON.parse(cached) as ArchitectureDecision[];
        return decisions.map(d => ({ ...d, planningSource: 'CACHE' as PlanningSource }));
      }
    }

    // ─── Tier 2: ADR reuse from SharedMemory ──────────────────────
    const reusedAdrTitles: string[] = [];
    if (this.sharedMemory) {
      for (const mod of analyzedGoal.affectedModules) {
        const adr = await this.sharedMemory.readADR(`adr-${mod}`);
        if (adr && adr.status === 'ACCEPTED') {
          reusedAdrTitles.push(adr.title);
        }
      }
    }

    // ─── Tier 3: Rule-based pattern matching ──────────────────────
    const decisions: ArchitectureDecision[] = [];
    let counter = 1;

    for (const mod of analyzedGoal.affectedModules) {
      const rule = PATTERN_RULES[mod] || PATTERN_RULES['general'];
      const decision: ArchitectureDecision = {
        id: `adr-plan-${analyzedGoal.goalId}-${counter++}`,
        title: `Architecture for ${mod}: ${rule.pattern}`,
        pattern: rule.pattern,
        rationale: rule.rationale,
        components: rule.components,
        extensionPoints: rule.extensionPoints,
        reuseOpportunities: reusedAdrTitles,
        legacyConstraints: analyzedGoal.constraints,
        planningSource: 'RULE_ENGINE',
      };
      decisions.push(decision);
    }

    // ─── Persist ADRs to SharedMemory ─────────────────────────────
    if (this.sharedMemory) {
      for (const d of decisions) {
        const adr: ADRRecord = {
          id: d.id,
          title: d.title,
          author: 'AutonomousPlanner',
          status: 'PROPOSED',
          content: `Pattern: ${d.pattern}\nRationale: ${d.rationale}\nComponents: ${d.components.join(', ')}`,
          timestamp: new Date().toISOString(),
        };
        await this.sharedMemory.writeADR(adr);
      }
    }

    // ─── Cache for future reuse ───────────────────────────────────
    if (this.promptCache) {
      this.promptCache.set(cacheKey, JSON.stringify(decisions), [`goal:${analyzedGoal.goalId}`]);
    }

    return decisions;
  }
}
