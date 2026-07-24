import {
  AnalyzedGoal,
  ExecutionStrategy,
  PlanEpic,
  PlanFeature,
  PlanTask,
} from '../../contracts/iplanning_engine';
import { CapabilityType } from '../../contracts/iplugin_framework';

// ─── Module → Capability mapping ────────────────────────────────────

const MODULE_CAPABILITIES: Record<string, CapabilityType[]> = {
  auth:        ['CODE_GENERATION', 'ARCHITECTURE'],
  api:         ['CODE_GENERATION'],
  database:    ['CODE_GENERATION'],
  frontend:    ['CODE_GENERATION'],
  testing:     ['TEST_GENERATION'],
  devops:      ['STATIC_ANALYSIS'],
  security:    ['CODE_REVIEW', 'STATIC_ANALYSIS'],
  config:      ['CODE_GENERATION'],
  middleware:  ['CODE_GENERATION', 'ARCHITECTURE'],
  documentation: ['DOCUMENTATION'],
  general:     ['CODE_GENERATION'],
};

// ─── Module → Department mapping ────────────────────────────────────

const MODULE_DEPT: Record<string, string> = {
  auth:        'dept-backend',
  api:         'dept-backend',
  database:    'dept-backend',
  frontend:    'dept-frontend',
  testing:     'dept-qa',
  devops:      'dept-devops',
  security:    'dept-backend',
  config:      'dept-devops',
  middleware:  'dept-backend',
  documentation: 'dept-documentation',
  general:     'dept-backend',
};

export class PlanGenerator {
  generate(analyzedGoal: AnalyzedGoal, strategy: ExecutionStrategy): { epics: PlanEpic[]; features: PlanFeature[]; tasks: PlanTask[] } {
    const epics: PlanEpic[] = [];
    const features: PlanFeature[] = [];
    const tasks: PlanTask[] = [];

    // ─── Phase 1: Architecture Epic (always first) ────────────────
    const archEpic: PlanEpic = {
      id: `epic-${analyzedGoal.goalId}-arch`,
      title: `Architecture & Design: ${analyzedGoal.businessObjective}`,
      description: `Define architectural blueprints and ADRs for ${analyzedGoal.businessObjective}`,
    };
    epics.push(archEpic);

    const archFeature: PlanFeature = {
      id: `feat-${analyzedGoal.goalId}-arch-design`,
      epicId: archEpic.id,
      title: 'Architectural Blueprint',
      description: 'Review existing architecture and define required changes',
    };
    features.push(archFeature);

    const archTask: PlanTask = {
      id: `task-${analyzedGoal.goalId}-arch`,
      featureId: archFeature.id,
      title: 'Architecture Review & ADR Generation',
      objective: `Design architecture for: ${analyzedGoal.businessObjective}`,
      targetFiles: ['architecture.md'],
      requiredCapabilities: ['ARCHITECTURE', 'DOCUMENTATION'],
      departmentId: 'dept-architecture',
      dependsOn: [],
      priority: 'P0',
    };
    tasks.push(archTask);

    // ─── Phase 2: Implementation Epics (per affected module) ──────
    const implEpic: PlanEpic = {
      id: `epic-${analyzedGoal.goalId}-impl`,
      title: `Implementation: ${analyzedGoal.businessObjective}`,
      description: `Core implementation across ${analyzedGoal.affectedModules.join(', ')}`,
    };
    epics.push(implEpic);

    for (const mod of analyzedGoal.affectedModules) {
      const feat: PlanFeature = {
        id: `feat-${analyzedGoal.goalId}-${mod}`,
        epicId: implEpic.id,
        title: `Implement ${mod} module`,
        description: `Implementation work for the ${mod} module`,
      };
      features.push(feat);

      const caps = MODULE_CAPABILITIES[mod] || ['CODE_GENERATION'];
      const dept = MODULE_DEPT[mod] || 'dept-backend';

      const implTask: PlanTask = {
        id: `task-${analyzedGoal.goalId}-${mod}`,
        featureId: feat.id,
        title: `Implement ${mod}`,
        objective: `Implement ${mod} module for: ${analyzedGoal.businessObjective}`,
        targetFiles: [`src/${mod}/index.ts`],
        requiredCapabilities: caps,
        departmentId: dept,
        dependsOn: [archTask.id],
        priority: 'P1',
      };
      tasks.push(implTask);
    }

    // ─── Phase 3: Testing Epic ────────────────────────────────────
    const testEpic: PlanEpic = {
      id: `epic-${analyzedGoal.goalId}-test`,
      title: `Testing: ${analyzedGoal.businessObjective}`,
      description: 'Automated test suite for all implemented modules',
    };
    epics.push(testEpic);

    const testFeature: PlanFeature = {
      id: `feat-${analyzedGoal.goalId}-tests`,
      epicId: testEpic.id,
      title: 'Test Suite',
      description: 'Unit and integration tests',
    };
    features.push(testFeature);

    const implTaskIds = tasks.filter(t => t.priority === 'P1').map(t => t.id);
    const testTask: PlanTask = {
      id: `task-${analyzedGoal.goalId}-tests`,
      featureId: testFeature.id,
      title: 'Automated Test Suite',
      objective: `Write tests for: ${analyzedGoal.businessObjective}`,
      targetFiles: ['tests/'],
      requiredCapabilities: ['TEST_GENERATION'],
      departmentId: 'dept-qa',
      dependsOn: implTaskIds,
      priority: 'P1',
    };
    tasks.push(testTask);

    // ─── Phase 4: Review Epic ─────────────────────────────────────
    const reviewEpic: PlanEpic = {
      id: `epic-${analyzedGoal.goalId}-review`,
      title: `Review & Audit: ${analyzedGoal.businessObjective}`,
      description: 'Code review and security audit',
    };
    epics.push(reviewEpic);

    const reviewFeature: PlanFeature = {
      id: `feat-${analyzedGoal.goalId}-review`,
      epicId: reviewEpic.id,
      title: 'Code Review',
      description: 'Quality and security audit',
    };
    features.push(reviewFeature);

    const reviewTask: PlanTask = {
      id: `task-${analyzedGoal.goalId}-review`,
      featureId: reviewFeature.id,
      title: 'Code Review & Audit',
      objective: `Audit quality and security for: ${analyzedGoal.businessObjective}`,
      targetFiles: ['src/'],
      requiredCapabilities: ['CODE_REVIEW'],
      departmentId: 'dept-qa',
      dependsOn: [testTask.id],
      priority: 'P2',
    };
    tasks.push(reviewTask);

    return { epics, features, tasks };
  }
}
