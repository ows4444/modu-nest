import { Injectable, Logger } from '@nestjs/common';
import { PluginPermissionService, RestrictedPluginContextService, PluginContextInterface } from '@plugin/context';
import { PluginGuardManager, PluginGuardRegistryService } from '@plugin/services';
import { LoadedPlugin, GuardEntry, PluginManifest } from '@plugin/core';

export interface SecurityValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  trustLevel: 'verified' | 'trusted' | 'sandbox' | 'untrusted';
}

export interface GuardIsolationResult {
  isIsolated: boolean;
  conflictingGuards: string[];
  isolationIssues: string[];
}

export interface PluginSecurityContext {
  pluginName: string;
  trustLevel: string;
  permissions: string[];
  isolatedGuards: GuardEntry[];
  context: PluginContextInterface;
}

/**
 * Manages plugin security, permissions, and isolation
 * Extracted from the massive legacy PluginLoaderService
 */
@Injectable()
export class PluginSecurityManagerService {
  private readonly logger = new Logger(PluginSecurityManagerService.name);
  
  private readonly guardManager = new PluginGuardManager();
  private guardRegistry?: PluginGuardRegistryService;
  private contextService?: RestrictedPluginContextService;
  private permissionService?: PluginPermissionService;
  
  private readonly pluginContexts = new Map<string, PluginContextInterface>();
  private readonly securityProfiles = new Map<string, PluginSecurityContext>();

  /**
   * Initialize security services
   */
  initialize(
    guardRegistry: PluginGuardRegistryService,
    contextService: RestrictedPluginContextService,
    permissionService: PluginPermissionService
  ): void {
    this.guardRegistry = guardRegistry;
    this.contextService = contextService;
    this.permissionService = permissionService;
    
    this.logger.log('Plugin security manager initialized');
  }

  /**
   * Validate plugin security before loading
   */
  async validatePluginSecurity(manifest: PluginManifest): Promise<SecurityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let trustLevel: SecurityValidationResult['trustLevel'] = 'untrusted';

    try {
      // Validate trust level
      if (manifest.security?.trustLevel) {
        trustLevel = this.validateTrustLevel(manifest.security.trustLevel);
      }

      // Validate permissions
      if (manifest.permissions) {
        const permissionErrors = await this.validatePermissions(manifest.permissions);
        errors.push(...permissionErrors);
      }

      // Validate guards
      if (manifest.module?.guards) {
        const guardValidation = await this.validateGuards(manifest.module.guards);
        errors.push(...guardValidation.errors);
        warnings.push(...guardValidation.warnings);
      }

      // Security-specific validations based on trust level
      if (trustLevel === 'sandbox') {
        const sandboxErrors = this.validateSandboxRestrictions(manifest);
        errors.push(...sandboxErrors);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        trustLevel,
      };
    } catch (error) {
      this.logger.error(`Security validation failed for plugin ${manifest.name}:`, error);
      return {
        isValid: false,
        errors: [`Security validation error: ${error.message}`],
        warnings,
        trustLevel: 'untrusted',
      };
    }
  }

  /**
   * Create isolated security context for plugin
   */
  async createSecurityContext(
    pluginName: string, 
    manifest: PluginManifest, 
    loadedPlugin: LoadedPlugin
  ): Promise<PluginContextInterface | undefined> {
    try {
      if (!this.contextService || !this.permissionService) {
        throw new Error('Security services not initialized');
      }

      // Create restricted context based on permissions
      const context = await this.contextService.createRestrictedContext(
        pluginName,
        manifest.permissions || {}
      );

      // Register security profile
      const securityProfile: PluginSecurityContext = {
        pluginName,
        trustLevel: manifest.security?.trustLevel || 'untrusted',
        permissions: manifest.permissions?.services || [],
        isolatedGuards: manifest.module?.guards || [],
        context,
      };

      this.securityProfiles.set(pluginName, securityProfile);
      this.pluginContexts.set(pluginName, context);

      this.logger.log(
        `Created security context for plugin ${pluginName} with trust level: ${securityProfile.trustLevel}`
      );

      return context;
    } catch (error) {
      this.logger.error(`Failed to create security context for plugin ${pluginName}:`, error);
      return undefined;
    }
  }

  /**
   * Verify guard isolation for plugin
   */
  async verifyGuardIsolation(
    pluginName: string, 
    guards: GuardEntry[]
  ): Promise<GuardIsolationResult> {
    const conflictingGuards: string[] = [];
    const isolationIssues: string[] = [];

    try {
      if (!this.guardRegistry) {
        throw new Error('Guard registry not initialized');
      }

      for (const guard of guards) {
        // Check for guard conflicts
        const conflicts = await this.guardRegistry.checkGuardConflicts(guard);
        if (conflicts.length > 0) {
          conflictingGuards.push(...conflicts);
          isolationIssues.push(`Guard ${guard.name} conflicts with: ${conflicts.join(', ')}`);
        }

        // Verify guard isolation
        const isIsolated = await this.guardManager.isGuardIsolated(guard.name);
        if (!isIsolated) {
          isolationIssues.push(`Guard ${guard.name} is not properly isolated`);
        }
      }

      const isIsolated = conflictingGuards.length === 0 && isolationIssues.length === 0;

      if (isIsolated) {
        this.logger.debug(`Guard isolation verified for plugin: ${pluginName}`);
      } else {
        this.logger.warn(
          `Guard isolation issues found for plugin ${pluginName}:`, 
          { conflictingGuards, isolationIssues }
        );
      }

      return {
        isIsolated,
        conflictingGuards,
        isolationIssues,
      };
    } catch (error) {
      this.logger.error(`Failed to verify guard isolation for plugin ${pluginName}:`, error);
      return {
        isIsolated: false,
        conflictingGuards: [],
        isolationIssues: [`Isolation verification failed: ${error.message}`],
      };
    }
  }

  /**
   * Clean up security context for plugin
   */
  async cleanupSecurityContext(pluginName: string): Promise<void> {
    try {
      // Remove from security profiles
      this.securityProfiles.delete(pluginName);
      
      // Remove plugin context
      const context = this.pluginContexts.get(pluginName);
      if (context && this.contextService) {
        await this.contextService.cleanupContext(pluginName);
      }
      this.pluginContexts.delete(pluginName);

      // Cleanup guard registrations
      if (this.guardRegistry) {
        await this.guardRegistry.unregisterPluginGuards(pluginName);
      }

      this.logger.debug(`Cleaned up security context for plugin: ${pluginName}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup security context for plugin ${pluginName}:`, error);
    }
  }

  /**
   * Get plugin security context
   */
  getPluginContext(pluginName: string): PluginContextInterface | undefined {
    return this.pluginContexts.get(pluginName);
  }

  /**
   * Get plugin security profile
   */
  getSecurityProfile(pluginName: string): PluginSecurityContext | undefined {
    return this.securityProfiles.get(pluginName);
  }

  /**
   * Get all security profiles
   */
  getAllSecurityProfiles(): Map<string, PluginSecurityContext> {
    return new Map(this.securityProfiles);
  }

  /**
   * Check if plugin has specific permission
   */
  hasPermission(pluginName: string, permission: string): boolean {
    const profile = this.securityProfiles.get(pluginName);
    return profile?.permissions.includes(permission) || false;
  }

  /**
   * Get security manager statistics
   */
  getSecurityStats(): {
    totalSecurePlugins: number;
    trustLevelDistribution: Record<string, number>;
    totalPermissions: number;
    isolatedGuards: number;
  } {
    const trustLevelDistribution: Record<string, number> = {};
    let totalPermissions = 0;
    let isolatedGuards = 0;

    for (const profile of this.securityProfiles.values()) {
      // Count trust levels
      trustLevelDistribution[profile.trustLevel] = 
        (trustLevelDistribution[profile.trustLevel] || 0) + 1;
      
      // Count permissions
      totalPermissions += profile.permissions.length;
      
      // Count isolated guards
      isolatedGuards += profile.isolatedGuards.length;
    }

    return {
      totalSecurePlugins: this.securityProfiles.size,
      trustLevelDistribution,
      totalPermissions,
      isolatedGuards,
    };
  }

  private validateTrustLevel(trustLevel: string): SecurityValidationResult['trustLevel'] {
    const validLevels = ['verified', 'trusted', 'sandbox', 'untrusted'];
    if (validLevels.includes(trustLevel)) {
      return trustLevel as SecurityValidationResult['trustLevel'];
    }
    return 'untrusted';
  }

  private async validatePermissions(permissions: any): Promise<string[]> {
    const errors: string[] = [];

    if (!this.permissionService) {
      errors.push('Permission service not available for validation');
      return errors;
    }

    // Validate service permissions
    if (permissions.services && Array.isArray(permissions.services)) {
      for (const service of permissions.services) {
        const isValid = await this.permissionService.validateServicePermission(service);
        if (!isValid) {
          errors.push(`Invalid service permission: ${service}`);
        }
      }
    }

    // Validate module permissions
    if (permissions.modules && Array.isArray(permissions.modules)) {
      for (const module of permissions.modules) {
        const isValid = await this.permissionService.validateModulePermission(module);
        if (!isValid) {
          errors.push(`Invalid module permission: ${module}`);
        }
      }
    }

    return errors;
  }

  private async validateGuards(guards: GuardEntry[]): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const guard of guards) {
      if (!guard.name) {
        errors.push('Guard missing required name field');
        continue;
      }

      if (guard.scope === 'external' && !guard.source) {
        errors.push(`External guard ${guard.name} missing source field`);
      }

      if (guard.dependencies) {
        for (const dep of guard.dependencies) {
          // Check if dependency exists
          const dependencyExists = guards.some(g => g.name === dep);
          if (!dependencyExists) {
            warnings.push(`Guard ${guard.name} depends on non-existent guard: ${dep}`);
          }
        }
      }
    }

    return { errors, warnings };
  }

  private validateSandboxRestrictions(manifest: PluginManifest): string[] {
    const errors: string[] = [];

    // Sandbox plugins should have restricted permissions
    const permissions = manifest.permissions;
    if (permissions?.services?.includes('filesystem')) {
      errors.push('Sandbox plugins cannot access filesystem services');
    }

    if (permissions?.services?.includes('network')) {
      errors.push('Sandbox plugins cannot access network services');
    }

    // Check for dangerous modules
    const dangerousModules = ['child_process', 'fs', 'net', 'http'];
    if (permissions?.modules) {
      for (const module of permissions.modules) {
        if (dangerousModules.includes(module)) {
          errors.push(`Sandbox plugins cannot use dangerous module: ${module}`);
        }
      }
    }

    return errors;
  }
}