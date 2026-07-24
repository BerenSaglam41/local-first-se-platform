/**
 * Light-weight, interface-based Dependency Injection Container.
 * All registrations and resolves depend strictly on abstraction contracts/interfaces.
 */
export class DIContainer {
  private services = new Map<string, any>();
  private singletons = new Map<string, any>();

  register<T>(key: string, factory: (container: DIContainer) => T): void {
    this.services.set(key, factory);
  }

  registerSingleton<T>(key: string, instance: T): void {
    this.singletons.set(key, instance);
  }

  resolve<T>(key: string): T {
    if (this.singletons.has(key)) {
      return this.singletons.get(key) as T;
    }
    const factory = this.services.get(key);
    if (!factory) {
      throw new Error(`[DI] Service '${key}' is not registered in container.`);
    }
    const instance = factory(this);
    this.singletons.set(key, instance);
    return instance as T;
  }
}
