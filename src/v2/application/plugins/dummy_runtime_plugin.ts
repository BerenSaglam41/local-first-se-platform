import { IRuntimePlugin, PluginManifest } from '../../contracts/iplugin_registry';

export class DummyRuntimePlugin implements IRuntimePlugin {
  manifest: PluginManifest = {
    id: 'plugin-dummy-runtime',
    name: 'Dummy Testing Runtime Engine',
    version: '1.0.0',
    entryPoint: 'dummy_worker.js',
    minKernelVersion: '2.0.0',
    capabilities: ['CODE_GENERATION', 'TESTING'],
  };

  async onLoad(): Promise<void> {}
  async onUnload(): Promise<void> {}
}
