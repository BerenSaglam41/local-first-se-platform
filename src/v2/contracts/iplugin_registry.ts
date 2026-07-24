export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entryPoint: string;
  minKernelVersion: string;
  capabilities: string[];
}

export interface IRuntimePlugin {
  manifest: PluginManifest;
  onLoad(): Promise<void>;
  onUnload(): Promise<void>;
}

export interface IPluginRegistry {
  register(plugin: IRuntimePlugin): Promise<void>;
  unregister(pluginId: string): Promise<void>;
  discover(pluginsDir: string): Promise<PluginManifest[]>;
  load(pluginId: string): Promise<void>;
  unload(pluginId: string): Promise<void>;
  validate(manifest: PluginManifest): boolean;
  getPlugin(pluginId: string): IRuntimePlugin | undefined;
}
