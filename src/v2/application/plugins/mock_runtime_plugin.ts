import {
  IRuntimePlugin,
  RuntimePluginManifest,
  RuntimeCapability,
  RuntimeValidationResult,
  RuntimePluginHealth,
  RuntimeConfiguration,
} from '../../contracts/iruntime_plugin_system';

/** Honestly-named mock reference plugin — the fallback used only when a worker has no real
 * provider assigned and none is registered. Never claims to be real. */
export class MockRuntimePlugin implements IRuntimePlugin {
  private isInitialized = false;

  private manifest: RuntimePluginManifest = {
    id: 'mock-runtime-plugin',
    name: 'Mock Reference Runtime Plugin',
    version: '1.0.0',
    capabilities: ['Reasoning', 'Cancellation', 'ToolExecution', 'FileAccess'],
    minKernelVersion: '2.0.0',
    maxKernelVersion: '2.9.9',
    healthCheckSupport: true,
    cancellationSupport: true,
  };

  async initialize(config?: RuntimeConfiguration): Promise<void> {
    this.isInitialized = true;
  }

  async validate(): Promise<RuntimeValidationResult> {
    return {
      valid: true,
      errors: [],
      warnings: [],
    };
  }

  async execute(taskPayload: Record<string, any>): Promise<Record<string, any>> {
    return {
      success: true,
      output: `Executed mock task: ${taskPayload.title || 'Task'}`,
      timestamp: new Date().toISOString(),
    };
  }

  async cancel(workerId: string): Promise<boolean> {
    return false;
  }

  async heartbeat(): Promise<RuntimePluginHealth> {
    return {
      status: this.isInitialized ? 'Healthy' : 'Unavailable',
      metrics: {},
      lastCheck: new Date().toISOString(),
    };
  }

  async shutdown(): Promise<void> {
    this.isInitialized = false;
  }

  capabilities(): RuntimeCapability[] {
    return this.manifest.capabilities;
  }

  metadata(): RuntimePluginManifest {
    return this.manifest;
  }
}
