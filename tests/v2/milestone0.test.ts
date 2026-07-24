import { DIContainer } from '../../src/v2/infrastructure/di/di_container';
import { ICompanyBus } from '../../src/v2/contracts/icompany_bus';
import { InMemoryCompanyBus } from '../../src/v2/application/company-bus/in_memory_company_bus';
import { IEventStore } from '../../src/v2/contracts/ievent_store';
import { InMemoryEventStore } from '../../src/v2/domain/events/in_memory_event_store';
import { IScheduler } from '../../src/v2/contracts/ischeduler';
import { SchedulerSkeleton } from '../../src/v2/application/scheduler/scheduler_skeleton';
import { IPluginRegistry } from '../../src/v2/contracts/iplugin_registry';
import { PluginRegistry } from '../../src/v2/application/plugins/plugin_registry';
import { ISharedMemory } from '../../src/v2/contracts/ishared_memory';
import { SharedMemorySkeleton } from '../../src/v2/domain/shared-memory/shared_memory_skeleton';
import { IWorkerRuntime } from '../../src/v2/contracts/iworker_runtime';
import { WorkerRuntimeSkeleton } from '../../src/v2/application/runtime/worker_runtime_skeleton';
import { IContextCompiler } from '../../src/v2/contracts/icontext_compiler';
import { ContextCompilerSkeleton } from '../../src/v2/application/context-compiler/context_compiler_skeleton';

describe('SE-OS v2.0 Milestone 0 Skeleton Suite', () => {
  let container: DIContainer;

  beforeEach(() => {
    container = new DIContainer();
    container.registerSingleton<ICompanyBus>('ICompanyBus', new InMemoryCompanyBus());
    container.registerSingleton<IEventStore>('IEventStore', new InMemoryEventStore());
    container.registerSingleton<IScheduler>('IScheduler', new SchedulerSkeleton());
    container.registerSingleton<IPluginRegistry>('IPluginRegistry', new PluginRegistry());
    container.registerSingleton<ISharedMemory>('ISharedMemory', new SharedMemorySkeleton());
    container.register<IWorkerRuntime>('IWorkerRuntime', () => new WorkerRuntimeSkeleton('emp-alice'));
    container.registerSingleton<IContextCompiler>('IContextCompiler', new ContextCompilerSkeleton());
  });

  it('should compile and resolve all v2.0 Kernel interfaces via DI Container', () => {
    const bus = container.resolve<ICompanyBus>('ICompanyBus');
    const store = container.resolve<IEventStore>('IEventStore');
    const scheduler = container.resolve<IScheduler>('IScheduler');
    const registry = container.resolve<IPluginRegistry>('IPluginRegistry');
    const memory = container.resolve<ISharedMemory>('ISharedMemory');
    const runtime = container.resolve<IWorkerRuntime>('IWorkerRuntime');
    const compiler = container.resolve<IContextCompiler>('IContextCompiler');

    expect(bus).toBeDefined();
    expect(store).toBeDefined();
    expect(scheduler).toBeDefined();
    expect(registry).toBeDefined();
    expect(memory).toBeDefined();
    expect(runtime).toBeDefined();
    expect(compiler).toBeDefined();
  });

  it('should publish and receive messages on InMemoryCompanyBus', async () => {
    const bus = container.resolve<ICompanyBus>('ICompanyBus');
    const received: string[] = [];

    bus.subscribe('global', (msg) => {
      received.push(msg.summary);
    });

    await bus.publish({
      id: 'msg-1',
      senderId: 'emp-alice',
      senderRole: 'Lead Architect',
      department: 'global',
      messageType: 'BROADCAST_ADR',
      missionId: 'mission-001',
      summary: 'ADR-001 published',
      timestamp: new Date().toISOString(),
    });

    expect(received.length).toBe(1);
    expect(received[0]).toBe('ADR-001 published');
  });

  it('should store and query domain events in InMemoryEventStore', async () => {
    const store = container.resolve<IEventStore>('IEventStore');

    await store.append({
      eventId: 'evt-101',
      aggregateId: 'mission-100',
      eventType: 'MissionCreated',
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'CEO',
      payload: { title: 'Build plugin system' },
    });

    const stream = await store.readStream('mission-100');
    expect(stream.length).toBe(1);
    expect(stream[0].eventType).toBe('MissionCreated');
  });
});
