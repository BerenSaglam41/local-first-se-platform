export type CapabilityType =
  | 'CODE_GENERATION'
  | 'ARCHITECTURE'
  | 'CODE_REVIEW'
  | 'TEST_GENERATION'
  | 'DEBUGGING'
  | 'DOCUMENTATION'
  | 'STATIC_ANALYSIS';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minKernelVersion: string;
  entryPoint: string;
  capabilities: CapabilityType[];
  supportedPlatforms?: string[];
  healthCheck?: {
    endpoint?: string;
    intervalMs?: number;
  };
  dependencies?: Record<string, string>;
}

export interface WorkerSpawnConfig {
  workerId: string;
  name: string;
  role: string;
  department: string;
  executable?: string;
  args?: string[];
  environment?: Record<string, string>;
}

export interface IWorkerHandle {
  workerId: string;
  pid: number;
  status: 'IDLE' | 'BUSY' | 'STOPPED';
}

export interface PluginHealthStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  metrics?: Record<string, any>;
}

export interface IRuntimePlugin {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  spawnWorker(config: WorkerSpawnConfig): Promise<IWorkerHandle>;
  stopWorker(workerId: string): Promise<boolean>;
  restartWorker(workerId: string): Promise<IWorkerHandle>;
  execute(taskPayload: Record<string, any>): Promise<Record<string, any>>;
  health(): Promise<PluginHealthStatus>;
  capabilities(): CapabilityType[];
  metadata(): PluginManifest;
}
