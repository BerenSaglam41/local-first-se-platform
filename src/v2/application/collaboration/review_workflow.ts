import { ReviewRecord } from '../../contracts/icollaboration';

export class ReviewWorkflowManager {
  private reviews = new Map<string, ReviewRecord>();

  requestReview(taskId: string, developerId: string, reviewerId: string): ReviewRecord {
    const reviewId = `rev-${taskId}-${Date.now()}`;
    const record: ReviewRecord = {
      reviewId,
      taskId,
      developerId,
      reviewerId,
      status: 'PENDING',
      timestamp: new Date().toISOString(),
    };
    this.reviews.set(taskId, record);
    return record;
  }

  approveReview(taskId: string, feedback?: string): ReviewRecord | null {
    const record = this.reviews.get(taskId);
    if (!record) return null;

    record.status = 'APPROVED';
    if (feedback) record.feedback = feedback;
    record.timestamp = new Date().toISOString();
    return record;
  }

  rejectReview(taskId: string, feedback: string): ReviewRecord | null {
    const record = this.reviews.get(taskId);
    if (!record) return null;

    record.status = 'REJECTED';
    record.feedback = feedback;
    record.timestamp = new Date().toISOString();
    return record;
  }

  getReview(taskId: string): ReviewRecord | undefined {
    return this.reviews.get(taskId);
  }

  listReviews(): ReviewRecord[] {
    return Array.from(this.reviews.values());
  }
}
