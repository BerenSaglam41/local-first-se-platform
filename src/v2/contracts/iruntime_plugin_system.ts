import { TransportType } from './iruntime_transport';
import { IRuntimeSession, SessionStreamOptions, SessionStreamResult } from './iruntime_session';

export type RuntimeCapability =
  | 'Reasoning'
  | 'Streaming'
  | 'Cancellation'
  | 'InteractiveSession'
  | 'ToolExecution'
  | 'FileAccess';

export type RuntimePluginHealthState = 'Healthy' | 'Degraded' | 'Unavailable' | 'Restarting';

export interface RuntimePluginHealth {
  status: RuntimePluginHealthState;
  metrics?: Record<string, any>;
  lastCheck: string;
}

export interface RuntimePluginManifest {
  id: string;
  name: string;
  version: string;
  supportedTransports: TransportType[];
  capabilities: RuntimeCapability[];
  minKernelVersion: string;
  maxKernelVersion: string;
  healthCheckSupport: boolean;
  streamingSupport: boolean;
  cancellationSupport: boolean;
}

export interface RuntimeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RuntimeCompatibility {
  compatible: boolean;
  reason?: string;
}

export interface RuntimeConfiguration {
  environment?: Record<string, string>;
  options?: Record<string, any>;
}

export interface IRuntimePlugin {
  initialize(config?: RuntimeConfiguration): Promise<void>;
  validate(): Promise<RuntimeValidationResult>;
  attachSession(session: IRuntimeSession): Promise<boolean>;
  detachSession(sessionId: string): Promise<boolean>;
  execute(taskPayload: Record<string, any>): Promise<Record<string, any>>;
  cancel(sessionId: string): Promise<boolean>;
  stream(sessionId: string, input: string, options?: SessionStreamOptions): Promise<SessionStreamResult>;
  heartbeat(): Promise<RuntimePluginHealth>;
  shutdown(): Promise<void>;
  capabilities(): RuntimeCapability[];
  metadata(): RuntimePluginManifest;
}
