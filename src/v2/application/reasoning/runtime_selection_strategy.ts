import { IRuntimeSelectionStrategy } from '../../contracts/iruntime_selection_strategy';
import { IRuntimePlugin, RuntimeCapability } from '../../contracts/iruntime_plugin_system';
import { ReasoningRequest } from '../../contracts/ireasoning_pipeline';
import { RuntimePluginSystemManager } from '../plugins/runtime_plugin_system_manager';

export class DefaultRuntimeSelectionStrategy implements IRuntimeSelectionStrategy {
  constructor(private pluginSystemManager: RuntimePluginSystemManager) {}

  async selectPlugin(
    capability: RuntimeCapability = 'Reasoning',
    request: ReasoningRequest
  ): Promise<IRuntimePlugin | undefined> {
    // Prefer plugin-claude-code if registered & enabled
    const claudePlugin = this.pluginSystemManager.getPlugin('plugin-claude-code');
    if (claudePlugin) {
      return claudePlugin;
    }

    // Otherwise, query system for plugins with capability
    const available = this.pluginSystemManager.getPluginsByCapability(capability);
    if (available.length > 0) {
      return available[0]; // First matching plugin
    }

    return undefined;
  }
}
