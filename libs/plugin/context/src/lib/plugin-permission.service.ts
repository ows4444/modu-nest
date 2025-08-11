import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PluginManifest, PluginSecurity } from '@plugin/core';

export interface PluginAccessContext {
  pluginName: string;
  manifest: PluginManifest;
  requestedPermission: string;
  resourcePath?: string;
  operation?: 'read' | 'write' | 'delete' | 'list' | 'execute';
}

export interface PermissionValidationResult {
  granted: boolean;
  reason?: string;
  restrictions?: Record<string, any>;
}

@Injectable()
export class PluginPermissionService {
  private readonly logger = new Logger(PluginPermissionService.name);
  private readonly pluginManifests = new Map<string, PluginManifest>();

  registerPlugin(pluginName: string, manifest: PluginManifest): void {
    this.pluginManifests.set(pluginName, manifest);
    this.logger.debug(`Registered permissions for plugin: ${pluginName}`);
  }

  unregisterPlugin(pluginName: string): void {
    this.pluginManifests.delete(pluginName);
    this.logger.debug(`Unregistered permissions for plugin: ${pluginName}`);
  }

  validateFileAccess(context: PluginAccessContext): PermissionValidationResult {
    const manifest = this.pluginManifests.get(context.pluginName);
    if (!manifest) {
      return {
        granted: false,
        reason: `Plugin ${context.pluginName} not registered`,
      };
    }

    const security = manifest.security;
    const fileAccess = security?.fileAccess;

    if (!fileAccess) {
      return {
        granted: false,
        reason: `No file access permissions defined for plugin ${context.pluginName}`,
      };
    }

    // Check operation-specific permissions
    switch (context.operation) {
      case 'read':
        if (fileAccess.canRead === false) {
          return { granted: false, reason: 'Read access denied' };
        }
        break;
      case 'write':
        if (fileAccess.canWrite === false) {
          return { granted: false, reason: 'Write access denied' };
        }
        break;
      case 'delete':
        if (fileAccess.canDelete === false) {
          return { granted: false, reason: 'Delete access denied' };
        }
        break;
      case 'list':
        if (fileAccess.canList === false) {
          return { granted: false, reason: 'List access denied' };
        }
        break;
    }

    return {
      granted: true,
      restrictions: {
        maxFileSize: fileAccess.maxFileSize,
        allowedExtensions: fileAccess.allowedExtensions,
      },
    };
  }

  validateServiceAccess(context: PluginAccessContext): PermissionValidationResult {
    const manifest = this.pluginManifests.get(context.pluginName);
    if (!manifest) {
      return {
        granted: false,
        reason: `Plugin ${context.pluginName} not registered`,
      };
    }

    // Check if plugin has permission to access cross-plugin services
    const hasServicePermission =
      manifest.permissions?.services?.includes(context.requestedPermission) ||
      manifest.permissions?.services?.includes('*');

    if (!hasServicePermission) {
      return {
        granted: false,
        reason: `Service access denied for ${context.requestedPermission}`,
      };
    }

    return { granted: true };
  }

  validateModuleAccess(context: PluginAccessContext): PermissionValidationResult {
    const manifest = this.pluginManifests.get(context.pluginName);
    if (!manifest) {
      return {
        granted: false,
        reason: `Plugin ${context.pluginName} not registered`,
      };
    }

    // Check if plugin has permission to access specific modules
    const hasModulePermission =
      manifest.permissions?.modules?.includes(context.requestedPermission) ||
      manifest.permissions?.modules?.includes('*');

    if (!hasModulePermission) {
      return {
        granted: false,
        reason: `Module access denied for ${context.requestedPermission}`,
      };
    }

    return { granted: true };
  }

  enforcePermission(context: PluginAccessContext): void {
    let result: PermissionValidationResult;

    switch (context.requestedPermission.split(':')[0]) {
      case 'file':
        result = this.validateFileAccess(context);
        break;
      case 'service':
        result = this.validateServiceAccess(context);
        break;
      case 'module':
        result = this.validateModuleAccess(context);
        break;
      default:
        result = {
          granted: false,
          reason: `Unknown permission type: ${context.requestedPermission}`,
        };
    }

    if (!result.granted) {
      throw new ForbiddenException(`Permission denied for plugin ${context.pluginName}: ${result.reason}`);
    }
  }

  getPluginPermissions(pluginName: string): PluginSecurity | undefined {
    const manifest = this.pluginManifests.get(pluginName);
    return manifest?.security;
  }
}
