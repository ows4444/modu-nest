import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PluginGuardRegistryService } from './plugin-guard-registry.service';
import { PLUGIN_USE_GUARDS_KEY } from './plugin-guards';

@Injectable()
export class PluginGuardInterceptor implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PluginGuardRegistryService)
    private readonly guardRegistry: PluginGuardRegistryService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get the guard names from the decorator metadata
    const guardNames = this.reflector.getAllAndOverride<string[]>(PLUGIN_USE_GUARDS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!guardNames || guardNames.length === 0) {
      return true; // No guards specified, allow access
    }

    // Execute guards in sequence
    for (const guardName of guardNames) {
      const registeredGuard = this.guardRegistry.getGuard(guardName);

      if (!registeredGuard) {
        console.warn(`Guard '${guardName}' not found in registry`);
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
}
