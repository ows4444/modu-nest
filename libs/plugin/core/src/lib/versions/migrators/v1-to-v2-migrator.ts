/**
 * Migration utilities from v1.0 to v2.0 plugin interfaces
 */

import { LegacyPluginManifest, LegacyGuardEntry, LegacyPluginMetadata } from '../v1/plugin-interfaces-v1';
import { PluginManifest, GuardEntry, PluginMetadata } from '../../manifest/plugin-manifest.types';
import { MigrationRules, PluginAPIVersion, VersionedInterface, createVersionedInterface } from '../interface-versions';

/**
 * Migration rules for converting v1.0 plugin manifest to v2.0
 */
export class PluginManifestMigrationRules implements MigrationRules<LegacyPluginManifest, PluginManifest> {
  apply(from: LegacyPluginManifest, fromVersion: PluginAPIVersion, toVersion: PluginAPIVersion): PluginManifest {
    if (fromVersion !== PluginAPIVersion.V1_0 || toVersion !== PluginAPIVersion.V2_0) {
      throw new Error(`Unsupported migration path: ${fromVersion} -> ${toVersion}`);
    }

    // Convert v1.0 manifest to v2.0 format
    const v2Manifest: Omit<PluginManifest, keyof VersionedInterface> = {
      name: from.name,
      version: from.version,
      description: from.description,
      author: from.author,
      license: 'UNLICENSED', // Default license for legacy manifests

      // Convert main field to module structure
      module: {
        main: from.main || './index.js',
        crossPluginServices: [], // Empty by default
        guards: [], // Will be populated if guard data exists
        permissions: {
          services: [],
          modules: [],
        },
      },

      // Legacy dependencies become plugin dependencies
      dependencies: from.dependencies || [],

      // Convert loadOrder to priority system
      loadOrder: from.loadOrder || 0,

      // Add new v2.0 fields with defaults
      compatibility: {
        nodeVersion: '^18.0.0', // Default Node.js version requirement
        minimumHostVersion: '2.0.0',
      },

      security: {
        trustLevel: 'internal', // Default trust level
      },

      // Add metadata
      metadata: {
        category: 'general',
        tags: [],
        homepage: '',
        repository: '',
        bugs: '',
      },

      // Mark as migrated
      __migrated: {
        fromVersion: PluginAPIVersion.V1_0,
        migratedAt: new Date().toISOString(),
        warnings: [
          'Manifest migrated from v1.0 to v2.0',
          'Please review security settings and permissions',
          'Consider updating compatibility requirements',
        ],
      },
    };

    return createVersionedInterface(v2Manifest, PluginAPIVersion.V2_0, '2.0');
  }
}

/**
 * Migration rules for converting v1.0 guard entry to v2.0
 */
export class GuardEntryMigrationRules implements MigrationRules<LegacyGuardEntry, GuardEntry> {
  apply(from: LegacyGuardEntry, fromVersion: PluginAPIVersion, toVersion: PluginAPIVersion): GuardEntry {
    if (fromVersion !== PluginAPIVersion.V1_0 || toVersion !== PluginAPIVersion.V2_0) {
      throw new Error(`Unsupported migration path: ${fromVersion} -> ${toVersion}`);
    }

    // Convert v1.0 guard to v2.0 format
    const v2Guard: Omit<GuardEntry, keyof VersionedInterface> = {
      name: from.name,
      scope: 'local', // v1.0 guards were always local
      class: from.class,
      exported: from.exported || false,

      // Add new v2.0 fields
      description: `Migrated guard: ${from.name}`,
      dependencies: [], // v1.0 didn't have guard dependencies
      security: {
        trustLevel: 'standard',
        restrictedOperations: [],
      },

      // Performance hints
      performance: {
        priority: 'normal',
        cacheable: false,
        timeout: 5000,
      },

      // Mark as migrated
      __migrated: {
        fromVersion: PluginAPIVersion.V1_0,
        migratedAt: new Date().toISOString(),
        warnings: ['Guard migrated from v1.0 to v2.0', 'Consider adding security restrictions and dependencies'],
      },
    };

    return createVersionedInterface(v2Guard, PluginAPIVersion.V2_0, '2.0');
  }
}

/**
 * Migration rules for converting v1.0 plugin metadata to v2.0
 */
export class PluginMetadataMigrationRules implements MigrationRules<LegacyPluginMetadata, PluginMetadata> {
  apply(from: LegacyPluginMetadata, fromVersion: PluginAPIVersion, toVersion: PluginAPIVersion): PluginMetadata {
    if (fromVersion !== PluginAPIVersion.V1_0 || toVersion !== PluginAPIVersion.V2_0) {
      throw new Error(`Unsupported migration path: ${fromVersion} -> ${toVersion}`);
    }

    // Migrate the manifest first
    const manifestMigrator = new PluginManifestMigrationRules();
    const v2Manifest = manifestMigrator.apply(from.manifest, fromVersion, toVersion);

    // Convert v1.0 metadata to v2.0 format
    const v2Metadata: Omit<PluginMetadata, keyof VersionedInterface> = {
      manifest: v2Manifest,
      uploadedAt: from.loadedAt, // Rename loadedAt to uploadedAt
      fileSize: 0, // Unknown file size for legacy metadata
      checksum: '0000000000000000000000000000000000000000000000000000000000000000', // Placeholder checksum

      // Add new v2.0 fields
      downloadCount: 0,
      rating: 0,
      tags: [],

      // Migrate status to extended format
      status: {
        current: from.status,
        lastUpdate: from.loadedAt,
        healthCheck: {
          status: 'unknown',
          lastCheck: from.loadedAt,
          issues: from.error ? [from.error] : [],
        },
      },

      // Add performance metrics
      performance: {
        loadTime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        errorRate: from.error ? 1.0 : 0.0,
      },

      // Mark as migrated
      __migrated: {
        fromVersion: PluginAPIVersion.V1_0,
        migratedAt: new Date().toISOString(),
        warnings: [
          'Metadata migrated from v1.0 to v2.0',
          'File size and checksum are placeholder values',
          'Performance metrics need to be populated',
        ],
      },
    };

    return createVersionedInterface(v2Metadata, PluginAPIVersion.V2_0, '2.0');
  }
}

/**
 * Convenience function to migrate any v1.0 interface to v2.0
 */
export function migrateV1ToV2<T>(obj: T & { __apiVersion: PluginAPIVersion }): T {
  if (obj.__apiVersion !== PluginAPIVersion.V1_0) {
    return obj; // Already v2.0 or other version
  }

  // Type-specific migration
  if ('manifest' in obj && 'loadedAt' in obj) {
    // Plugin metadata
    const migrator = new PluginMetadataMigrationRules();
    return migrator.apply(obj as any, PluginAPIVersion.V1_0, PluginAPIVersion.V2_0) as any;
  } else if ('class' in obj && 'name' in obj && !('description' in obj)) {
    // Guard entry
    const migrator = new GuardEntryMigrationRules();
    return migrator.apply(obj as any, PluginAPIVersion.V1_0, PluginAPIVersion.V2_0) as any;
  } else if ('author' in obj && 'main' in obj) {
    // Plugin manifest
    const migrator = new PluginManifestMigrationRules();
    return migrator.apply(obj as any, PluginAPIVersion.V1_0, PluginAPIVersion.V2_0) as any;
  }

  // Unknown type, return as-is
  console.warn('Unknown v1.0 interface type, cannot migrate:', obj);
  return obj;
}

/**
 * Check if an object needs migration
 */
export function needsMigration(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '__apiVersion' in obj &&
    (obj as any).__apiVersion === PluginAPIVersion.V1_0
  );
}

/**
 * Migration utility class
 */
export class V1ToV2Migrator {
  private static manifestMigrator = new PluginManifestMigrationRules();
  private static guardMigrator = new GuardEntryMigrationRules();
  private static metadataMigrator = new PluginMetadataMigrationRules();

  /**
   * Migrate plugin manifest
   */
  static migrateManifest(manifest: LegacyPluginManifest): PluginManifest {
    return this.manifestMigrator.apply(manifest, PluginAPIVersion.V1_0, PluginAPIVersion.V2_0);
  }

  /**
   * Migrate guard entry
   */
  static migrateGuard(guard: LegacyGuardEntry): GuardEntry {
    return this.guardMigrator.apply(guard, PluginAPIVersion.V1_0, PluginAPIVersion.V2_0);
  }

  /**
   * Migrate plugin metadata
   */
  static migrateMetadata(metadata: LegacyPluginMetadata): PluginMetadata {
    return this.metadataMigrator.apply(metadata, PluginAPIVersion.V1_0, PluginAPIVersion.V2_0);
  }

  /**
   * Batch migrate multiple objects
   */
  static batchMigrate<T extends { __apiVersion: PluginAPIVersion }>(objects: T[]): T[] {
    return objects.map((obj) => {
      if (needsMigration(obj)) {
        return migrateV1ToV2(obj);
      }
      return obj;
    });
  }
}
