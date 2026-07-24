import { DomainEvent, IEventStore } from '../../contracts/ievent_store';

export class InMemoryEventStore implements IEventStore {
  private events: DomainEvent[] = [];

  async append(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }

  async readStream(aggregateId: string): Promise<DomainEvent[]> {
    return this.events.filter(e => e.aggregateId === aggregateId);
  }

  async replayAll(handler: (event: DomainEvent) => void): Promise<void> {
    for (const event of this.events) {
      handler(event);
    }
  }

  getEventCount(): number {
    return this.events.length;
  }
}
