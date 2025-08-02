import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PluginGuardRegistryService } from './plugin-guard-registry.service';
import { PLUGIN_USE_GUARDS_KEY } from './plugin-guards';

@Injectable()
export class PluginGuardInterceptor implements CanActivate {
  private allowedGuards: Map<string, string[]> = new Map();

  constructor(
    private readonly reflector: Reflector,
    @Inject(PluginGuardRegistryService)
    private readonly guardRegistry: PluginGuardRegistryService
  ) {}

  // Set allowed guards for plugins based on their manifest dependencies
  setAllowedGuards(allowedGuards: Map<string, string[]>): void {
    this.allowedGuards = allowedGuards;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get the guard names from the decorator metadata
    const guardNames = this.reflector.getAllAndOverride<string[]>(PLUGIN_USE_GUARDS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!guardNames || guardNames.length === 0) {
      return true; // No guards specified, allow access
    }

    // Get the current plugin context (plugin that owns the controller/method)
    const currentPluginName = this.getCurrentPluginName(context);

    // Execute guards in sequence
    for (const guardName of guardNames) {
      const registeredGuard = this.guardRegistry.getGuard(guardName);

      if (!registeredGuard) {
        console.warn(`Guard '${guardName}' not found in registry`);
        return false;
      }

      // Check if the plugin can use this guard
      if (currentPluginName && !this.guardRegistry.canPluginUseGuard(currentPluginName, guardName, this.allowedGuards)) {
        console.error(
          `Security violation: Plugin '${currentPluginName}' attempted to use guard '${guardName}' from plugin '${registeredGuard.metadata.pluginName}'. ` +
          'Plugin can only use guards that are explicitly allowed in dependencies.'
        );
        return false;
      }

      // Create instance if not already created
      if (!registeredGuard.instance) {
        try {
          registeredGuard.instance = new registeredGuard.guardClass();
        } catch (error) {
          console.error(`Failed to create instance for guard '${guardName}':`, error);
          return false;
        }
      }

      // Execute the guard
      try {
        const result = await registeredGuard.instance.canActivate(context);
        if (!result) {
          return false; // If any guard fails, deny access
        }
      } catch (error) {
        // Let the guard's error bubble up (e.g., UnauthorizedException)
        console.error(`Guard '${guardName}' threw an error:`, error);
        throw error;
      }
    }

    return true; // All guards passed
  }

  /**
   * Determines which plugin owns the current controller/method being executed
   */
  private getCurrentPluginName(context: ExecutionContext): string | null {
    const controllerClass = context.getClass();
    const controllerName = controllerClass.name;

    // Try to extract plugin name from controller name
    // Convention: PluginNameController -> plugin-name
    if (controllerName.endsWith('Controller')) {
      const baseName = controllerName.replace('Controller', '');
      
      // Convert PascalCase to kebab-case
      const pluginName = baseName
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');
      
      return pluginName;
    }

    // Fallback: check if there's plugin metadata on the controller
    const pluginMetadata = Reflect.getMetadata('plugin:name', controllerClass);
    if (pluginMetadata) {
      return pluginMetadata;
    }

    // If we can't determine the plugin, log a warning and allow access
    console.warn(`Unable to determine plugin name for controller: ${controllerName}`);
    return null;
  }
}
