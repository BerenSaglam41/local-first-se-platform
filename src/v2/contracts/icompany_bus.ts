export type MessageType =
  | 'TASK_DELEGATION'
  | 'TASK_COMPLETED'
  | 'BROADCAST_ADR'
  | 'REVIEW_REQUEST'
  | 'REVIEW_FEEDBACK'
  | 'QA_VERIFICATION_FAIL'
  | 'TECHNICAL_QUESTION'
  | 'BLOCKER_RAISED'
  | 'ESCALATION_TRIGGERED'
  | 'STATUS_UPDATE';

export interface CompanyMessage {
  id: string;
  senderId: string;
  senderRole: string;
  recipientId?: string;
  department?: string;
  messageType: MessageType;
  missionId: string;
  taskId?: string;
  summary: string;
  payload?: Record<string, any>;
  timestamp: string;
}

export type SubscriptionToken = string;

export interface ICompanyBus {
  publish(message: CompanyMessage): Promise<void>;
  subscribe(topic: string, handler: (msg: CompanyMessage) => void): SubscriptionToken;
  unsubscribe(token: SubscriptionToken): void;
  broadcast(message: CompanyMessage): Promise<void>;
}
