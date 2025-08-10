/**
 * Plugin Types Library Compatibility Checker
 * 
 * This module provides comprehensive compatibility checking between the plugin-types
 * library and different plugin versions, ensuring semantic versioning compliance
 * and proper API compatibility.
 * 
 * @fileoverview Plugin types library compatibility validation system
 * @version 1.0.0
 * @since 1.0.0
 */

import { PluginVersionUtils, CompatibilityResult } from '@modu-nest/plugin-validation';
import { PluginValidationError, PluginManifestError } from '@modu-nest/plugin-core';
import { PluginManifest } from '@modu-nest/plugin-core';

/**
 * Compatibility matrix for plugin-types library versions
 */
export interface CompatibilityMatrix {
  pluginTypesVersion: string;
  supportedPluginVersionRanges: string[];
  deprecatedVersionRanges: string[];
  unsupportedVersionRanges: string[];
  apiBreakingChanges: string[];
}

/**
 * Plugin API compatibility information
 */
export interface PluginAPICompatibility {
  isCompatible: boolean;
  apiVersion: string;
  requiredPluginTypesVersion: string;
  compatibilityLevel: 'full' | 'partial' | 'deprecated' | 'incompatible';
  warnings: string[];
  errors: string[];
  migration?: {
    required: boolean;
    steps: string[];
    automaticUpgrade: boolean;
  };
}

/**
 * Compatibility check configuration
 */
export interface CompatibilityCheckConfig {
  allowDeprecated: boolean;
  allowPartial: boolean;
  strictMode: boolean;
  includeWarnings: boolean;
  checkAPIVersions: boolean;
}

/**
 * Plugin types compatibility checker
 */
export class PluginCompatibilityChecker {
  private static readonly CURRENT_PLUGIN_TYPES_VERSION = '1.0.0';
  private static readonly CURRENT_API_VERSION = '1.0.0';
  
  private static readonly COMPATIBILITY_MATRIX: CompatibilityMatrix[] = [
    {
      pluginTypesVersion: '1.0.0',
      supportedPluginVersionRanges: ['^1.0.0', '~1.0.0'],
      deprecatedVersionRanges: ['0.9.x'],
      unsupportedVersionRanges: ['<0.9.0'],
      apiBreakingChanges: [],
    },
    {
      pluginTypesVersion: '0.9.0',
      supportedPluginVersionRanges: ['^0.9.0'],
      deprecatedVersionRanges: ['0.8.x'],
      unsupportedVersionRanges: ['<0.8.0'],
      apiBreakingChanges: ['manifest-schema-v2', 'security-model-v2'],
    },
  ];

  private static readonly API_COMPATIBILITY_RULES = new Map<string, string[]>([
    ['1.0.0', ['^1.0.0']],
    ['0.9.0', ['^0.9.0', '~0.8.0']],
    ['0.8.0', ['^0.8.0']],
  ]);

  /**
   * Check if a plugin version is compatible with current plugin-types library
   */
  static checkPluginCompatibility(
    pluginVersion: string,
    config: Partial<CompatibilityCheckConfig> = {}
  ): PluginAPICompatibility {
    const fullConfig: CompatibilityCheckConfig = {
      allowDeprecated: false,
      allowPartial: false,
      strictMode: true,
      includeWarnings: true,
      checkAPIVersions: true,
      ...config,
    };

    const warnings: string[] = [];
    const errors: string[] = [];
    let compatibilityLevel: 'full' | 'partial' | 'deprecated' | 'incompatible' = 'incompatible';
    let migration: PluginAPICompatibility['migration'] | undefined;

    try {
      // Validate plugin version format
      if (!PluginVersionUtils.isValidVersion(pluginVersion)) {
        errors.push(`Invalid plugin version format: ${pluginVersion}`);
        return this.createIncompatibleResult(pluginVersion, errors, warnings);
      }

      // Get current compatibility matrix
      const currentMatrix = this.getCurrentCompatibilityMatrix();
      if (!currentMatrix) {
        errors.push('Unable to determine compatibility matrix for current plugin-types version');
        return this.createIncompatibleResult(pluginVersion, errors, warnings);
      }

      // Check if plugin version is supported
      const supportedResult = this.checkVersionRanges(pluginVersion, currentMatrix.supportedPluginVersionRanges);
      if (supportedResult.isCompatible) {
        compatibilityLevel = 'full';
      } else {
        // Check if plugin version is deprecated but still supported
        const deprecatedResult = this.checkVersionRanges(pluginVersion, currentMatrix.deprecatedVersionRanges);
        if (deprecatedResult.isCompatible) {
          compatibilityLevel = 'deprecated';
          warnings.push(`Plugin version ${pluginVersion} is deprecated but still supported`);
          
          if (!fullConfig.allowDeprecated) {
            errors.push('Deprecated plugin versions are not allowed in current configuration');
            compatibilityLevel = 'incompatible';
          }
        } else {
          // Check if plugin version is explicitly unsupported
          const unsupportedResult = this.checkVersionRanges(pluginVersion, currentMatrix.unsupportedVersionRanges);
          if (unsupportedResult.isCompatible) {
            compatibilityLevel = 'incompatible';
            errors.push(`Plugin version ${pluginVersion} is explicitly unsupported`);
            
            // Provide migration guidance
            migration = this.createMigrationPlan(pluginVersion, currentMatrix);
          } else {
            // Plugin version might be partially compatible
            const partialCompatibility = this.checkPartialCompatibility(pluginVersion, currentMatrix);
            if (partialCompatibility.isPartiallyCompatible) {
              compatibilityLevel = 'partial';
              warnings.push(...partialCompatibility.warnings);
              
              if (!fullConfig.allowPartial) {
                errors.push('Partially compatible plugin versions are not allowed in current configuration');
                compatibilityLevel = 'incompatible';
              }
            } else {
              compatibilityLevel = 'incompatible';
              errors.push(`Plugin version ${pluginVersion} is not compatible with plugin-types ${this.CURRENT_PLUGIN_TYPES_VERSION}`);
            }
          }
        }
      }

      // Check API version compatibility if requested
      if (fullConfig.checkAPIVersions) {
        const apiCompatibility = this.checkAPIVersionCompatibility(pluginVersion);
        if (!apiCompatibility.isCompatible) {
          warnings.push(...apiCompatibility.warnings);
          if (compatibilityLevel !== 'incompatible') {
            compatibilityLevel = 'partial';
          }
        }
      }

      // Apply strict mode checks
      if (fullConfig.strictMode && (warnings.length > 0 || compatibilityLevel !== 'full')) {
        if (compatibilityLevel === 'deprecated' || compatibilityLevel === 'partial') {
          errors.push('Strict mode does not allow deprecated or partially compatible versions');
          compatibilityLevel = 'incompatible';
        }
      }

      return {
        isCompatible: compatibilityLevel !== 'incompatible',
        apiVersion: this.CURRENT_API_VERSION,
        requiredPluginTypesVersion: this.CURRENT_PLUGIN_TYPES_VERSION,
        compatibilityLevel,
        warnings: fullConfig.includeWarnings ? warnings : [],
        errors,
        migration,
      };

    } catch (error) {
      errors.push(`Compatibility check failed: ${error instanceof Error ? error.message : String(error)}`);
      return this.createIncompatibleResult(pluginVersion, errors, warnings);
    }
  }

  /**
   * Check plugin manifest compatibility
   */
  static checkManifestCompatibility(
    manifest: PluginManifest,
    config: Partial<CompatibilityCheckConfig> = {}
  ): PluginAPICompatibility {
    const pluginVersion = manifest.version;
    const baseCompatibility = this.checkPluginCompatibility(pluginVersion, config);

    // Additional manifest-specific checks
    const manifestWarnings: string[] = [...baseCompatibility.warnings];
    const manifestErrors: string[] = [...baseCompatibility.errors];

    // Check for compatibility markers in manifest
    if (manifest.compatibility) {
      const hostVersionCheck = this.checkHostVersionCompatibility(manifest.compatibility);
      if (!hostVersionCheck.isCompatible) {
        manifestErrors.push(`Plugin requires incompatible host version: ${hostVersionCheck.reason || 'unknown reason'}`);
        baseCompatibility.compatibilityLevel = 'incompatible';
      }
    }

    // Check for deprecated manifest fields
    const deprecatedFields = this.checkDeprecatedManifestFields(manifest);
    if (deprecatedFields.length > 0) {
      manifestWarnings.push(`Manifest uses deprecated fields: ${deprecatedFields.join(', ')}`);
      if (baseCompatibility.compatibilityLevel === 'full') {
        baseCompatibility.compatibilityLevel = 'partial';
      }
    }

    // Check for required manifest fields for current version
    const missingFields = this.checkRequiredManifestFields(manifest);
    if (missingFields.length > 0) {
      manifestErrors.push(`Manifest missing required fields: ${missingFields.join(', ')}`);
      baseCompatibility.compatibilityLevel = 'incompatible';
    }

    return {
      ...baseCompatibility,
      isCompatible: baseCompatibility.compatibilityLevel !== 'incompatible',
      warnings: manifestWarnings,
      errors: manifestErrors,
    };
  }

  /**
   * Validate plugin against compatibility requirements
   */
  static validatePluginCompatibility(
    manifest: PluginManifest,
    config: Partial<CompatibilityCheckConfig> = {}
  ): void {
    const compatibility = this.checkManifestCompatibility(manifest, config);

    if (!compatibility.isCompatible) {
      if (compatibility.errors.length > 0) {
        throw new PluginManifestError(
          manifest.name,
          compatibility.errors,
          compatibility.warnings
        );
      } else {
        throw new PluginValidationError(
          `Plugin ${manifest.name} is not compatible with current plugin-types library`,
          compatibility.warnings || [],
          manifest.name
        );
      }
    }

    // Log warnings if present
    if (compatibility.warnings.length > 0 && config.includeWarnings !== false) {
      console.warn(`Plugin ${manifest.name} compatibility warnings:`, compatibility.warnings);
    }
  }

  /**
   * Get compatibility matrix for available plugin versions
   */
  static getCompatibilityMatrix(pluginVersions: string[]): Record<string, PluginAPICompatibility> {
    const matrix: Record<string, PluginAPICompatibility> = {};

    for (const version of pluginVersions) {
      matrix[version] = this.checkPluginCompatibility(version);
    }

    return matrix;
  }

  /**
   * Find compatible plugin versions from a list
   */
  static findCompatibleVersions(
    availableVersions: string[],
    config: Partial<CompatibilityCheckConfig> = {}
  ): string[] {
    return availableVersions.filter(version => {
      const compatibility = this.checkPluginCompatibility(version, config);
      return compatibility.isCompatible;
    });
  }

  /**
   * Get the latest compatible plugin version
   */
  static getLatestCompatibleVersion(
    availableVersions: string[],
    config: Partial<CompatibilityCheckConfig> = {}
  ): string | null {
    const compatibleVersions = this.findCompatibleVersions(availableVersions, config);
    
    if (compatibleVersions.length === 0) {
      return null;
    }

    return PluginVersionUtils.getLatestVersion(compatibleVersions);
  }

  // Private helper methods

  private static getCurrentCompatibilityMatrix(): CompatibilityMatrix | undefined {
    return this.COMPATIBILITY_MATRIX.find(
      matrix => matrix.pluginTypesVersion === this.CURRENT_PLUGIN_TYPES_VERSION
    );
  }

  private static checkVersionRanges(version: string, ranges: string[]): CompatibilityResult {
    for (const range of ranges) {
      if (PluginVersionUtils.satisfiesRange(version, range)) {
        return { isCompatible: true };
      }
    }

    return {
      isCompatible: false,
      reason: `Version ${version} does not match any supported range: ${ranges.join(', ')}`,
    };
  }

  private static checkPartialCompatibility(
    version: string,
    matrix: CompatibilityMatrix
  ): { isPartiallyCompatible: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Check if it's a newer version that might be partially compatible
    const currentVersion = PluginVersionUtils.parseVersion(this.CURRENT_PLUGIN_TYPES_VERSION);
    const pluginVersion = PluginVersionUtils.parseVersion(version);

    // If plugin version is newer, it might have partial compatibility
    const comparison = PluginVersionUtils.compareVersions(pluginVersion, currentVersion);
    if (comparison.isGreater) {
      // Check if it's within reasonable bounds (same major version)
      if (pluginVersion.major === currentVersion.major) {
        warnings.push('Plugin version is newer than plugin-types library - some features may not work as expected');
        return { isPartiallyCompatible: true, warnings };
      }
    }

    return { isPartiallyCompatible: false, warnings: [] };
  }

  private static checkAPIVersionCompatibility(pluginVersion: string): { isCompatible: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    // Get compatible API ranges for the plugin version
    const compatibleRanges = this.API_COMPATIBILITY_RULES.get(this.CURRENT_API_VERSION) || [];
    
    for (const range of compatibleRanges) {
      if (PluginVersionUtils.satisfiesRange(pluginVersion, range)) {
        return { isCompatible: true, warnings };
      }
    }

    warnings.push(`Plugin version ${pluginVersion} may not be compatible with API version ${this.CURRENT_API_VERSION}`);
    return { isCompatible: false, warnings };
  }

  private static checkHostVersionCompatibility(compatibility: { minimumHostVersion?: string }): CompatibilityResult {
    if (!compatibility.minimumHostVersion) {
      return { isCompatible: true };
    }

    return PluginVersionUtils.isCompatible(compatibility.minimumHostVersion, this.CURRENT_PLUGIN_TYPES_VERSION);
  }

  private static checkDeprecatedManifestFields(manifest: PluginManifest): string[] {
    const deprecatedFields: string[] = [];
    const manifestAny = manifest as unknown as Record<string, unknown>;

    // List of deprecated fields (example)
    const deprecatedFieldNames = [
      'legacyMode',
      'oldPermissions',
      'deprecatedConfig',
    ];

    for (const field of deprecatedFieldNames) {
      if (field in manifestAny && manifestAny[field] !== undefined) {
        deprecatedFields.push(field);
      }
    }

    return deprecatedFields;
  }

  private static checkRequiredManifestFields(manifest: PluginManifest): string[] {
    const missingFields: string[] = [];

    // Check required fields for current version
    const requiredFields = [
      'name',
      'version',
      'description',
      'author',
      'license',
    ];

    for (const field of requiredFields) {
      const value = (manifest as unknown as Record<string, unknown>)[field];
      if (!value || (typeof value === 'string' && value.trim().length === 0)) {
        missingFields.push(field);
      }
    }

    return missingFields;
  }

  private static createMigrationPlan(version: string, matrix: CompatibilityMatrix): PluginAPICompatibility['migration'] {
    const steps: string[] = [];

    // Check if this is an upgrade or downgrade scenario
    const currentVersion = PluginVersionUtils.parseVersion(this.CURRENT_PLUGIN_TYPES_VERSION);
    const pluginVersion = PluginVersionUtils.parseVersion(version);
    const comparison = PluginVersionUtils.compareVersions(pluginVersion, currentVersion);

    if (comparison.isLess) {
      steps.push(`Upgrade plugin from version ${version} to compatible range: ${matrix.supportedPluginVersionRanges.join(' or ')}`);
      steps.push('Review breaking changes: ' + matrix.apiBreakingChanges.join(', '));
      steps.push('Update plugin manifest to match new schema');
      steps.push('Test plugin functionality with new plugin-types library');
    } else {
      steps.push(`Current plugin version ${version} is too new for plugin-types ${this.CURRENT_PLUGIN_TYPES_VERSION}`);
      steps.push('Consider upgrading plugin-types library to support newer plugin versions');
    }

    return {
      required: true,
      steps,
      automaticUpgrade: false, // Manual review recommended
    };
  }

  private static createIncompatibleResult(
    pluginVersion: string,
    errors: string[],
    warnings: string[]
  ): PluginAPICompatibility {
    return {
      isCompatible: false,
      apiVersion: this.CURRENT_API_VERSION,
      requiredPluginTypesVersion: this.CURRENT_PLUGIN_TYPES_VERSION,
      compatibilityLevel: 'incompatible',
      warnings,
      errors,
    };
  }
}

/**
 * Decorator to check plugin compatibility at runtime
 */
export function RequirePluginCompatibility(
  config: Partial<CompatibilityCheckConfig> = {}
) {
  return function (_target: unknown, _propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = function (manifest: PluginManifest, ...args: unknown[]) {
      PluginCompatibilityChecker.validatePluginCompatibility(manifest, config);
      return method.apply(this, [manifest, ...args]);
    };
  };
}

/**
 * Utility functions for plugin compatibility checking
 */
export class CompatibilityUtils {
  /**
   * Generate compatibility report for a plugin
   */
  static generateCompatibilityReport(manifest: PluginManifest): string {
    const compatibility = PluginCompatibilityChecker.checkManifestCompatibility(manifest, {
      includeWarnings: true,
      checkAPIVersions: true,
    });

    const lines: string[] = [];
    lines.push(`Plugin Compatibility Report for ${manifest.name}@${manifest.version}`);
    lines.push('='.repeat(60));
    lines.push(`Compatibility Level: ${compatibility.compatibilityLevel.toUpperCase()}`);
    lines.push(`API Version: ${compatibility.apiVersion}`);
    lines.push(`Required Plugin-Types: ${compatibility.requiredPluginTypesVersion}`);
    lines.push('');

    if (compatibility.errors.length > 0) {
      lines.push('ERRORS:');
      compatibility.errors.forEach(error => lines.push(`  ❌ ${error}`));
      lines.push('');
    }

    if (compatibility.warnings.length > 0) {
      lines.push('WARNINGS:');
      compatibility.warnings.forEach(warning => lines.push(`  ⚠️  ${warning}`));
      lines.push('');
    }

    if (compatibility.migration) {
      lines.push('MIGRATION REQUIRED:');
      compatibility.migration.steps.forEach(step => lines.push(`  📋 ${step}`));
      lines.push('');
    }

    lines.push(`Overall Status: ${compatibility.isCompatible ? '✅ COMPATIBLE' : '❌ INCOMPATIBLE'}`);

    return lines.join('\n');
  }

  /**
   * Check if a plugin needs to be updated
   */
  static needsUpdate(manifest: PluginManifest): boolean {
    const compatibility = PluginCompatibilityChecker.checkManifestCompatibility(manifest);
    return compatibility.compatibilityLevel === 'deprecated' || 
           compatibility.compatibilityLevel === 'incompatible' ||
           (compatibility.migration?.required ?? false);
  }

  /**
   * Get recommended actions for a plugin
   */
  static getRecommendedActions(manifest: PluginManifest): string[] {
    const compatibility = PluginCompatibilityChecker.checkManifestCompatibility(manifest);
    const actions: string[] = [];

    switch (compatibility.compatibilityLevel) {
      case 'incompatible':
        actions.push('Update plugin to a compatible version');
        if (compatibility.migration) {
          actions.push(...compatibility.migration.steps);
        }
        break;
      case 'deprecated':
        actions.push('Consider updating plugin to avoid deprecated features');
        actions.push('Review plugin for potential compatibility issues');
        break;
      case 'partial':
        actions.push('Test plugin thoroughly as some features may not work correctly');
        actions.push('Consider updating plugin for full compatibility');
        break;
      case 'full':
        actions.push('Plugin is fully compatible - no action required');
        break;
    }

    return actions;
  }
}