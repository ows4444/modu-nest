/**
 * Plugin Trust Enforcement Guard
 * 
 * Enforces trust level policies and capabilities for plugin operations.
 * Can be used as a method decorator or guard to restrict access based on trust levels.
 */

import { Injectable, CanActivate, ExecutionContext, SetMetadata, CustomDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PluginTrustManager, TrustLevel } from '../services/plugin-trust-manager';

export interface TrustRequirement {
  minimumTrustLevel?: TrustLevel;
  requiredCapabilities?: string[];
  allowedTrustLevels?: TrustLevel[];
  resourceLimitCheck?: boolean;
  auditLog?: boolean;
}

const TRUST_REQUIREMENT_KEY = 'trust_requirement';

/**
 * Decorator to specify trust requirements for a method or controller
 */
export const RequireTrust = (requirements: TrustRequirement): CustomDecorator<string> =>
  SetMetadata(TRUST_REQUIREMENT_KEY, requirements);

/**
 * Convenience decorators for common trust level requirements
 */
export const RequireInternalTrust = () => RequireTrust({ minimumTrustLevel: TrustLevel.INTERNAL });
export const RequireVerifiedTrust = () => RequireTrust({ minimumTrustLevel: TrustLevel.VERIFIED });
export const RequireCommunityTrust = () => RequireTrust({ minimumTrustLevel: TrustLevel.COMMUNITY });

export const RequireCapability = (capabilities: string[]) => 
  RequireTrust({ requiredCapabilities: capabilities });

export const RequireCapabilities = (...capabilities: string[]) => 
  RequireTrust({ requiredCapabilities: capabilities });

@Injectable()
export class PluginTrustEnforcementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly trustManager: PluginTrustManager
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get trust requirements from metadata
    const requirements = this.reflector.getAllAndOverride<TrustRequirement>(
      TRUST_REQUIREMENT_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requirements) {
      // No trust requirements specified, allow access
      return true;
    }

    // Extract plugin information from request
    const request = context.switchToHttp().getRequest();
    const pluginName = this.extractPluginName(request);
    const version = this.extractVersion(request);

    if (!pluginName) {
      // No plugin context, allow access (might be system operation)
      return true;
    }

    try {
      // Get plugin trust level
      const trustLevel = await this.trustManager.getTrustLevel(pluginName, version);
      
      // Check minimum trust level requirement
      if (requirements.minimumTrustLevel) {
        if (!this.meetsMinimumTrustLevel(trustLevel, requirements.minimumTrustLevel)) {
          this.logTrustViolation(pluginName, version, 'insufficient_trust_level', {
            required: requirements.minimumTrustLevel,
            actual: trustLevel
          });
          return false;
        }
      }

      // Check allowed trust levels
      if (requirements.allowedTrustLevels && requirements.allowedTrustLevels.length > 0) {
        if (!requirements.allowedTrustLevels.includes(trustLevel)) {
          this.logTrustViolation(pluginName, version, 'trust_level_not_allowed', {
            allowed: requirements.allowedTrustLevels,
            actual: trustLevel
          });
          return false;
        }
      }

      // Check required capabilities
      if (requirements.requiredCapabilities && requirements.requiredCapabilities.length > 0) {
        for (const capability of requirements.requiredCapabilities) {
          const canPerform = await this.trustManager.canPerformCapability(pluginName, capability, version);
          if (!canPerform) {
            this.logTrustViolation(pluginName, version, 'capability_denied', {
              capability,
              trustLevel
            });
            return false;
          }
        }
      }

      // Resource limit check (if enabled)
      if (requirements.resourceLimitCheck) {
        const policy = this.trustManager.getTrustPolicy(trustLevel);
        if (policy) {
          // This would integrate with resource monitoring system
          // For now, just log that resource check was requested
          console.log(`Resource limit check requested for ${pluginName} (${trustLevel})`);
        }
      }

      // Audit logging (if enabled)
      if (requirements.auditLog) {
        this.logTrustAccess(pluginName, version, trustLevel, context);
      }

      return true;

    } catch (error) {
      console.error(`Trust enforcement error for plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * Extract plugin name from request context
   */
  private extractPluginName(request: any): string | null {
    // Try different common parameter names
    return request.params?.name || 
           request.params?.pluginName || 
           request.body?.pluginName ||
           request.query?.pluginName ||
           request.headers['x-plugin-name'] ||
           null;
  }

  /**
   * Extract version from request context
   */
  private extractVersion(request: any): string | undefined {
    return request.params?.version || 
           request.body?.version ||
           request.query?.version ||
           request.headers['x-plugin-version'] ||
           undefined;
  }

  /**
   * Check if current trust level meets minimum requirement
   */
  private meetsMinimumTrustLevel(current: TrustLevel, minimum: TrustLevel): boolean {
    const trustHierarchy = {
      [TrustLevel.QUARANTINED]: 0,
      [TrustLevel.UNTRUSTED]: 1,
      [TrustLevel.COMMUNITY]: 2,
      [TrustLevel.VERIFIED]: 3,
      [TrustLevel.INTERNAL]: 4
    };

    return trustHierarchy[current] >= trustHierarchy[minimum];
  }

  /**
   * Log trust violation for monitoring and auditing
   */
  private logTrustViolation(
    pluginName: string, 
    version: string | undefined, 
    violationType: string, 
    details: any
  ): void {
    console.warn(`Trust violation: ${pluginName}${version ? `:${version}` : ''} - ${violationType}`, details);
    
    // This would integrate with the trust manager's violation recording
    this.trustManager.recordTrustViolation({
      pluginName,
      version: version || 'latest',
      violationType: 'security',
      description: `Trust enforcement violation: ${violationType}`,
      severity: 'medium',
      detectedAt: new Date(),
      details,
      action: 'warn'
    }).catch(err => {
      console.error('Failed to record trust violation:', err);
    });
  }

  /**
   * Log successful trust access for auditing
   */
  private logTrustAccess(
    pluginName: string, 
    version: string | undefined, 
    trustLevel: TrustLevel, 
    context: ExecutionContext
  ): void {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    
    console.log(`Trust access granted: ${pluginName}${version ? `:${version}` : ''} (${trustLevel}) - ${method} ${url}`);
  }
}