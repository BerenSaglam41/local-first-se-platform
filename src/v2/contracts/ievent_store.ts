export interface DomainEvent<T = any> {
  eventId: string;
  aggregateId: string;
  eventType: string;
  version: number;
  timestamp: string;
  actorId: string;
  payload: T;
}

export interface IEventStore {
  append(event: DomainEvent): Promise<void>;
  readStream(aggregateId: string): Promise<DomainEvent[]>;
  replayAll(handler: (event: DomainEvent) => void): Promise<void>;
  /** Real-time notification for every event actually appended. Returns an unsubscribe function. */
  subscribe?(handler: (event: DomainEvent) => void): () => void;
}
