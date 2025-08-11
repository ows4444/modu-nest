/**
 * Interface versioning system for plugin-core
 *
 * This module provides semantic versioning for plugin interfaces to ensure
 * backward compatibility and smooth migration paths for plugins.
 */

/**
 * Plugin API Version enumeration
 */
export enum PluginAPIVersion {
  V1_0 = '1.0',
  V1_1 = '1.1',
  V2_0 = '2.0',
  // Add new versions here as interfaces evolve
}

/**
 * Current API version - update when breaking changes are made
 */
export const CURRENT_API_VERSION = PluginAPIVersion.V2_0;

/**
 * Supported API versions - older versions that are still supported
 */
export const SUPPORTED_API_VERSIONS = [PluginAPIVersion.V1_0, PluginAPIVersion.V1_1, PluginAPIVersion.V2_0];

/**
 * Deprecated API versions - will be removed in future releases
 */
export const DEPRECATED_API_VERSIONS: PluginAPIVersion[] = [
  // PluginAPIVersion.V1_0, // Uncomment when deprecating
];

/**
 * Version compatibility matrix
 */
export const VERSION_COMPATIBILITY = {
  [PluginAPIVersion.V1_0]: {
    compatibleWith: [PluginAPIVersion.V1_0, PluginAPIVersion.V1_1],
    deprecated: false,
    supportedUntil: '2025-12-31',
    migrationGuide: 'docs/migration/v1.0-to-v2.0.md',
  },
  [PluginAPIVersion.V1_1]: {
    compatibleWith: [PluginAPIVersion.V1_0, PluginAPIVersion.V1_1, PluginAPIVersion.V2_0],
    deprecated: false,
    supportedUntil: '2026-06-30',
    migrationGuide: 'docs/migration/v1.1-to-v2.0.md',
  },
  [PluginAPIVersion.V2_0]: {
    compatibleWith: [PluginAPIVersion.V2_0],
    deprecated: false,
    supportedUntil: null, // Current version
    migrationGuide: null,
  },
};

/**
 * Interface change log
 */
export const INTERFACE_CHANGELOG = {
  [PluginAPIVersion.V1_0]: {
    released: '2024-01-01',
    changes: ['Initial plugin interface definitions', 'Basic manifest structure', 'Simple guard system'],
  },
  [PluginAPIVersion.V1_1]: {
    released: '2024-06-01',
    changes: [
      'Added cross-plugin service support',
      'Enhanced guard dependency system',
      'Improved error handling types',
    ],
  },
  [PluginAPIVersion.V2_0]: {
    released: '2024-12-01',
    changes: [
      'Breaking: Revised manifest schema',
      'Added plugin context configuration',
      'Enhanced security model',
      'Standardized error types',
      'Added plugin lifecycle hooks',
    ],
  },
};

/**
 * Check if a plugin API version is supported
 */
export function isVersionSupported(version: string): boolean {
  return SUPPORTED_API_VERSIONS.includes(version as PluginAPIVersion);
}

/**
 * Check if a plugin API version is deprecated
 */
export function isVersionDeprecated(version: string): boolean {
  return DEPRECATED_API_VERSIONS.includes(version as PluginAPIVersion);
}

/**
 * Get compatibility information for a version
 */
export function getVersionCompatibility(version: string) {
  return VERSION_COMPATIBILITY[version as PluginAPIVersion] || null;
}

/**
 * Check if two versions are compatible
 */
export function areVersionsCompatible(version1: string, version2: string): boolean {
  const compat1 = getVersionCompatibility(version1);
  const compat2 = getVersionCompatibility(version2);

  if (!compat1 || !compat2) {
    return false;
  }

  return (
    compat1.compatibleWith.includes(version2 as PluginAPIVersion) ||
    compat2.compatibleWith.includes(version1 as PluginAPIVersion)
  );
}

/**
 * Get the latest supported version for a given version
 */
export function getLatestCompatibleVersion(version: string): string {
  const compat = getVersionCompatibility(version);
  if (!compat) {
    return CURRENT_API_VERSION;
  }

  // Return the highest compatible version
  const compatibleVersions = compat.compatibleWith
    .filter((v) => SUPPORTED_API_VERSIONS.includes(v))
    .sort((a, b) => b.localeCompare(a));

  return compatibleVersions[0] || CURRENT_API_VERSION;
}

/**
 * Version-aware interface marker
 */
export interface VersionedInterface {
  readonly __apiVersion: PluginAPIVersion;
  readonly __interfaceVersion: string;
}

/**
 * Create a versioned interface marker
 */
export function createVersionedInterface<T>(
  obj: T,
  apiVersion: PluginAPIVersion = CURRENT_API_VERSION,
  interfaceVersion = '1.0'
): T & VersionedInterface {
  return {
    ...obj,
    __apiVersion: apiVersion,
    __interfaceVersion: interfaceVersion,
  };
}

/**
 * Check if an interface is from a specific version
 */
export function isInterfaceVersion<T extends VersionedInterface>(obj: T, apiVersion: PluginAPIVersion): boolean {
  return obj.__apiVersion === apiVersion;
}

/**
 * Interface migration utilities
 */
export class InterfaceMigrator {
  /**
   * Migrate an interface from one version to another
   */
  static migrate<TFrom extends VersionedInterface, TTo extends VersionedInterface>(
    from: TFrom,
    toVersion: PluginAPIVersion,
    migrationRules: MigrationRules<TFrom, TTo>
  ): TTo {
    const fromVersion = from.__apiVersion;

    if (!areVersionsCompatible(fromVersion, toVersion)) {
      throw new Error(`Cannot migrate from ${fromVersion} to ${toVersion}: incompatible versions`);
    }

    if (fromVersion === toVersion) {
      return from as unknown as TTo;
    }

    // Apply migration rules
    return migrationRules.apply(from, fromVersion, toVersion);
  }

  /**
   * Get migration path between two versions
   */
  static getMigrationPath(from: PluginAPIVersion, to: PluginAPIVersion): PluginAPIVersion[] {
    const allVersions = Object.keys(VERSION_COMPATIBILITY) as PluginAPIVersion[];
    const sortedVersions = allVersions.sort((a, b) => a.localeCompare(b));

    const fromIndex = sortedVersions.indexOf(from);
    const toIndex = sortedVersions.indexOf(to);

    if (fromIndex === -1 || toIndex === -1) {
      throw new Error(`Invalid version in migration path: ${from} -> ${to}`);
    }

    if (fromIndex === toIndex) {
      return [from];
    }

    const direction = fromIndex < toIndex ? 1 : -1;
    const path: PluginAPIVersion[] = [];

    for (let i = fromIndex; i !== toIndex + direction; i += direction) {
      path.push(sortedVersions[i]);
    }

    return path;
  }
}

/**
 * Migration rules interface
 */
export interface MigrationRules<TFrom, TTo> {
  apply(from: TFrom, fromVersion: PluginAPIVersion, toVersion: PluginAPIVersion): TTo;
}

/**
 * Version validation result
 */
export interface VersionValidationResult {
  isValid: boolean;
  isSupported: boolean;
  isDeprecated: boolean;
  isCompatible: boolean;
  compatibleVersions: PluginAPIVersion[];
  warnings: string[];
  errors: string[];
  migrationPath?: PluginAPIVersion[];
}

/**
 * Validate a plugin's API version requirements
 */
export function validatePluginVersion(
  pluginVersion: string,
  requiredVersion?: string,
  hostVersion: string = CURRENT_API_VERSION
): VersionValidationResult {
  const result: VersionValidationResult = {
    isValid: false,
    isSupported: false,
    isDeprecated: false,
    isCompatible: false,
    compatibleVersions: [],
    warnings: [],
    errors: [],
  };

  // Check if plugin version is valid
  if (!Object.values(PluginAPIVersion).includes(pluginVersion as PluginAPIVersion)) {
    result.errors.push(`Unknown plugin API version: ${pluginVersion}`);
    return result;
  }

  result.isValid = true;
  result.isSupported = isVersionSupported(pluginVersion);
  result.isDeprecated = isVersionDeprecated(pluginVersion);

  if (!result.isSupported) {
    result.errors.push(`Plugin API version ${pluginVersion} is not supported`);
  }

  if (result.isDeprecated) {
    result.warnings.push(`Plugin API version ${pluginVersion} is deprecated`);
  }

  // Check compatibility with host
  result.isCompatible = areVersionsCompatible(pluginVersion, hostVersion);

  if (!result.isCompatible) {
    result.errors.push(`Plugin version ${pluginVersion} is not compatible with host version ${hostVersion}`);
  }

  // Get compatible versions
  const compat = getVersionCompatibility(pluginVersion);
  if (compat) {
    result.compatibleVersions = compat.compatibleWith;

    if (!result.isCompatible) {
      try {
        result.migrationPath = InterfaceMigrator.getMigrationPath(
          pluginVersion as PluginAPIVersion,
          hostVersion as PluginAPIVersion
        );
      } catch {
        // Migration path not available
      }
    }
  }

  return result;
}
