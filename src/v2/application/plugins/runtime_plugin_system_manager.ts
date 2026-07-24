import { EventEmitter } from 'events';
import { RuntimePluginRegistry } from './runtime_plugin_registry';
import { RuntimePluginLoader } from './runtime_plugin_loader';
import {
  IRuntimePlugin,
  RuntimePluginManifest,
  RuntimeValidationResult,
  RuntimeCapability,
  RuntimeConfiguration,
} from '../../contracts/iruntime_plugin_system';
import { IEventStore } from '../../contracts/ievent_store';

export class RuntimePluginSystemManager extends EventEmitter {
  private registry = new RuntimePluginRegistry();
  private loader = new RuntimePluginLoader();

  constructor(private eventStore?: IEventStore) {
    super();
  }

  async loadAndRegisterPlugin(
    plugin: IRuntimePlugin,
    config?: RuntimeConfiguration
  ): Promise<RuntimeValidationResult> {
    const manifest = plugin.metadata();

    // Registering a second plugin under an id that's already registered (e.g.
    // registerDefaultProviders() called twice) would otherwise silently overwrite the registry
    // entry via a plain Map.set, orphaning the old instance's real in-flight child process —
    // unreachable via cancel() forever, since the registry would only ever return the new
    // instance for that id from then on. Shut the old one down cleanly first.
    const existing = this.registry.getRecord(manifest.id)?.plugin;
    if (existing && existing !== plugin) {
      await existing.shutdown().catch(() => {});
      this.registry.unregister(manifest.id);
    }

    const validationResult = await this.loader.loadPlugin(plugin);
    this.emitEvent('RuntimePluginValidated', manifest.id, {
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
    });

    if (!validationResult.valid) {
      this.emitEvent('RuntimePluginFailed', manifest.id, {
        reason: 'Validation failed',
        errors: validationResult.errors,
      });
      return validationResult;
    }

    try {
      await plugin.initialize(config);
      this.emitEvent('RuntimePluginInitialized', manifest.id, { name: manifest.name, version: manifest.version });
    } catch (err: any) {
      this.emitEvent('RuntimePluginFailed', manifest.id, { reason: err.message });
      return {
        valid: false,
        errors: [err.message],
        warnings: [],
      };
    }

    this.registry.register(plugin, validationResult);
    this.emitEvent('RuntimePluginLoaded', manifest.id, { capabilities: manifest.capabilities });
    this.emitEvent('RuntimePluginEnabled', manifest.id, {});

    return validationResult;
  }

  enablePlugin(pluginId: string): boolean {
    const ok = this.registry.enable(pluginId);
    if (ok) {
      this.emitEvent('RuntimePluginEnabled', pluginId, {});
    }
    return ok;
  }

  disablePlugin(pluginId: string): boolean {
    const ok = this.registry.disable(pluginId);
    if (ok) {
      this.emitEvent('RuntimePluginDisabled', pluginId, {});
    }
    return ok;
  }

  async unloadPlugin(pluginId: string): Promise<boolean> {
    const record = this.registry.getRecord(pluginId);
    if (!record) return false;

    try {
      await record.plugin.shutdown();
      this.emitEvent('RuntimePluginShutdown', pluginId, {});
    } catch (err) {
      // Ignore shutdown errors
    }

    return this.registry.unregister(pluginId);
  }

  getPlugin(pluginId: string): IRuntimePlugin | undefined {
    return this.registry.getPlugin(pluginId);
  }

  getPluginsByCapability(capability: RuntimeCapability): IRuntimePlugin[] {
    return this.registry.getPluginsByCapability(capability);
  }

  listPlugins(): RuntimePluginManifest[] {
    return this.registry.listManifests();
  }

  async runHealthChecks(): Promise<Record<string, any>> {
    const report: Record<string, any> = {};
    for (const record of this.registry.listRecords()) {
      if (record.enabled) {
        try {
          const health = await record.plugin.heartbeat();
          this.registry.updateHealth(record.manifest.id, health);
          report[record.manifest.id] = health;
        } catch (err: any) {
          const unavail = { status: 'Unavailable', lastCheck: new Date().toISOString(), error: err.message };
          report[record.manifest.id] = unavail;
          this.emitEvent('RuntimePluginFailed', record.manifest.id, { reason: err.message });
        }
      }
    }
    return report;
  }

  getRegistry(): RuntimePluginRegistry {
    return this.registry;
  }

  getLoader(): RuntimePluginLoader {
    return this.loader;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: any): void {
    const evt = {
      eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      aggregateId,
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'RuntimePluginSystemManager',
      payload,
    };
    this.emit(eventType, evt);
    if (this.eventStore) {
      this.eventStore.append(evt).catch(() => {});
    }
  }
}
