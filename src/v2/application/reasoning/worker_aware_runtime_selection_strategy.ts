import { IRuntimeSelectionStrategy } from '../../contracts/iruntime_selection_strategy';
import { IRuntimePlugin, RuntimeCapability } from '../../contracts/iruntime_plugin_system';
import { ReasoningRequest } from '../../contracts/ireasoning_pipeline';
import { RuntimePluginSystemManager } from '../plugins/runtime_plugin_system_manager';
import { WorkerStore } from '../worker/worker_store';

/**
 * Real per-worker provider routing: each worker's reasoning request is resolved against its own
 * assignedProviderId on the Worker entity itself (WorkerStore is the single source of truth — see
 * ADR-0005), not a single global plugin and not a separate assignment store that could drift from
 * it.
 *
 * - Worker has an explicit assignment and that plugin is registered+enabled: use it, even if the
 *   underlying CLI isn't actually installed — the plugin's own execute() already reports that
 *   honestly rather than silently rerouting to a different worker's provider.
 * - Worker has an explicit assignment but the plugin isn't registered/enabled: no plugin is
 *   returned. Silently falling back to another provider would contradict the assignment the user
 *   made; the caller gets an honest "no plugin available" reasoning failure instead.
 * - Worker has no assignment, or isn't a real registered worker at all (e.g. planning's
 *   'emp-planner'): falls back to a sensible default so unassigned/virtual callers aren't stuck.
 */
export class WorkerAwareRuntimeSelectionStrategy implements IRuntimeSelectionStrategy {
  constructor(
    private pluginSystemManager: RuntimePluginSystemManager,
    private workerStore: WorkerStore,
    private defaultPluginId: string = 'plugin-claude-code'
  ) {}

  async selectPlugin(
    capability: RuntimeCapability = 'Reasoning',
    request: ReasoningRequest
  ): Promise<IRuntimePlugin | undefined> {
    const assignedPluginId = this.workerStore.get(request.workerId)?.assignedProviderId;

    if (assignedPluginId) {
      return this.pluginSystemManager.getPlugin(assignedPluginId);
    }

    const defaultPlugin = this.pluginSystemManager.getPlugin(this.defaultPluginId);
    if (defaultPlugin) return defaultPlugin;

    const available = this.pluginSystemManager.getPluginsByCapability(capability);
    return available[0];
  }

  /** Real effect for the TUI's "Select Active Runtime Provider" screen (see M29.1 Fix #11 /
   * ADR-0011): changes which plugin unassigned/virtual callers (e.g. AutonomousPlanner's
   * 'emp-planner', or any future worker created with no explicit provider) fall back to. Never
   * overrides a real worker's own per-role assignment — that stays worker-owned, per ADR-0005. */
  setDefaultPluginId(pluginId: string): void {
    this.defaultPluginId = pluginId;
  }

  getDefaultPluginId(): string {
    return this.defaultPluginId;
  }
}
