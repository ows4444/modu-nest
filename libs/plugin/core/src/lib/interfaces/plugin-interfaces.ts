// Import validation functions from shared utilities (single source of truth)
import {
  isValidPluginName as baseIsValidPluginName,
  isValidPluginVersion as baseIsValidPluginVersion,
  isValidChecksum as baseIsValidChecksum,
} from '@shared/utils';

// Import versioning system
import {
  VersionedInterface,
  PluginAPIVersion,
  CURRENT_API_VERSION,
  createVersionedInterface,
  validatePluginVersion,
  VersionValidationResult,
} from '../versions/interface-versions';
import { PluginMetadata } from './plugin-interfaces';
import { PluginManifest } from './plugin-interfaces';
import { PluginCompatibility } from './plugin-interfaces';
import { CrossPluginServiceConfig } from './plugin-interfaces';

// Re-export all plugin manifest types
export * from '../manifest/plugin-manifest.types';

// Re-export all plugin security types
export * from '../security/plugin-security.types';

// Re-export all plugin lifecycle types
export * from '../lifecycle/plugin-lifecycle.types';

// Branded types for enhanced type safety
export type PluginName = string & { readonly __brand: 'PluginName' };
export type PluginVersionString = string & {
  readonly __brand: 'PluginVersionString';
};
export type PluginId = string & { readonly __brand: 'PluginId' };
export type Checksum = string & { readonly __brand: 'Checksum' };
export type FilePath = string & { readonly __brand: 'FilePath' };
export type Timestamp = string & { readonly __brand: 'Timestamp' };

// Type guards for branded types (using shared validation logic)
export function isValidPluginName(value: string): value is PluginName {
  return baseIsValidPluginName(value);
}

export function isValidPluginVersion(value: string): value is PluginVersionString {
  return baseIsValidPluginVersion(value);
}

export function isValidChecksum(value: string): value is Checksum {
  return baseIsValidChecksum(value);
}

export function isValidPluginId(value: string): value is PluginId {
  // Plugin ID should be a combination of plugin name and version, separated by @
  // Example: my-plugin@1.0.0
  const parts = value.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const [name, version] = parts;
  return isValidPluginName(name) && isValidPluginVersion(version);
}

export function isValidTimestamp(value: string): value is Timestamp {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  const timestamp = Date.parse(value);
  return !isNaN(timestamp) && isFinite(timestamp);
}

export function isValidFilePath(value: string): value is FilePath {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  // Check for path traversal attempts
  if (value.includes('..') || value.includes('\\')) {
    return false;
  }

  // Check for absolute paths (security concern)
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    return false;
  }

  // Check for valid path characters (avoiding control characters)
  const invalidChars = /[<>:"|?*]/;
  const hasControlChars = value.split('').some((char) => {
    const code = char.charCodeAt(0);
    return code < 32; // ASCII control characters
  });

  if (invalidChars.test(value) || hasControlChars) {
    return false;
  }

  return true;
}

// Type constructors for branded types
export function createPluginName(value: string): PluginName {
  if (!isValidPluginName(value)) {
    throw new Error(
      `Invalid plugin name: ${value}. Must contain only lowercase letters, numbers, hyphens, and underscores, and be 2-50 characters long.`
    );
  }
  return value as PluginName;
}

export function createPluginVersion(value: string): PluginVersionString {
  if (!isValidPluginVersion(value)) {
    throw new Error(`Invalid plugin version: ${value}. Must follow semantic versioning (e.g., 1.0.0).`);
  }
  return value as PluginVersionString;
}

export function createPluginId(name: PluginName, version: PluginVersionString): PluginId {
  return `${name}@${version}` as PluginId;
}

export function createChecksum(value: string): Checksum {
  if (!isValidChecksum(value)) {
    throw new Error(`Invalid checksum: ${value}. Must be a valid hexadecimal string of at least 32 characters.`);
  }
  return value as Checksum;
}

export function createTimestamp(value: string | Date): Timestamp {
  const timestamp = value instanceof Date ? value.toISOString() : value;
  if (!isValidTimestamp(timestamp)) {
    throw new Error(`Invalid timestamp: ${value}. Must be a valid ISO date string.`);
  }
  return timestamp as Timestamp;
}

export function createFilePath(value: string): FilePath {
  if (!isValidFilePath(value)) {
    throw new Error(`Invalid file path: ${value}. Must be non-empty and not contain relative path traversal.`);
  }
  return value as FilePath;
}

// Parser utilities for plugin identifiers
export function parsePluginId(pluginId: PluginId): {
  name: PluginName;
  version: PluginVersionString;
} {
  const parts = pluginId.split('@');
  if (parts.length !== 2) {
    throw new Error(`Invalid plugin ID format: ${pluginId}. Expected format: name@version`);
  }

  const [name, version] = parts;
  return {
    name: createPluginName(name),
    version: createPluginVersion(version),
  };
}

// Comprehensive type guards for complex plugin types

/**
 * Type guard for PluginManifest objects
 */
export function isValidPluginManifest(value: unknown): value is PluginManifest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const manifest = value as Record<string, unknown>;

  // Required fields validation
  if (
    !isValidPluginName(manifest.name as string) ||
    !isValidPluginVersion(manifest.version as string) ||
    typeof manifest.description !== 'string' ||
    typeof manifest.author !== 'string' ||
    typeof manifest.license !== 'string' ||
    !manifest.module ||
    typeof manifest.module !== 'object'
  ) {
    return false;
  }

  // Optional fields validation
  if (
    manifest.dependencies &&
    (!Array.isArray(manifest.dependencies) || !manifest.dependencies.every((dep: unknown) => typeof dep === 'string'))
  ) {
    return false;
  }

  if (manifest.loadOrder && typeof manifest.loadOrder !== 'number') {
    return false;
  }

  if (manifest.critical && typeof manifest.critical !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Type guard for PluginMetadata objects
 */
export function isValidPluginMetadata(value: unknown): value is PluginMetadata {
  if (!isValidPluginManifest(value)) {
    return false;
  }

  const metadata = value as PluginMetadata;

  // Additional metadata fields
  return (
    isValidTimestamp(metadata.uploadedAt as string) &&
    typeof metadata.fileSize === 'number' &&
    metadata.fileSize > 0 &&
    isValidChecksum(metadata.checksum)
  );
}

/**
 * Type guard for PluginCompatibility objects
 */
export function isValidPluginCompatibility(value: unknown): value is PluginCompatibility {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const compat = value as Record<string, unknown>;

  // nodeVersion is required
  if (!compat.nodeVersion || typeof compat.nodeVersion !== 'string') {
    return false;
  }

  // Optional version fields
  if (compat.minimumHostVersion && typeof compat.minimumHostVersion !== 'string') {
    return false;
  }

  if (compat.maximumHostVersion && typeof compat.maximumHostVersion !== 'string') {
    return false;
  }

  return true;
}

/**
 * Type guard for service configuration objects
 */
export function isValidServiceConfig(value: unknown): value is CrossPluginServiceConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const config = value as CrossPluginServiceConfig;

  // Required fields
  if (typeof config.serviceName !== 'string' || config.serviceName.length === 0) {
    return false;
  }

  // Optional fields validation
  if (config.token && typeof config.token !== 'string') {
    return false;
  }

  if (config.global && typeof config.global !== 'boolean') {
    return false;
  }

  if (config.version && typeof config.version !== 'string') {
    return false;
  }

  return true;
}

/**
 * Runtime validation helper for unknown data
 */
export function assertPluginManifest(value: unknown): asserts value is PluginManifest {
  if (!isValidPluginManifest(value)) {
    throw new Error('Invalid plugin manifest structure');
  }
}

/**
 * Runtime validation helper for plugin metadata
 */
export function assertPluginMetadata(value: unknown): asserts value is PluginMetadata {
  if (!isValidPluginMetadata(value)) {
    throw new Error('Invalid plugin metadata structure');
  }
}

/**
 * Type guard for arrays of valid plugin names
 */
export function isValidPluginNameArray(value: unknown): value is PluginName[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && isValidPluginName(item));
}

/**
 * Plugin configuration value types
 */
export type PluginConfigValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | PluginConfigValue[]
  | { [key: string]: PluginConfigValue };

/**
 * Type guard for plugin configuration objects
 */
export function isValidPluginConfig(value: unknown): value is Record<string, PluginConfigValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  // Basic structure validation - config should be a plain object
  try {
    JSON.stringify(value);
    return isValidConfigValue(value);
  } catch {
    return false;
  }
}

/**
 * Helper to validate configuration values recursively
 */
function isValidConfigValue(value: unknown): value is PluginConfigValue {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;

  if (Array.isArray(value)) {
    return value.every((item) => isValidConfigValue(item));
  }

  if (typeof value === 'object') {
    return Object.values(value).every((item) => isValidConfigValue(item));
  }

  return false;
}

// Re-export strict type interfaces
export * from './plugin-strict-interfaces';

// Re-export versioning system
export * from '../versions/interface-versions';
export * from '../versions/v1/plugin-interfaces-v1';
export * from '../versions/migrators/v1-to-v2-migrator';

/**
 * Plugin interface versioning utilities
 */

/**
 * Create a versioned plugin manifest
 */
export function createVersionedPluginManifest<T>(
  manifest: T,
  version: PluginAPIVersion = CURRENT_API_VERSION
): T & VersionedInterface {
  return createVersionedInterface(manifest, version);
}

/**
 * Validate plugin interface version compatibility
 */
export function validatePluginInterfaceVersion(
  pluginManifest: Record<string, unknown>,
  hostVersion: string = CURRENT_API_VERSION
): VersionValidationResult & { canLoad: boolean } {
  const pluginVersion = (pluginManifest.__apiVersion as PluginAPIVersion) || PluginAPIVersion.V1_0;
  const result = validatePluginVersion(pluginVersion, undefined, hostVersion);

  return {
    ...result,
    canLoad: result.isValid && result.isSupported && (result.isCompatible || result.migrationPath !== undefined),
  };
}

/**
 * Check if plugin interfaces need migration
 */
export function checkPluginMigrationNeeded(pluginManifest: Record<string, unknown>): boolean {
  const pluginVersion = (pluginManifest.__apiVersion as PluginAPIVersion) || PluginAPIVersion.V1_0;
  return pluginVersion !== CURRENT_API_VERSION;
}

/**
 * Get plugin interface version
 */
export function getPluginInterfaceVersion(pluginManifest: Record<string, unknown>): PluginAPIVersion {
  return (pluginManifest.__apiVersion as PluginAPIVersion) || PluginAPIVersion.V1_0;
}

/**
 * Interface backward compatibility utilities
 */
export class PluginInterfaceCompatibility {
  /**
   * Ensure a plugin manifest is compatible with the current version
   */
  static ensureCompatibility<T>(manifest: T): T & VersionedInterface {
    const versionedManifest = manifest as T & Partial<VersionedInterface>;

    if (!versionedManifest.__apiVersion) {
      // Assume v1.0 for unversioned manifests
      return createVersionedInterface(manifest, PluginAPIVersion.V1_0);
    }

    return versionedManifest as T & VersionedInterface;
  }

  /**
   * Get compatibility warnings for a plugin
   */
  static getCompatibilityWarnings(manifest: Record<string, unknown>): string[] {
    const warnings: string[] = [];
    const version = (manifest.__apiVersion as PluginAPIVersion) || PluginAPIVersion.V1_0;

    if (version === PluginAPIVersion.V1_0) {
      warnings.push('Plugin uses legacy v1.0 API. Consider upgrading to v2.0 for better features and security.');
    }

    if (!manifest.__apiVersion) {
      warnings.push('Plugin manifest lacks version information. Assuming v1.0 compatibility mode.');
    }

    return warnings;
  }

  /**
   * Check if plugin can be loaded safely
   */
  static canLoadPlugin(
    manifest: Record<string, unknown>,
    hostVersion: string = CURRENT_API_VERSION
  ): {
    canLoad: boolean;
    reason?: string;
    warnings: string[];
  } {
    const version = (manifest.__apiVersion as PluginAPIVersion) || PluginAPIVersion.V1_0;
    const validation = validatePluginVersion(version, undefined, hostVersion);
    const warnings = this.getCompatibilityWarnings(manifest);

    if (!validation.isValid) {
      return {
        canLoad: false,
        reason: `Invalid plugin API version: ${version}`,
        warnings,
      };
    }

    if (!validation.isSupported) {
      return {
        canLoad: false,
        reason: `Plugin API version ${version} is not supported`,
        warnings,
      };
    }

    if (!validation.isCompatible && !validation.migrationPath) {
      return {
        canLoad: false,
        reason: `Plugin API version ${version} is incompatible with host version ${hostVersion}`,
        warnings,
      };
    }

    return {
      canLoad: true,
      warnings: [...warnings, ...validation.warnings],
    };
  }
}
