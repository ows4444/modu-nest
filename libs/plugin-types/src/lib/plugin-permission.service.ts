import { Injectable, Logger } from '@nestjs/common';
import { PluginPermissionService } from './plugin-permission-interceptor';

/**
 * User context interface for permission validation
 */
export interface UserContext {
  id: string;
  username?: string;
  roles?: string[];
  permissions?: string[];
  isActive?: boolean;
  pluginPermissions?: Record<string, string[]>;
}

/**
 * Plugin permission configuration
 */
export interface PluginPermissionConfig {
  /**
   * Default permissions for unauthenticated users
   */
  defaultPermissions: string[];

  /**
   * Role-based permissions mapping
   */
  rolePermissions: Record<string, string[]>;

  /**
   * Plugin-specific permission overrides
   */
  pluginOverrides: Record<
    string,
    {
      rolePermissions?: Record<string, string[]>;
      userPermissions?: Record<string, string[]>;
    }
  >;

  /**
   * Whether to allow access when permission service is unavailable
   */
  allowOnServiceFailure: boolean;
}

/**
 * Default Plugin Permission Service Implementation
 *
 * This service provides a default implementation for plugin permission validation.
 * It can be extended or replaced with custom implementations that integrate with
 * your application's authentication and authorization system.
 *
 * Features:
 * - Role-based permission checking
 * - Plugin-specific permission overrides
 * - User-specific permission grants
 * - Configurable fallback behavior
 */
@Injectable()
export class DefaultPluginPermissionService implements PluginPermissionService {
  private readonly logger = new Logger(DefaultPluginPermissionService.name);

  private config: PluginPermissionConfig = {
    defaultPermissions: ['public:read'],
    rolePermissions: {
      admin: ['admin:*', 'users:*', 'products:*', 'plugins:*'],
      moderator: ['users:read', 'users:write', 'products:read', 'products:write'],
      user: ['users:read:own', 'products:read', 'products:write:own'],
      guest: ['public:read'],
    },
    pluginOverrides: {
      'user-plugin': {
        rolePermissions: {
          user: ['users:read:own', 'users:write:own'],
          admin: ['users:*'],
        },
      },
      'product-plugin': {
        rolePermissions: {
          user: ['products:read', 'products:write:own'],
          admin: ['products:*'],
        },
      },
    },
    allowOnServiceFailure: false,
  };

  /**
   * Updates the permission configuration
   *
   * @param config - New permission configuration
   */
  updateConfig(config: Partial<PluginPermissionConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log('Permission configuration updated');
  }

  /**
   * Validates if the current request has the required permissions for a plugin endpoint
   *
   * @param pluginName - The name of the plugin
   * @param permissions - Array of required permissions
   * @param request - The HTTP request object
   * @returns Promise resolving to true if permissions are valid, false otherwise
   */
  async validatePermissions(pluginName: string, permissions: string[], request: unknown): Promise<boolean> {
    try {
      const userContext = this.extractUserContext(request);

      if (!userContext) {
        // Check if any required permission is available to guests
        return this.checkGuestPermissions(permissions);
      }

      // Check if user is active
      if (userContext.isActive === false) {
        this.logger.warn(`Access denied for inactive user: ${userContext.id}`);
        return false;
      }

      // Get effective permissions for this user and plugin
      const effectivePermissions = await this.getEffectivePermissions(userContext, pluginName);

      // Check if user has all required permissions
      const hasAllPermissions = permissions.every((requiredPermission) =>
        this.hasPermission(effectivePermissions, requiredPermission, userContext, request)
      );

      if (hasAllPermissions) {
        this.logger.debug(`Permission granted for user ${userContext.id} on plugin ${pluginName}`);
      } else {
        this.logger.warn(
          `Permission denied for user ${userContext.id} on plugin ${pluginName}. Required: [${permissions.join(
            ', '
          )}], Has: [${effectivePermissions.join(', ')}]`
        );
      }

      return hasAllPermissions;
    } catch (error) {
      this.logger.error(`Error validating permissions for plugin ${pluginName}:`, error);

      return this.config.allowOnServiceFailure;
    }
  }

  /**
   * Extracts user context from the request for permission validation
   *
   * @param request - The HTTP request object
   * @returns User context object or null if not authenticated
   */
  extractUserContext(request: unknown): UserContext | null {
    // Type guard to ensure request has expected properties
    const req = request as Record<string, unknown>;
    if (!req || typeof req !== 'object') {
      return null;
    }

    // Check for user in request (common with Passport.js)
    if (req.user) {
      return this.normalizeUserContext(req.user);
    }

    // Check for custom user context
    if (req.userContext) {
      return this.normalizeUserContext(req.userContext);
    }

    // Check for JWT payload
    if (req.payload) {
      return this.normalizeUserContext(req.payload);
    }

    // Check headers for user information (for testing)
    const headers = req.headers as Record<string, string> | undefined;
    if (headers) {
      const userId = headers['x-user-id'];
      const userRoles = headers['x-user-roles'];

      if (userId) {
        return {
          id: userId,
          roles: userRoles ? userRoles.split(',') : ['user'],
          isActive: true,
        };
      }
    }

    return null;
  }

  /**
   * Normalizes user context from various sources into a consistent format
   *
   * @param userObject - User object from request
   * @returns Normalized user context
   */
  private normalizeUserContext(userObject: unknown): UserContext {
    const user = userObject as Record<string, unknown>;
    return {
      id: (user.id || user.userId || user.sub || 'unknown') as string,
      username: (user.username as string | undefined) || (user.name as string | undefined),
      roles: (user.roles as string[]) || (user.role ? [user.role as string] : ['user']),
      permissions: (user.permissions as string[]) || [],
      isActive: user.isActive !== false,
      pluginPermissions: (user.pluginPermissions as Record<string, string[]>) || {},
    };
  }

  /**
   * Checks if guest users have the required permissions
   *
   * @param permissions - Required permissions
   * @returns True if guests can access, false otherwise
   */
  private checkGuestPermissions(permissions: string[]): boolean {
    return permissions.every((permission) =>
      this.hasPermission(this.config.defaultPermissions, permission, null, null)
    );
  }

  /**
   * Gets effective permissions for a user in a specific plugin context
   *
   * @param userContext - User context
   * @param pluginName - Plugin name
   * @returns Array of effective permissions
   */
  private async getEffectivePermissions(userContext: UserContext, pluginName: string): Promise<string[]> {
    const permissions = new Set<string>();

    // Add default permissions
    this.config.defaultPermissions.forEach((p) => permissions.add(p));

    // Add explicit user permissions
    if (userContext.permissions) {
      userContext.permissions.forEach((p) => permissions.add(p));
    }

    // Add plugin-specific user permissions
    if (userContext.pluginPermissions?.[pluginName]) {
      userContext.pluginPermissions[pluginName].forEach((p) => permissions.add(p));
    }

    // Add role-based permissions
    const userRoles = userContext.roles || [];
    for (const role of userRoles) {
      // Check plugin-specific role permissions first
      const pluginOverride = this.config.pluginOverrides[pluginName];
      if (pluginOverride?.rolePermissions?.[role]) {
        pluginOverride.rolePermissions[role].forEach((p) => permissions.add(p));
      } else if (this.config.rolePermissions[role]) {
        // Fallback to global role permissions
        this.config.rolePermissions[role].forEach((p) => permissions.add(p));
      }
    }

    return Array.from(permissions);
  }

  /**
   * Checks if a permission is granted within a set of permissions
   *
   * @param userPermissions - User's permissions
   * @param requiredPermission - Required permission
   * @param userContext - User context (for contextual checks)
   * @param request - HTTP request (for parameter checks)
   * @returns True if permission is granted
   */
  private hasPermission(
    userPermissions: string[],
    requiredPermission: string,
    userContext: UserContext | null,
    request: unknown
  ): boolean {
    // Direct permission match
    if (userPermissions.includes(requiredPermission)) {
      return true;
    }

    // Wildcard permission match
    const [domain, action, scope] = requiredPermission.split(':');

    // Check for domain wildcard (e.g., "users:*")
    if (userPermissions.includes(`${domain}:*`)) {
      return true;
    }

    // Check for action wildcard (e.g., "admin:*")
    if (action && userPermissions.includes(`${domain}:${action}:*`)) {
      return true;
    }

    // Check for contextual permissions (e.g., "users:read:own")
    if (scope === 'own' && userContext && request) {
      const ownershipPermission = `${domain}:${action}:own`;
      if (userPermissions.includes(ownershipPermission)) {
        return this.checkOwnership(userContext, request, domain);
      }
    }

    // Check for global admin permission
    if (userPermissions.includes('admin:*')) {
      return true;
    }

    return false;
  }

  /**
   * Checks if user owns the resource being accessed
   *
   * @param userContext - User context
   * @param request - HTTP request
   * @param domain - Resource domain (users, products, etc.)
   * @returns True if user owns the resource
   */
  private checkOwnership(userContext: UserContext, request: unknown, domain: string): boolean {
    const req = request as Record<string, unknown>;
    if (!req || typeof req !== 'object') {
      return false;
    }

    // Extract resource ID from request parameters
    const params = req.params as Record<string, string> | undefined;
    const resourceId = params?.id || params?.userId || params?.productId;

    if (!resourceId) {
      // If no resource ID, allow access (might be creating new resource)
      return true;
    }

    // For user domain, check if accessing own user
    if (domain === 'users') {
      return userContext.id === resourceId;
    }

    // For other domains, this would typically involve a database lookup
    // For now, we'll use a simplified check based on request context
    const body = req.body as Record<string, unknown> | undefined;
    const query = req.query as Record<string, unknown> | undefined;
    const ownerId = body?.ownerId || query?.ownerId;

    if (ownerId && typeof ownerId === 'string') {
      return userContext.id === ownerId;
    }

    // Default to allowing access if ownership can't be determined
    // In a real implementation, you would query your database here
    return true;
  }
}
