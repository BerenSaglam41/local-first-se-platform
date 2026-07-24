import { IEventStore } from '../../contracts/ievent_store';
import { IRuntimePlugin } from '../../contracts/iruntime_plugin_system';
import { ClaudeCodeRuntimePlugin, ClaudeProcessSpawner } from '../plugins/claude/claude_code_runtime_plugin';
import { ClaudeCliDetector } from '../plugins/claude/claude_cli_detector';
import { CliRuntimePlugin, CliRuntimePluginConfig } from '../plugins/cli_runtime_plugin';
import { CliProcessSpawner } from '../plugins/cli_process_executor';
import { CliDetector } from '../plugins/cli_detector';
import { PROVIDER_CATALOG } from './provider_catalog';
import { Kernel } from '../../kernel/kernel';

/**
 * All vendor-specific default-provider knowledge lives here, deliberately outside kernel.ts.
 * The kernel itself only knows generic IRuntimePlugin instances and WorkerStore's
 * assignedProviderId field — see kernel.ts's own architecture test
 * (milestone4_claude_plugin.test.ts: "ZERO Claude-specific imports exist in src/v2/kernel/").
 */

export interface DefaultProviderOverrides {
  claudeSpawner?: ClaudeProcessSpawner;
  claudeDetector?: ClaudeCliDetector;
  /** Applied to every catalog provider uniformly (see Kernel.registerDefaultProviders docs). */
  catalogSpawner?: CliProcessSpawner;
  catalogDetectorFactory?: (config: CliRuntimePluginConfig) => CliDetector;
}

const DEFAULT_ROLE_PROVIDER_MAP: Array<{ match: RegExp; pluginId: string }> = [
  { match: /architect/i, pluginId: 'plugin-claude-code' },
  { match: /backend/i, pluginId: 'plugin-codex-cli' },
  { match: /frontend/i, pluginId: 'plugin-claude-code' },
  { match: /qa|quality/i, pluginId: 'plugin-gemini-cli' },
  { match: /doc/i, pluginId: 'plugin-antigravity' },
  { match: /research/i, pluginId: 'plugin-openai-cli' },
];
const DEFAULT_FALLBACK_PROVIDER_ID = 'plugin-claude-code';

export function buildDefaultProviderPlugins(
  eventStore: IEventStore | undefined,
  overrides?: DefaultProviderOverrides
): IRuntimePlugin[] {
  const plugins: IRuntimePlugin[] = [
    new ClaudeCodeRuntimePlugin(eventStore, overrides?.claudeSpawner, overrides?.claudeDetector),
  ];
  for (const config of PROVIDER_CATALOG) {
    const detector = overrides?.catalogDetectorFactory?.(config);
    plugins.push(new CliRuntimePlugin(config, eventStore, overrides?.catalogSpawner, detector));
  }
  return plugins;
}

export function resolveDefaultProviderIdForRole(role: string): string {
  const mapping = DEFAULT_ROLE_PROVIDER_MAP.find((m) => m.match.test(role));
  return mapping?.pluginId || DEFAULT_FALLBACK_PROVIDER_ID;
}

/**
 * Registers the real provider roster and assigns each currently-spawned worker its own provider
 * by role, per-worker rather than one shared global runtime. A free function (not a Kernel
 * method) precisely so the kernel never needs to import a vendor-specific plugin class.
 */
export async function registerDefaultProviders(kernel: Kernel, overrides?: DefaultProviderOverrides): Promise<void> {
  const plugins = buildDefaultProviderPlugins(kernel.getEventStore(), overrides);
  await kernel.registerProviderPlugins(plugins);

  for (const worker of kernel.getWorkerStore().list()) {
    worker.assignedProviderId = resolveDefaultProviderIdForRole(worker.role);
  }
}
