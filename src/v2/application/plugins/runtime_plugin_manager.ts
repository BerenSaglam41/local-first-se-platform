import * as fs from 'fs';
import * as path from 'path';
import { IRuntimePlugin, PluginManifest, CapabilityType, PluginHealthStatus } from '../../contracts/iplugin_framework';
import { CapabilityRegistry } from './capability_registry';
import { PluginLoader } from './plugin_loader';
import { PluginSandbox } from './plugin_sandbox';

export interface ManagedPluginRecord {
  plugin: IRuntimePlugin;
  sandbox: PluginSandbox;
  enabled: boolean;
}

export class RuntimePluginManager {
  private plugins = new Map<string, ManagedPluginRecord>();
  private capabilityRegistry = new CapabilityRegistry();
  private loader = new PluginLoader();

  async registerPlugin(plugin: IRuntimePlugin): Promise<boolean> {
    const meta = plugin.metadata();
    if (!this.loader.validateManifest(meta) || !this.loader.isCompatible(meta)) {
      return false;
    }

    const sandbox = new PluginSandbox(plugin);
    const initialized = await sandbox.safeInitialize();
    if (!initialized) return false;

    this.plugins.set(meta.id, { plugin, sandbox, enabled: true });
    this.capabilityRegistry.registerPluginCapabilities(meta.id, plugin.capabilities());
    return true;
  }

  async unloadPlugin(pluginId: string): Promise<boolean> {
    const record = this.plugins.get(pluginId);
    if (!record) return false;

    await record.sandbox.safeShutdown();
    this.capabilityRegistry.unregisterPluginCapabilities(pluginId);
    this.plugins.delete(pluginId);
    return true;
  }

  enablePlugin(pluginId: string): boolean {
    const record = this.plugins.get(pluginId);
    if (record) {
      record.enabled = true;
      return true;
    }
    return false;
  }

  disablePlugin(pluginId: string): boolean {
    const record = this.plugins.get(pluginId);
    if (record) {
      record.enabled = false;
      return true;
    }
    return false;
  }

  getPlugin(pluginId: string): IRuntimePlugin | undefined {
    const record = this.plugins.get(pluginId);
    return record && record.enabled ? record.plugin : undefined;
  }

  getSandbox(pluginId: string): PluginSandbox | undefined {
    const record = this.plugins.get(pluginId);
    return record && record.enabled ? record.sandbox : undefined;
  }

  listPlugins(): PluginManifest[] {
    return Array.from(this.plugins.values())
      .filter((r) => r.enabled)
      .map((r) => r.plugin.metadata());
  }

  async healthCheckAll(): Promise<Record<string, PluginHealthStatus>> {
    const results: Record<string, PluginHealthStatus> = {};
    for (const [id, record] of this.plugins.entries()) {
      if (record.enabled) {
        results[id] = await record.sandbox.safeHealth();
      }
    }
    return results;
  }

  getCapabilityRegistry(): CapabilityRegistry {
    return this.capabilityRegistry;
  }
}
