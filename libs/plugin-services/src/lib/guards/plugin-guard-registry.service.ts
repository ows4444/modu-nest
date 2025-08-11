import { Injectable, Logger, Global } from '@nestjs/common';
import { PluginGuardRegistry, RegisteredPluginGuard, PluginGuard } from '@libs/plugin-decorators';

@Global()
@Injectable()
export class PluginGuardRegistryService implements PluginGuardRegistry {
  private readonly logger = new Logger(PluginGuardRegistryService.name);
  private readonly guards = new Map<string, RegisteredPluginGuard>();

  registerGuard(guard: RegisteredPluginGuard): void {
    const { name } = guard.metadata;

    if (this.guards.has(name)) {
      this.logger.warn(`Guard '${name}' is already registered. Overriding with new guard'.`);
    }

    this.guards.set(name, guard);
    this.logger.log(`Registered guard '${name}'`);
  }

  getGuard(name: string): RegisteredPluginGuard | undefined {
    return this.guards.get(name);
  }

  getGuardsByPlugin(pluginName: string): RegisteredPluginGuard[] {
    return Array.from(this.guards.values()).filter((guard) => guard.metadata.source === pluginName);
  }

  getAllGuards(): RegisteredPluginGuard[] {
    return Array.from(this.guards.values());
  }

  unregisterGuard(name: string): boolean {
    const result = this.guards.delete(name);
    if (result) {
      this.logger.log(`Unregistered guard '${name}'`);
    }
    return result;
  }

  unregisterPluginGuards(pluginName: string): void {
    const guardsToRemove = this.getGuardsByPlugin(pluginName);

    for (const guard of guardsToRemove) {
      this.guards.delete(guard.metadata.name);
    }

    if (guardsToRemove.length > 0) {
      this.logger.log(`Unregistered ${guardsToRemove.length} guards from plugin '${pluginName}'`);
    }
  }

  // Create guard instance if not already created
  createGuardInstance(name: string, ...args: any[]): PluginGuard | undefined {
    const registeredGuard = this.getGuard(name);
    if (!registeredGuard) {
      return undefined;
    }

    if (!registeredGuard.instance) {
      try {
        registeredGuard.instance = new registeredGuard.guardClass(...args);
        this.logger.debug(`Created instance for guard '${name}'`);
      } catch (error) {
        this.logger.error(`Failed to create instance for guard '${name}':`, error);
        return undefined;
      }
    }

    return registeredGuard.instance;
  }

  // Check if a plugin can use a specific guard
  canPluginUseGuard(requestingPluginName: string, guardName: string, allowedGuards?: Map<string, string[]>): boolean {
    const guard = this.getGuard(guardName);
    if (!guard) {
      return false;
    }

    // Plugin can always use its own guards
    if (guard.metadata.source === requestingPluginName) {
      return true;
    }

    // Check if the guard is in the allowed list for this plugin
    if (allowedGuards && allowedGuards.has(requestingPluginName)) {
      const allowedGuardsList = allowedGuards.get(requestingPluginName) || [];
      return allowedGuardsList.includes(guardName);
    }

    // By default, plugins cannot use guards from other plugins
    return false;
  }

  // Get guards that are exported (available for other plugins to use)
  getExportedGuards(): RegisteredPluginGuard[] {
    return Array.from(this.guards.values()).filter((guard) => {
      // External guards are automatically available
      if (guard.metadata.scope === 'external') return true;

      // Local guards must be explicitly exported
      return guard.metadata.scope === 'local' && (guard.metadata as any).exported === true;
    });
  }

  // Get guards available for a specific plugin
  getAvailableGuardsForPlugin(pluginName: string, allowedGuards?: Map<string, string[]>): RegisteredPluginGuard[] {
    return Array.from(this.guards.values()).filter((guard) =>
      this.canPluginUseGuard(pluginName, guard.metadata.name, allowedGuards)
    );
  }

  // Get statistics about registered guards
  getRegistryStats() {
    const guards = this.getAllGuards();
    return {
      totalGuards: guards.length,
      guardsByPlugin: guards.reduce((acc, guard) => {
        const pluginName = guard.metadata.source;
        acc[pluginName] = (acc[pluginName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      guardNames: guards.map((guard) => guard.metadata.name),
      exportedGuards: guards.filter((g) => g.metadata.source).length,
    };
  }
}
