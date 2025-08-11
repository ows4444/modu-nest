import { Injectable, Logger } from '@nestjs/common';
import { IGuardRegistry, IGuardMetadata } from '@libs/shared-interfaces';

/**
 * Bridge service for guard operations to prevent circular dependencies
 * 
 * This service acts as an abstraction layer between plugin-services
 * and other parts of the system that need guard functionality,
 * preventing tight coupling and circular dependency issues.
 */
@Injectable()
export class GuardBridgeService {
  private readonly logger = new Logger(GuardBridgeService.name);
  private readonly registries = new Set<IGuardRegistry>();
  private readonly guardMetadata = new Map<string, IGuardMetadata>();

  /**
   * Register a guard registry
   */
  registerRegistry(registry: IGuardRegistry): void {
    this.registries.add(registry);
    this.logger.debug('Guard registry registered');
  }

  /**
   * Unregister a guard registry
   */
  unregisterRegistry(registry: IGuardRegistry): void {
    this.registries.delete(registry);
    this.logger.debug('Guard registry unregistered');
  }

  /**
   * Register guard metadata
   */
  registerGuard(pluginName: string, guardMetadata: IGuardMetadata): void {
    const key = `${pluginName}:${guardMetadata.name}`;
    this.guardMetadata.set(key, guardMetadata);

    // Propagate to all registries
    this.registries.forEach(registry => {
      try {
        registry.register(pluginName, guardMetadata);
      } catch (error) {
        this.logger.error(`Failed to register guard ${guardMetadata.name} with registry:`, error);
      }
    });

    this.logger.debug(`Guard ${guardMetadata.name} registered for plugin ${pluginName}`);
  }

  /**
   * Unregister a guard
   */
  unregisterGuard(pluginName: string, guardName: string): void {
    const key = `${pluginName}:${guardName}`;
    this.guardMetadata.delete(key);

    // Propagate to all registries
    this.registries.forEach(registry => {
      try {
        registry.unregister(pluginName, guardName);
      } catch (error) {
        this.logger.error(`Failed to unregister guard ${guardName} from registry:`, error);
      }
    });

    this.logger.debug(`Guard ${guardName} unregistered from plugin ${pluginName}`);
  }

  /**
   * Find a guard
   */
  findGuard(guardName: string): IGuardMetadata | undefined {
    // First check our local metadata
    for (const [key, metadata] of this.guardMetadata) {
      if (metadata.name === guardName) {
        return metadata;
      }
    }

    // Then check registries
    for (const registry of this.registries) {
      try {
        const guard = registry.find(guardName);
        if (guard) {
          return guard;
        }
      } catch (error) {
        this.logger.error(`Error finding guard ${guardName} in registry:`, error);
      }
    }

    return undefined;
  }

  /**
   * Check if a plugin can use a specific guard
   */
  canPluginUseGuard(pluginName: string, guardName: string): boolean {
    // Check with all registries
    for (const registry of this.registries) {
      try {
        if (registry.canPluginUseGuard(pluginName, guardName)) {
          return true;
        }
      } catch (error) {
        this.logger.error(`Error checking guard permission for ${pluginName}:${guardName}:`, error);
      }
    }

    // Fallback: check our own metadata for basic rules
    const guard = this.findGuard(guardName);
    if (!guard) {
      return false;
    }

    // Allow if same plugin
    if (guard.source === pluginName) {
      return true;
    }

    // Allow if exported
    if (guard.exported) {
      return true;
    }

    // Allow if external scope
    if (guard.scope === 'external') {
      return true;
    }

    return false;
  }

  /**
   * Get all guards for a plugin
   */
  getPluginGuards(pluginName: string): IGuardMetadata[] {
    const guards: IGuardMetadata[] = [];

    for (const [key, metadata] of this.guardMetadata) {
      if (metadata.source === pluginName) {
        guards.push(metadata);
      }
    }

    return guards;
  }

  /**
   * Get all available guards for a plugin
   */
  getAvailableGuards(pluginName: string): IGuardMetadata[] {
    const guards: IGuardMetadata[] = [];

    for (const metadata of this.guardMetadata.values()) {
      if (this.canPluginUseGuard(pluginName, metadata.name)) {
        guards.push(metadata);
      }
    }

    return guards;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const pluginCounts = new Map<string, number>();

    for (const metadata of this.guardMetadata.values()) {
      const count = pluginCounts.get(metadata.source) || 0;
      pluginCounts.set(metadata.source, count + 1);
    }

    return {
      totalGuards: this.guardMetadata.size,
      totalPlugins: pluginCounts.size,
      totalRegistries: this.registries.size,
      pluginBreakdown: Object.fromEntries(pluginCounts),
    };
  }

  /**
   * Clear all guards (for testing)
   */
  clearAll(): void {
    this.guardMetadata.clear();
    this.registries.clear();
    this.logger.warn('All guards and registries cleared');
  }
}