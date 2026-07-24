import { ICompanyBus } from './icompany_bus';
import { ISharedMemory } from './ishared_memory';
import { IScheduler } from './ischeduler';
import { IPluginRegistry } from './iplugin_registry';
import { IEventStore } from './ievent_store';

export interface IKernel {
  boot(configPath: string): Promise<void>;
  shutdown(signal?: string): Promise<void>;
  getSharedMemory(): ISharedMemory;
  getCompanyBus(): ICompanyBus;
  getScheduler(): IScheduler;
  getPluginRegistry(): IPluginRegistry;
  getEventStore(): IEventStore;
}
