export type CollaborationMessageType =
  | 'TASK_REQUEST'
  | 'TASK_COMPLETION'
  | 'REVIEW_REQUEST'
  | 'REVIEW_RESPONSE'
  | 'QUESTION'
  | 'ANSWER'
  | 'KNOWLEDGE_SHARE'
  | 'BLOCKER'
  | 'WARNING'
  | 'FAILURE'
  | 'HEARTBEAT';

export interface CollaborationMessage {
  id: string;
  senderId: string;
  senderRole: string;
  recipientId?: string;
  department?: string;
  messageType: CollaborationMessageType;
  missionId: string;
  taskId?: string;
  summary: string;
  payload?: Record<string, any>;
  timestamp: string;
}

export interface TaskOwnership {
  taskId: string;
  ownerId: string;
  reviewerId?: string;
  observerIds: string[];
}

export interface ReviewRecord {
  reviewId: string;
  taskId: string;
  developerId: string;
  reviewerId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  feedback?: string;
  timestamp: string;
}
