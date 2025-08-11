import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLUGIN_PERMISSIONS_KEY } from '@plugin/decorators';

/**
 * Injection token for the plugin permission service
 */
export const PLUGIN_PERMISSION_SERVICE = 'PLUGIN_PERMISSION_SERVICE';

/**
 * Service interface for validating plugin permissions
 */
export interface PluginPermissionService {
  /**
   * Validates if the current request has the required permissions for a plugin endpoint
   *
   * @param pluginName - The name of the plugin
   * @param permissions - Array of required permissions
   * @param request - The HTTP request object
   * @returns Promise resolving to true if permissions are valid, false otherwise
   */
  validatePermissions(pluginName: string, permissions: string[], request: unknown): Promise<boolean>;

  /**
   * Extracts user context from the request for permission validation
   *
   * @param request - The HTTP request object
   * @returns User context object or null if not authenticated
   */
  extractUserContext(request: unknown): unknown | null;
}

/**
 * Plugin Permission Interceptor
 *
 * Enforces permissions defined by @PluginPermissions decorator.
 * This interceptor validates that the current request has the required
 * permissions to access plugin endpoints.
 *
 * Usage:
 * ```typescript
 * @PluginGet('admin-only')
 * @PluginPermissions(['admin:read', 'users:manage'])
 * adminEndpoint() {
 *   return { message: 'Admin data' };
 * }
 * ```
 */
@Injectable()
export class PluginPermissionInterceptor implements CanActivate {
  private readonly logger = new Logger(PluginPermissionInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(PLUGIN_PERMISSION_SERVICE)
    private readonly permissionService: PluginPermissionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions = this.reflector.get<string[]>(PLUGIN_PERMISSIONS_KEY, context.getHandler());

    // If no permissions are defined, allow access
    if (!permissions || permissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const pluginName = this.extractPluginName(context);

    if (!pluginName) {
      this.logger.warn('Unable to extract plugin name from context');
      return true; // Allow access if plugin name can't be determined
    }

    try {
      const hasPermission = await this.permissionService.validatePermissions(pluginName, permissions, request);

      if (!hasPermission) {
        const userContext = this.permissionService.extractUserContext(request) as { id?: string } | null;
        const userId = userContext?.id || 'anonymous';

        this.logger.warn(
          `Permission denied for user ${userId} on plugin ${pluginName} requiring permissions: ${permissions.join(
            ', '
          )}`
        );

        throw new ForbiddenException(`Insufficient permissions. Required: [${permissions.join(', ')}]`);
      }

      this.logger.debug(`Permission granted for plugin ${pluginName} with permissions: ${permissions.join(', ')}`);

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(`Permission validation error for plugin ${pluginName}:`, error);

      // On validation error, deny access
      throw new ForbiddenException('Permission validation failed');
    }
  }

  /**
   * Extracts the plugin name from the execution context
   *
   * @param context - The execution context
   * @returns Plugin name or null if not found
   */
  private extractPluginName(context: ExecutionContext): string | null {
    const controller = context.getClass();
    const controllerName = controller.name;

    // Extract plugin name from controller name (e.g., 'UserPluginController' -> 'user-plugin')
    if (controllerName.endsWith('PluginController')) {
      const baseName = controllerName.replace('PluginController', '');
      return this.camelToKebabCase(baseName);
    }

    // Fallback: try to extract from route prefix
    const request = context.switchToHttp().getRequest();
    const route = request.route?.path;

    if (route) {
      const pathSegments = route.split('/').filter(Boolean);
      if (pathSegments.length > 0) {
        // Assume first segment after root is plugin name
        return pathSegments[0];
      }
    }

    return null;
  }

  /**
   * Converts camelCase to kebab-case
   *
   * @param str - camelCase string
   * @returns kebab-case string
   */
  private camelToKebabCase(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }
}
