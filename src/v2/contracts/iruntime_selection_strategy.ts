import { IRuntimePlugin, RuntimeCapability } from './iruntime_plugin_system';
import { ReasoningRequest } from './ireasoning_pipeline';

export interface IRuntimeSelectionStrategy {
  /**
   * Selects the best available IRuntimePlugin for a given capability and reasoning request.
   */
  selectPlugin(
    capability: RuntimeCapability,
    request: ReasoningRequest
  ): Promise<IRuntimePlugin | undefined>;
}
