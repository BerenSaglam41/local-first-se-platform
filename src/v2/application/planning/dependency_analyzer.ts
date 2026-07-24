import {
  AnalyzedGoal,
  DependencyReport,
  DependencyEntry,
} from '../../contracts/iplanning_engine';

// ─── Rule-based module ownership + dependency map ───────────────────

const OWNERSHIP_MAP: Record<string, string> = {
  auth:        'Backend',
  api:         'Backend',
  database:    'Backend',
  frontend:    'Frontend',
  testing:     'QA',
  devops:      'DevOps',
  security:    'Backend',
  config:      'DevOps',
  middleware:  'Backend',
  documentation: 'Documentation',
  general:     'Backend',
};

const CROSS_DEPS: Record<string, string[]> = {
  auth:       ['database', 'middleware', 'config', 'security'],
  api:        ['middleware', 'database', 'config'],
  database:   ['config'],
  frontend:   ['api'],
  security:   ['auth', 'config'],
  middleware: ['config'],
  devops:     ['config', 'testing'],
};

const EXTERNAL_LIBS: Record<string, string[]> = {
  auth:     ['jsonwebtoken', 'bcrypt'],
  api:      ['express', 'fastify'],
  database: ['knex', 'pg', 'sqlite3'],
  frontend: ['react', 'vue'],
  testing:  ['jest', 'mocha'],
  devops:   ['docker', 'github-actions'],
  security: ['helmet', 'cors'],
};

export class DependencyAnalyzer {
  analyze(analyzedGoal: AnalyzedGoal): DependencyReport {
    const entries: DependencyEntry[] = [];
    const externalLibs = new Set<string>();
    const couplingRisks: string[] = [];
    const circularRisks: string[] = [];

    for (const mod of analyzedGoal.affectedModules) {
      const deps = CROSS_DEPS[mod] || [];
      const libs = EXTERNAL_LIBS[mod] || [];
      libs.forEach(l => externalLibs.add(l));

      entries.push({
        module: mod,
        owner: OWNERSHIP_MAP[mod] || 'Backend',
        dependsOn: deps,
        external: false,
      });

      // Coupling risk: if a module depends on 3+ other affected modules
      const overlapDeps = deps.filter(d => analyzedGoal.affectedModules.includes(d));
      if (overlapDeps.length >= 3) {
        couplingRisks.push(`Module '${mod}' has high coupling — depends on ${overlapDeps.join(', ')}`);
      }
    }

    // Circular dependency detection (simple bidirectional check)
    for (const entry of entries) {
      for (const dep of entry.dependsOn) {
        const reverse = CROSS_DEPS[dep] || [];
        if (reverse.includes(entry.module)) {
          const pair = [entry.module, dep].sort().join(' <-> ');
          if (!circularRisks.includes(pair)) {
            circularRisks.push(pair);
          }
        }
      }
    }

    return {
      goalId: analyzedGoal.goalId,
      entries,
      externalLibraries: Array.from(externalLibs),
      couplingRisks,
      circularRisks,
      planningSource: 'RULE_ENGINE',
    };
  }
}
