import { CompanyMessage, ICompanyBus, SubscriptionToken } from '../../contracts/icompany_bus';

export class InMemoryCompanyBus implements ICompanyBus {
  private subscriptions = new Map<string, Map<SubscriptionToken, (msg: CompanyMessage) => void>>();
  private tokenCounter = 0;

  async publish(message: CompanyMessage): Promise<void> {
    const topic = message.department || 'global';
    const handlers = this.subscriptions.get(topic);
    if (handlers) {
      for (const handler of handlers.values()) {
        handler(message);
      }
    }
  }

  subscribe(topic: string, handler: (msg: CompanyMessage) => void): SubscriptionToken {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Map());
    }
    const token = `sub-${++this.tokenCounter}`;
    this.subscriptions.get(topic)!.set(token, handler);
    return token;
  }

  unsubscribe(token: SubscriptionToken): void {
    for (const subMap of this.subscriptions.values()) {
      subMap.delete(token);
    }
  }

  async broadcast(message: CompanyMessage): Promise<void> {
    for (const subMap of this.subscriptions.values()) {
      for (const handler of subMap.values()) {
        handler(message);
      }
    }
  }
}
