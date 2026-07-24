import * as fs from 'fs';
import * as path from 'path';
import { PluginManifest } from '../../contracts/iplugin_framework';

export class PluginLoader {
  private currentKernelVersion = '2.0.0';

  validateManifest(manifest: any): manifest is PluginManifest {
    if (!manifest || typeof manifest !== 'object') return false;
    if (typeof manifest.id !== 'string' || !manifest.id) return false;
    if (typeof manifest.name !== 'string' || !manifest.name) return false;
    if (typeof manifest.version !== 'string' || !manifest.version) return false;
    if (!Array.isArray(manifest.capabilities)) return false;
    return true;
  }

  isCompatible(manifest: PluginManifest): boolean {
    if (!manifest.minKernelVersion) return true;
    const reqMajor = parseInt(manifest.minKernelVersion.split('.')[0] || '2', 10);
    const currMajor = parseInt(this.currentKernelVersion.split('.')[0] || '2', 10);
    return reqMajor <= currMajor;
  }

  loadManifestFromDir(pluginDir: string): PluginManifest | null {
    const manifestPath = path.join(pluginDir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return null;

    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (this.validateManifest(parsed) && this.isCompatible(parsed)) {
        return parsed;
      }
    } catch (err) {
      console.warn(`[PluginLoader] Failed to parse manifest at ${manifestPath}`);
    }
    return null;
  }
}
