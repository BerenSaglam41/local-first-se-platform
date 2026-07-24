import { IPluginRegistry, IRuntimePlugin, PluginManifest } from '../../contracts/iplugin_registry';

export class PluginRegistry implements IPluginRegistry {
  private plugins = new Map<string, IRuntimePlugin>();

  async register(plugin: IRuntimePlugin): Promise<void> {
    if (this.validate(plugin.manifest)) {
      this.plugins.set(plugin.manifest.id, plugin);
    }
  }

  async unregister(pluginId: string): Promise<void> {
    this.plugins.delete(pluginId);
  }

  async discover(pluginsDir: string): Promise<PluginManifest[]> {
    return Array.from(this.plugins.values()).map(p => p.manifest);
  }

  async load(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      await plugin.onLoad();
    }
  }

  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      await plugin.onUnload();
    }
  }

  validate(manifest: PluginManifest): boolean {
    return Boolean(manifest && manifest.id && manifest.version);
  }

  getPlugin(pluginId: string): IRuntimePlugin | undefined {
    return this.plugins.get(pluginId);
  }
}
