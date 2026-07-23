export class DiContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, (container: DiContainer) => any>();

  register<T>(name: string, instance: T): void {
    this.services.set(name, instance);
  }

  registerFactory<T>(name: string, factory: (container: DiContainer) => T): void {
    this.factories.set(name, factory);
  }

  resolve<T>(name: string): T {
    if (this.services.has(name)) {
      return this.services.get(name) as T;
    }

    if (this.factories.has(name)) {
      const factory = this.factories.get(name)!;
      const instance = factory(this);
      this.services.set(name, instance); // Cache as singleton
      return instance as T;
    }

    throw new Error(`Service not registered in DI container: ${name}`);
  }

  reset(): void {
    this.services.clear();
    this.factories.clear();
  }
}
