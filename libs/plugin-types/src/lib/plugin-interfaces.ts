// Re-export all plugin manifest types
export * from './plugin-manifest.types';

// Re-export all plugin security types
export * from './plugin-security.types';

// Re-export all plugin lifecycle types
export * from './plugin-lifecycle.types';

// Branded types for enhanced type safety
export type PluginName = string & { readonly __brand: 'PluginName' };
export type PluginVersionString = string & { readonly __brand: 'PluginVersionString' };
export type PluginId = string & { readonly __brand: 'PluginId' };
export type Checksum = string & { readonly __brand: 'Checksum' };
export type FilePath = string & { readonly __brand: 'FilePath' };
export type Timestamp = string & { readonly __brand: 'Timestamp' };

// Type guards for branded types
export function isValidPluginName(value: string): value is PluginName {
  return /^[a-z0-9-_]+$/.test(value) && value.length >= 2 && value.length <= 50;
}

export function isValidPluginVersion(value: string): value is PluginVersionString {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/.test(value);
}

export function isValidChecksum(value: string): value is Checksum {
  return /^[a-fA-F0-9]+$/.test(value) && value.length >= 32;
}

export function isValidTimestamp(value: string): value is Timestamp {
  return !isNaN(Date.parse(value));
}

export function isValidFilePath(value: string): value is FilePath {
  return value.length > 0 && !value.includes('..');
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
export function parsePluginId(pluginId: PluginId): { name: PluginName; version: PluginVersionString } {
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

// Re-export strict type interfaces
export * from './plugin-strict-interfaces';
