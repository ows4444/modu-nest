/**
 * Plugin interfaces v1.0 - Legacy compatibility layer
 *
 * These interfaces represent the v1.0 plugin API for backward compatibility.
 * New plugins should use the current interfaces in the main plugin-interfaces.ts file.
 */

import { VersionedInterface, PluginAPIVersion, createVersionedInterface } from '../interface-versions';

/**
 * Legacy plugin manifest interface (v1.0)
 */
export interface LegacyPluginManifest extends VersionedInterface {
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  dependencies?: string[];
  loadOrder?: number;
}

/**
 * Legacy guard entry interface (v1.0)
 */
export interface LegacyGuardEntry extends VersionedInterface {
  name: string;
  class: string;
  exported?: boolean;
}

/**
 * Legacy plugin metadata interface (v1.0)
 */
export interface LegacyPluginMetadata extends VersionedInterface {
  manifest: LegacyPluginManifest;
  loadedAt: string;
  status: 'loaded' | 'failed' | 'unloaded';
  error?: string;
}

/**
 * Create a legacy plugin manifest
 */
export function createLegacyPluginManifest(
  manifest: Omit<LegacyPluginManifest, keyof VersionedInterface>
): LegacyPluginManifest {
  return createVersionedInterface(manifest, PluginAPIVersion.V1_0, '1.0');
}

/**
 * Create a legacy guard entry
 */
export function createLegacyGuardEntry(guard: Omit<LegacyGuardEntry, keyof VersionedInterface>): LegacyGuardEntry {
  return createVersionedInterface(guard, PluginAPIVersion.V1_0, '1.0');
}

/**
 * Create legacy plugin metadata
 */
export function createLegacyPluginMetadata(
  metadata: Omit<LegacyPluginMetadata, keyof VersionedInterface>
): LegacyPluginMetadata {
  return createVersionedInterface(metadata, PluginAPIVersion.V1_0, '1.0');
}

/**
 * Type guards for legacy interfaces
 */
export function isLegacyPluginManifest(obj: unknown): obj is LegacyPluginManifest {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '__apiVersion' in obj &&
    (obj as VersionedInterface).__apiVersion === PluginAPIVersion.V1_0 &&
    'name' in obj &&
    'version' in obj &&
    'description' in obj
  );
}

export function isLegacyGuardEntry(obj: unknown): obj is LegacyGuardEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '__apiVersion' in obj &&
    (obj as VersionedInterface).__apiVersion === PluginAPIVersion.V1_0 &&
    'name' in obj &&
    'class' in obj
  );
}

export function isLegacyPluginMetadata(obj: unknown): obj is LegacyPluginMetadata {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '__apiVersion' in obj &&
    (obj as VersionedInterface).__apiVersion === PluginAPIVersion.V1_0 &&
    'manifest' in obj &&
    'loadedAt' in obj &&
    'status' in obj
  );
}
