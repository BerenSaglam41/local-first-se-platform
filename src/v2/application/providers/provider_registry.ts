import { RuntimePluginSystemManager } from '../plugins/runtime_plugin_system_manager';
import { RuntimePluginHealthState } from '../../contracts/iruntime_plugin_system';

export interface ProviderInfo {
  id: string;
  name: string;
  installed: boolean;
  enabled: boolean;
  version?: string;
  executablePath?: string;
  health: RuntimePluginHealthState;
}

/**
 * Real provider status, read directly from the plugin system that actually executes tasks —
 * replaces the old ProviderManager/ProviderDetector, which reported hardcoded fake data
 * disconnected from what execution actually used. There is exactly one source of truth now:
 * whatever RuntimePluginSystemManager has registered is what both execution and this display
 * layer see. A provider is never reported installed unless its plugin's own real detection says
 * so.
 */
export class ProviderRegistry {
  constructor(private pluginSystemManager: RuntimePluginSystemManager) {}

  listProviders(): ProviderInfo[] {
    return this.pluginSystemManager
      .getRegistry()
      .listRecords()
      .map((record) => {
        const plugin: any = record.plugin;
        const detection =
          typeof plugin.getDetectionResult === 'function' ? plugin.getDetectionResult() : undefined;

        return {
          id: record.manifest.id,
          name: record.manifest.name,
          // Plugins with no CLI detection concept (e.g. the built-in mock reference plugin)
          // are not "installed" in the provider sense — they're always available by design.
          installed: detection ? !!detection.available : true,
          enabled: record.enabled,
          version: detection?.version,
          executablePath: detection?.executablePath,
          health: record.health.status,
        };
      });
  }

  enable(providerId: string): boolean {
    return this.pluginSystemManager.enablePlugin(providerId);
  }

  disable(providerId: string): boolean {
    return this.pluginSystemManager.disablePlugin(providerId);
  }
}
