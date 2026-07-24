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
}
