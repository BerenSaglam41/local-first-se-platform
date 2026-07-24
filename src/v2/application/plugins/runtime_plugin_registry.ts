import { EventEmitter } from 'events';
import {
  IRuntimePlugin,
  RuntimePluginManifest,
  RuntimeCapability,
  RuntimePluginHealth,
  RuntimeValidationResult,
} from '../../contracts/iruntime_plugin_system';

export interface RegisteredRuntimePluginRecord {
  plugin: IRuntimePlugin;
  manifest: RuntimePluginManifest;
  enabled: boolean;
  validationResult: RuntimeValidationResult;
  health: RuntimePluginHealth;
}

export class RuntimePluginRegistry extends EventEmitter {
  private plugins = new Map<string, RegisteredRuntimePluginRecord>();
  private capabilityMap = new Map<RuntimeCapability, Set<string>>();

  register(plugin: IRuntimePlugin, validationResult: RuntimeValidationResult): void {
    const manifest = plugin.metadata();
    const now = new Date().toISOString();
    const record: RegisteredRuntimePluginRecord = {
      plugin,
      manifest,
      enabled: true,
      validationResult,
      health: {
        status: 'Healthy',
        metrics: { registeredAt: now },
        lastCheck: now,
      },
    };

    this.plugins.set(manifest.id, record);

    for (const cap of manifest.capabilities) {
      if (!this.capabilityMap.has(cap)) {
        this.capabilityMap.set(cap, new Set());
      }
      this.capabilityMap.get(cap)!.add(manifest.id);
    }

    this.emit('registered', manifest.id);
  }

  unregister(pluginId: string): boolean {
    const record = this.plugins.get(pluginId);
    if (!record) return false;

    for (const cap of record.manifest.capabilities) {
      const set = this.capabilityMap.get(cap);
      if (set) {
        set.delete(pluginId);
      }
    }

    this.plugins.delete(pluginId);
    this.emit('unregistered', pluginId);
    return true;
  }

  enable(pluginId: string): boolean {
    const record = this.plugins.get(pluginId);
    if (record) {
      record.enabled = true;
      this.emit('enabled', pluginId);
      return true;
    }
    return false;
  }

  disable(pluginId: string): boolean {
    const record = this.plugins.get(pluginId);
    if (record) {
      record.enabled = false;
      this.emit('disabled', pluginId);
      return true;
    }
    return false;
  }

  getRecord(pluginId: string): RegisteredRuntimePluginRecord | undefined {
    return this.plugins.get(pluginId);
  }

  getPlugin(pluginId: string): IRuntimePlugin | undefined {
    const record = this.plugins.get(pluginId);
    return record && record.enabled ? record.plugin : undefined;
  }

  getPluginsByCapability(capability: RuntimeCapability): IRuntimePlugin[] {
    const set = this.capabilityMap.get(capability);
    if (!set) return [];

    const result: IRuntimePlugin[] = [];
    for (const id of set) {
      const record = this.plugins.get(id);
      if (record && record.enabled) {
        result.push(record.plugin);
      }
    }
    return result;
  }

  listManifests(): RuntimePluginManifest[] {
    return Array.from(this.plugins.values()).map((r) => r.manifest);
  }

  listRecords(): RegisteredRuntimePluginRecord[] {
    return Array.from(this.plugins.values());
  }

  updateHealth(pluginId: string, health: RuntimePluginHealth): void {
    const record = this.plugins.get(pluginId);
    if (record) {
      record.health = health;
    }
  }
}
