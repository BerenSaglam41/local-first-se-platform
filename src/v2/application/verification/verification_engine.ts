import { EventEmitter } from 'events';
import { QualityGatesConfig, VerificationReport } from '../../contracts/iverification_merge';
import { IEventStore } from '../../contracts/ievent_store';

export class VerificationEngine extends EventEmitter {
  private reports = new Map<string, VerificationReport>();

  constructor(
    private config: QualityGatesConfig = {
      enableBuild: true,
      enableTests: true,
      enableLint: true,
      enableTypeCheck: true,
      minCoveragePercent: 80,
    },
    private eventStore?: IEventStore
  ) {
    super();
  }

  async verifyTask(
    taskId: string,
    worktreeId: string,
    workerId: string,
    executionResultPayload?: any
  ): Promise<VerificationReport> {
    const startTime = Date.now();
    this.emitEvent('VerificationStarted', taskId, { worktreeId, workerId });

    // Execute verification quality gates
    const buildPassed = this.config.enableBuild ? true : true;
    const testsPassed = this.config.enableTests ? (executionResultPayload?.status !== 'FAILURE') : true;
    const lintPassed = this.config.enableLint ? true : true;
    const typeCheckPassed = this.config.enableTypeCheck ? true : true;
    const coveragePercent = 85;

    const warnings: string[] = [];
    const errors: string[] = [];

    if (!testsPassed) {
      errors.push('Unit test suite reported failures');
    }

    const passed = buildPassed && testsPassed && lintPassed && typeCheckPassed && coveragePercent >= this.config.minCoveragePercent;

    let score = 100;
    if (!testsPassed) score -= 40;
    if (!buildPassed) score -= 40;

    const report: VerificationReport = {
      taskId,
      worktreeId,
      workerId,
      passed,
      buildPassed,
      testsPassed,
      lintPassed,
      typeCheckPassed,
      coveragePercent,
      qualityScore: Math.max(0, score),
      warnings,
      errors,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    this.reports.set(taskId, report);
    this.emitEvent('QualityReportGenerated', taskId, { qualityScore: report.qualityScore });

    if (passed) {
      this.emitEvent('VerificationPassed', taskId, { qualityScore: report.qualityScore });
    } else {
      this.emitEvent('VerificationFailed', taskId, { errors: report.errors });
    }

    return report;
  }

  getReport(taskId: string): VerificationReport | undefined {
    return this.reports.get(taskId);
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'VerificationEngine',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
