import {
  RuntimePluginManifest,
  RuntimeValidationResult,
  RuntimeCompatibility,
  IRuntimePlugin,
} from '../../contracts/iruntime_plugin_system';

export class RuntimePluginLoader {
  private currentKernelVersion = '2.0.0';

  validateManifest(manifest: RuntimePluginManifest): RuntimeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!manifest.id || manifest.id.trim() === '') {
      errors.push('Manifest ID is missing or empty');
    }
    if (!manifest.name || manifest.name.trim() === '') {
      errors.push('Manifest name is missing or empty');
    }
    if (!manifest.version || manifest.version.trim() === '') {
      errors.push('Manifest version is missing or empty');
    }
    if (!manifest.capabilities || manifest.capabilities.length === 0) {
      warnings.push('Manifest specifies zero capabilities');
    }
    if (!manifest.minKernelVersion) {
      errors.push('Manifest missing minKernelVersion');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  isCompatible(manifest: RuntimePluginManifest): RuntimeCompatibility {
    if (!manifest.minKernelVersion) {
      return { compatible: false, reason: 'Missing minKernelVersion requirement' };
    }

    // Basic semver major check
    const minMajor = parseInt(manifest.minKernelVersion.split('.')[0], 10);
    const kernelMajor = parseInt(this.currentKernelVersion.split('.')[0], 10);

    if (kernelMajor < minMajor) {
      return {
        compatible: false,
        reason: `Kernel version ${this.currentKernelVersion} is lower than required minimum ${manifest.minKernelVersion}`,
      };
    }

    if (manifest.maxKernelVersion) {
      const maxMajor = parseInt(manifest.maxKernelVersion.split('.')[0], 10);
      if (kernelMajor > maxMajor) {
        return {
          compatible: false,
          reason: `Kernel version ${this.currentKernelVersion} exceeds maximum ${manifest.maxKernelVersion}`,
        };
      }
    }

    return { compatible: true };
  }

  async loadPlugin(plugin: IRuntimePlugin): Promise<RuntimeValidationResult> {
    const manifest = plugin.metadata();
    const manifestVal = this.validateManifest(manifest);
    if (!manifestVal.valid) {
      return manifestVal;
    }

    const compat = this.isCompatible(manifest);
    if (!compat.compatible) {
      return {
        valid: false,
        errors: [`Incompatible plugin: ${compat.reason}`],
        warnings: manifestVal.warnings,
      };
    }

    const pluginVal = await plugin.validate();
    return {
      valid: pluginVal.valid,
      errors: [...manifestVal.errors, ...pluginVal.errors],
      warnings: [...manifestVal.warnings, ...pluginVal.warnings],
    };
  }
}
