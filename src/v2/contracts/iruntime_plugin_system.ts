export type RuntimeCapability = 'Reasoning' | 'Cancellation' | 'ToolExecution' | 'FileAccess';

export type RuntimePluginHealthState = 'Healthy' | 'Degraded' | 'Unavailable' | 'Restarting';
export type RuntimeAuthenticationStatus = 'AUTHENTICATED' | 'NOT_AUTHENTICATED' | 'UNKNOWN';

export interface RuntimePluginHealth {
  status: RuntimePluginHealthState;
  metrics?: Record<string, any>;
  lastCheck: string;
}

export interface RuntimePluginManifest {
  id: string;
  name: string;
  version: string;
  capabilities: RuntimeCapability[];
  minKernelVersion: string;
  maxKernelVersion: string;
  healthCheckSupport: boolean;
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

/**
 * A runtime plugin executes one real, non-interactive request at a time for a given worker.
 * There is no session attach/detach and no streaming — see ADR-0005: both were 100% simulated
 * (a hardcoded 50ms timer) and have been removed rather than kept as a fake capability. Real
 * multi-turn continuity, where a provider genuinely supports it, travels through execute()'s
 * taskPayload (conversationSessionId/resumeConversation), not through a session object.
 */
export interface IRuntimePlugin {
  initialize(config?: RuntimeConfiguration): Promise<void>;
  validate(): Promise<RuntimeValidationResult>;
  execute(taskPayload: Record<string, any>): Promise<Record<string, any>>;
  /** Kills the real in-flight process for this worker, if any. */
  cancel(workerId: string): Promise<boolean>;
  heartbeat(): Promise<RuntimePluginHealth>;
  shutdown(): Promise<void>;
  capabilities(): RuntimeCapability[];
  metadata(): RuntimePluginManifest;
  /** Read-only local CLI account check. Plugins must never perform login automatically. */
  authenticationStatus?(): { status: RuntimeAuthenticationStatus; detail?: string };
}
