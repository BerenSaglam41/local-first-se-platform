import { EventEmitter } from 'events';
import { CollaborationMessage, CollaborationMessageType } from '../../contracts/icollaboration';
import { TaskOwnershipManager } from './task_ownership_manager';
import { ReviewWorkflowManager } from './review_workflow';
import { ConflictDetector } from './conflict_detector';
import { ICompanyBus } from '../../contracts/icompany_bus';
import { IEventStore } from '../../contracts/ievent_store';
import { ISharedMemory } from '../../contracts/ishared_memory';
import { WorkforceRepository } from '../../contracts/iworkforce_repository';

export class CollaborationEngine extends EventEmitter {
  private ownershipManager = new TaskOwnershipManager();
  private reviewWorkflow = new ReviewWorkflowManager();
  private conflictDetector = new ConflictDetector();
  private inboxMap = new Map<string, CollaborationMessage[]>();
  private outboxMap = new Map<string, CollaborationMessage[]>();
  private reviewRejectionHandler?: (taskId: string, reviewerId: string, missionId: string, feedback: string) => Promise<void>;

  constructor(
    private companyBus?: ICompanyBus,
    private eventStore?: IEventStore,
    private sharedMemory?: ISharedMemory,
    private repository?: WorkforceRepository
  ) {
    super();
  }

  async sendMessage(msg: CollaborationMessage): Promise<void> {
    await this.repository?.recordMessage(msg);
    if (!this.outboxMap.has(msg.senderId)) {
      this.outboxMap.set(msg.senderId, []);
    }
    this.outboxMap.get(msg.senderId)!.push(msg);

    if (msg.recipientId) {
      if (!this.inboxMap.has(msg.recipientId)) {
        this.inboxMap.set(msg.recipientId, []);
      }
      this.inboxMap.get(msg.recipientId)!.push(msg);
    }

    if (this.companyBus) {
      await this.companyBus.publish({
        id: msg.id,
        senderId: msg.senderId,
        senderRole: msg.senderRole,
        recipientId: msg.recipientId,
        department: msg.department || 'global',
        messageType: msg.messageType as any,
        missionId: msg.missionId,
        taskId: msg.taskId,
        summary: msg.summary,
        payload: msg.payload,
        timestamp: msg.timestamp,
      });
    }

    this.emitEvent('WorkerMessageSent', msg.id, { senderId: msg.senderId, recipientId: msg.recipientId, messageType: msg.messageType });
    if (msg.recipientId) {
      this.emitEvent('WorkerMessageReceived', msg.id, { recipientId: msg.recipientId });
    }
  }

  async askQuestion(questionId: string, senderId: string, recipientId: string, missionId: string, question: string, taskId?: string): Promise<void> {
    await this.sendMessage({ id: `msg-q-${questionId}`, senderId, senderRole: 'Engineer', recipientId, messageType: 'QUESTION', missionId, taskId, summary: question, payload: { questionId, question }, timestamp: new Date().toISOString() });
  }

  async answerQuestion(questionId: string, senderId: string, recipientId: string, missionId: string, answer: string, taskId?: string): Promise<void> {
    await this.sendMessage({ id: `msg-a-${questionId}`, senderId, senderRole: 'Engineer', recipientId, messageType: 'ANSWER', missionId, taskId, summary: answer, payload: { questionId, answer }, timestamp: new Date().toISOString() });
  }

  async delegateTask(taskId: string, currentOwnerId: string, newOwnerId: string, missionId: string): Promise<void> {
    this.ownershipManager.transferOwnership(taskId, newOwnerId);

    const msg: CollaborationMessage = {
      id: `msg-del-${Date.now()}`,
      senderId: currentOwnerId,
      senderRole: 'Developer',
      recipientId: newOwnerId,
      messageType: 'TASK_REQUEST',
      missionId,
      taskId,
      summary: `Delegated task ${taskId} to worker ${newOwnerId}`,
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage(msg);
    this.emitEvent('TaskDelegated', taskId, { currentOwnerId, newOwnerId });
  }

  async requestReview(taskId: string, developerId: string, reviewerId: string, missionId: string): Promise<void> {
    const record = this.reviewWorkflow.requestReview(taskId, developerId, reviewerId);
    this.ownershipManager.assignReviewer(taskId, reviewerId);

    const msg: CollaborationMessage = {
      id: `msg-rev-${Date.now()}`,
      senderId: developerId,
      senderRole: 'Developer',
      recipientId: reviewerId,
      messageType: 'REVIEW_REQUEST',
      missionId,
      taskId,
      summary: `Requested code review for task ${taskId}`,
      payload: { reviewId: record.reviewId },
      timestamp: new Date().toISOString(),
    };

    await this.sendMessage(msg);
    this.emitEvent('ReviewRequested', taskId, { developerId, reviewerId, reviewId: record.reviewId });
  }

  async approveReview(taskId: string, reviewerId: string, missionId: string, feedback?: string): Promise<void> {
    const record = this.reviewWorkflow.approveReview(taskId, feedback);
    if (record) {
      const msg: CollaborationMessage = {
        id: `msg-app-${Date.now()}`,
        senderId: reviewerId,
        senderRole: 'Reviewer',
        recipientId: record.developerId,
        messageType: 'REVIEW_RESPONSE',
        missionId,
        taskId,
        summary: `Approved review for task ${taskId}`,
        payload: { feedback },
        timestamp: new Date().toISOString(),
      };
      await this.sendMessage(msg);
      this.emitEvent('ReviewApproved', taskId, { reviewerId, developerId: record.developerId });
    }
  }

  async rejectReview(taskId: string, reviewerId: string, missionId: string, feedback: string): Promise<void> {
    const record = this.reviewWorkflow.rejectReview(taskId, feedback);
    if (record) {
      const msg: CollaborationMessage = {
        id: `msg-rej-${Date.now()}`,
        senderId: reviewerId,
        senderRole: 'Reviewer',
        recipientId: record.developerId,
        messageType: 'REVIEW_RESPONSE',
        missionId,
        taskId,
        summary: `Requested changes for task ${taskId}`,
        payload: { feedback },
        timestamp: new Date().toISOString(),
      };
      await this.sendMessage(msg);
      this.emitEvent('ReviewRejected', taskId, { reviewerId, developerId: record.developerId, feedback });
      if (this.reviewRejectionHandler) {
        await this.reviewRejectionHandler(taskId, reviewerId, missionId, feedback);
      }
    }
  }

  setReviewRejectionHandler(handler: (taskId: string, reviewerId: string, missionId: string, feedback: string) => Promise<void>): void {
    this.reviewRejectionHandler = handler;
  }

  async shareKnowledge(authorId: string, title: string, content: string): Promise<void> {
    if (this.sharedMemory) {
      await this.sharedMemory.writeADR({
        id: `adr-kn-${Date.now()}`,
        title,
        author: authorId,
        status: 'ACCEPTED',
        content,
        timestamp: new Date().toISOString(),
      });
    }
    this.emitEvent('KnowledgeShared', authorId, { title });
  }

  getInbox(workerId: string): CollaborationMessage[] {
    return this.inboxMap.get(workerId) || [];
  }

  getOutbox(workerId: string): CollaborationMessage[] {
    return this.outboxMap.get(workerId) || [];
  }

  getOwnershipManager(): TaskOwnershipManager {
    return this.ownershipManager;
  }

  getReviewWorkflow(): ReviewWorkflowManager {
    return this.reviewWorkflow;
  }

  getConflictDetector(): ConflictDetector {
    return this.conflictDetector;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'CollaborationEngine',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
