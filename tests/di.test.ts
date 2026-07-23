import { DiContainer } from '../src/infrastructure/di/di_container';

describe('Dependency Injection Container', () => {
  let container: DiContainer;

  beforeEach(() => {
    container = new DiContainer();
  });

  it('should register and resolve a singleton instance', () => {
    const serviceInstance = { name: 'TestService' };
    container.register('TestService', serviceInstance);

    const resolved = container.resolve<typeof serviceInstance>('TestService');
    expect(resolved).toBe(serviceInstance);
    expect(resolved.name).toBe('TestService');
  });

  it('should register and resolve a factory service', () => {
    let callCount = 0;
    container.registerFactory('FactoryService', (c) => {
      callCount++;
      return { id: callCount };
    });

    const instance1 = container.resolve<{ id: number }>('FactoryService');
    const instance2 = container.resolve<{ id: number }>('FactoryService');

    // Factory should only be called once (singleton caching)
    expect(callCount).toBe(1);
    expect(instance1.id).toBe(1);
    expect(instance2).toBe(instance1);
  });

  it('should throw an error when resolving an unregistered service', () => {
    expect(() => {
      container.resolve('UnknownService');
    }).toThrow('Service not registered in DI container: UnknownService');
  });
});
