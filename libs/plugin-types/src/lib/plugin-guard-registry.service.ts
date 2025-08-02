import { Injectable, Logger, Global } from '@nestjs/common';
import { PluginGuardRegistry, RegisteredPluginGuard, PluginGuard } from './plugin-guards';

@Global()
@Injectable()
export class PluginGuardRegistryService implements PluginGuardRegistry {
  private readonly logger = new Logger(PluginGuardRegistryService.name);
  private readonly guards = new Map<string, RegisteredPluginGuard>();

  registerGuard(guard: RegisteredPluginGuard): void {
    const { name, pluginName } = guard.metadata;
    
    if (this.guards.has(name)) {
      this.logger.warn(`Guard '${name}' is already registered. Overriding with new guard from plugin '${pluginName}'.`);
    }

    this.guards.set(name, guard);
    this.logger.log(`Registered guard '${name}' from plugin '${pluginName}'`);
  }

  getGuard(name: string): RegisteredPluginGuard | undefined {
    return this.guards.get(name);
  }

  getGuardsByPlugin(pluginName: string): RegisteredPluginGuard[] {
    return Array.from(this.guards.values()).filter(
      guard => guard.metadata.pluginName === pluginName
    );
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

  // Get statistics about registered guards
  getRegistryStats() {
    const guards = this.getAllGuards();
    return {
      totalGuards: guards.length,
      guardsByPlugin: guards.reduce((acc, guard) => {
        const pluginName = guard.metadata.pluginName;
        acc[pluginName] = (acc[pluginName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      guardNames: guards.map(guard => guard.metadata.name),
    };
  }
}