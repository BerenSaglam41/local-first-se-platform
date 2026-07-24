import { CapabilityType } from '../../contracts/iplugin_framework';

export class CapabilityRegistry {
  private capabilityMap = new Map<CapabilityType, Set<string>>();

  registerPluginCapabilities(pluginId: string, capabilities: CapabilityType[]): void {
    for (const cap of capabilities) {
      if (!this.capabilityMap.has(cap)) {
        this.capabilityMap.set(cap, new Set());
      }
      this.capabilityMap.get(cap)!.add(pluginId);
    }
  }

  unregisterPluginCapabilities(pluginId: string): void {
    for (const set of this.capabilityMap.values()) {
      set.delete(pluginId);
    }
  }

  findPluginsForCapability(capability: CapabilityType): string[] {
    const set = this.capabilityMap.get(capability);
    return set ? Array.from(set) : [];
  }

  hasCapability(pluginId: string, capability: CapabilityType): boolean {
    const set = this.capabilityMap.get(capability);
    return set ? set.has(pluginId) : false;
  }

  getAllCapabilities(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [cap, set] of this.capabilityMap.entries()) {
      result[cap] = Array.from(set);
    }
    return result;
  }
}
