import { Kernel } from '../../src/v2/kernel/kernel';
import { CollaborationEngine } from '../../src/v2/application/collaboration/collaboration_engine';
import { TaskOwnershipManager } from '../../src/v2/application/collaboration/task_ownership_manager';
import { ReviewWorkflowManager } from '../../src/v2/application/collaboration/review_workflow';
import { ConflictDetector } from '../../src/v2/application/collaboration/conflict_detector';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';

describe('SE-OS v2.0 Milestone 8 — Multi-Agent Collaboration Engine Suite', () => {
  const testDbPath = './se_company_m8_test.db';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('should route inter-worker messages through CompanyBus to inboxes and outboxes', async () => {
    await kernel.boot('./non_existent_config.json');
    const engine = kernel.getCollaborationEngine();

    await engine.sendMessage({
      id: 'msg-101',
      senderId: 'emp-alice',
      senderRole: 'Lead Architect',
      recipientId: 'emp-bob',
      messageType: 'TASK_REQUEST',
      missionId: 'mission-01',
      taskId: 'task-auth',
      summary: 'Please implement JWT Auth handler',
      timestamp: new Date().toISOString(),
    });

    const inboxBob = engine.getInbox('emp-bob');
    expect(inboxBob.length).toBe(1);
    expect(inboxBob[0].summary).toContain('JWT Auth handler');

    const outboxAlice = engine.getOutbox('emp-alice');
    expect(outboxAlice.length).toBe(1);
  });

  it('should manage task ownership and delegation', async () => {
    await kernel.boot('./non_existent_config.json');
    const engine = kernel.getCollaborationEngine();
    const ownership = engine.getOwnershipManager();

    ownership.assignOwner('task-db', 'emp-bob', 'emp-alice');

    expect(ownership.getOwnership('task-db')?.ownerId).toBe('emp-bob');
    expect(ownership.getOwnership('task-db')?.reviewerId).toBe('emp-alice');

    await engine.delegateTask('task-db', 'emp-bob', 'emp-charlie', 'mission-01');
    expect(ownership.getOwnership('task-db')?.ownerId).toBe('emp-charlie');
  });

  it('should process code review workflow (request -> approve/reject)', async () => {
    await kernel.boot('./non_existent_config.json');
    const engine = kernel.getCollaborationEngine();

    await engine.requestReview('task-api', 'emp-bob', 'emp-alice', 'mission-01');
    const review = engine.getReviewWorkflow().getReview('task-api');

    expect(review).toBeDefined();
    expect(review?.status).toBe('PENDING');

    await engine.approveReview('task-api', 'emp-alice', 'mission-01', 'Looks great!');
    expect(engine.getReviewWorkflow().getReview('task-api')?.status).toBe('APPROVED');

    await engine.rejectReview('task-api', 'emp-alice', 'mission-01', 'Needs error handling');
    expect(engine.getReviewWorkflow().getReview('task-api')?.status).toBe('REJECTED');
  });

  it('should detect parallel file edit conflicts across workers', () => {
    const detector = new ConflictDetector();

    const conflicts = detector.detectConflicts([
      { id: 'task-1', targetFiles: ['src/auth.ts'], assignedWorkerId: 'emp-alice' },
      { id: 'task-2', targetFiles: ['src/auth.ts'], assignedWorkerId: 'emp-bob' },
    ]);

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].type).toBe('PARALLEL_FILE_EDIT');
    expect(conflicts[0].targetFile).toBe('src/auth.ts');
  });

  it('should store knowledge notes into Shared Memory', async () => {
    await kernel.boot('./non_existent_config.json');
    const engine = kernel.getCollaborationEngine();

    await engine.shareKnowledge('emp-alice', 'JWT Best Practices', 'Use RS256 for asymmetric signing.');
    const adr = await kernel.getSharedMemory().readADR('adr-kn-'); // substring query supported
    expect(adr).toBeDefined();
  });

  it('should execute CLI collaboration subcommands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');
    await cli.workersDelegate('task-001', 'emp-bob', 'emp-alice');
    await cli.reviewRequest('task-001', 'emp-alice', 'emp-bob');
    await cli.workersMessages();
    await cli.workersInbox('emp-alice');
    await cli.workersOutbox('emp-bob');
    await cli.reviewApprove('task-001', 'emp-alice');
    await cli.reviewReject('task-001', 'Refactor method name', 'emp-alice');
    await cli.shutdown();
  });
});
