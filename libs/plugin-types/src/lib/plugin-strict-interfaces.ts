import type { GuardEntry, CrossPluginServiceConfig, PluginSecurity } from './plugin-security.types';
import type { PluginName, PluginVersion, PluginId, Checksum, FilePath, Timestamp } from './plugin-interfaces';

// Utility types for stricter constraints
export type NonEmptyString = string & { readonly __nonEmpty: true };
export type PositiveNumber = number & { readonly __positive: true };
export type NonNegativeNumber = number & { readonly __nonNegative: true };

// Type guards for utility types
export function isNonEmptyString(value: string): value is NonEmptyString {
  return value.trim().length > 0;
}

export function isPositiveNumber(value: number): value is PositiveNumber {
  return value > 0;
}

export function isNonNegativeNumber(value: number): value is NonNegativeNumber {
  return value >= 0;
}

// Type constructors for utility types
export function createNonEmptyString(value: string): NonEmptyString {
  if (!isNonEmptyString(value)) {
    throw new Error(`String cannot be empty or whitespace only: '${value}'`);
  }
  return value as NonEmptyString;
}

export function createPositiveNumber(value: number): PositiveNumber {
  if (!isPositiveNumber(value)) {
    throw new Error(`Number must be positive: ${value}`);
  }
  return value as PositiveNumber;
}

export function createNonNegativeNumber(value: number): NonNegativeNumber {
  if (!isNonNegativeNumber(value)) {
    throw new Error(`Number must be non-negative: ${value}`);
  }
  return value as NonNegativeNumber;
}

// Enhanced plugin interfaces with stronger types
export interface StrictPluginManifest {
  readonly name: PluginName;
  readonly version: PluginVersion;
  readonly description: NonEmptyString;
  readonly author: NonEmptyString;
  readonly license: NonEmptyString;
  readonly dependencies?: readonly PluginId[];
  readonly loadOrder?: NonNegativeNumber;
  readonly critical?: boolean;
  readonly security?: PluginSecurity;
  readonly compatibility?: StrictPluginCompatibility;
  readonly module: StrictPluginModuleMeta;
}

export interface StrictPluginCompatibility {
  readonly minimumHostVersion?: PluginVersion;
  readonly maximumHostVersion?: PluginVersion;
  readonly nodeVersion: PluginVersion;
}

export interface StrictPluginModuleMeta {
  readonly controllers?: readonly NonEmptyString[];
  readonly providers?: readonly NonEmptyString[];
  readonly exports?: readonly NonEmptyString[];
  readonly imports?: readonly NonEmptyString[];
  readonly guards?: readonly GuardEntry[];
  readonly crossPluginServices?: readonly CrossPluginServiceConfig[];
}

export interface StrictPluginMetadata extends StrictPluginManifest {
  readonly uploadedAt: Timestamp;
  readonly fileSize: NonNegativeNumber;
  readonly checksum: Checksum;
}

export interface StrictPluginPackage {
  readonly metadata: StrictPluginMetadata;
  readonly filePath: FilePath;
}

export interface StrictLoadedPlugin {
  readonly manifest: StrictPluginManifest;
  readonly module: unknown;
  readonly instance: unknown;
}

// Type-safe plugin builder utilities
export class PluginManifestBuilder {
  private manifest: Partial<StrictPluginManifest> = {};

  setName(name: string): this {
    const { createPluginName } = require('./plugin-interfaces');
    this.manifest.name = createPluginName(name);
    return this;
  }

  setVersion(version: string): this {
    const { createPluginVersion } = require('./plugin-interfaces');
    this.manifest.version = createPluginVersion(version);
    return this;
  }

  setDescription(description: string): this {
    this.manifest.description = createNonEmptyString(description);
    return this;
  }

  setAuthor(author: string): this {
    this.manifest.author = createNonEmptyString(author);
    return this;
  }

  setLicense(license: string): this {
    this.manifest.license = createNonEmptyString(license);
    return this;
  }

  addDependency(name: string, version: string): this {
    const { createPluginName, createPluginVersion, createPluginId } = require('./plugin-interfaces');
    const pluginId = createPluginId(createPluginName(name), createPluginVersion(version));
    this.manifest.dependencies = [...(this.manifest.dependencies || []), pluginId];
    return this;
  }

  setLoadOrder(order: number): this {
    this.manifest.loadOrder = createNonNegativeNumber(order);
    return this;
  }

  setCritical(critical: boolean): this {
    this.manifest.critical = critical;
    return this;
  }

  setModule(module: StrictPluginModuleMeta): this {
    this.manifest.module = module;
    return this;
  }

  setCompatibility(compatibility: StrictPluginCompatibility): this {
    this.manifest.compatibility = compatibility;
    return this;
  }

  build(): StrictPluginManifest {
    const { name, version, description, author, license, module } = this.manifest;
    
    if (!name || !version || !description || !author || !license || !module) {
      throw new Error('Missing required manifest fields: name, version, description, author, license, and module are required');
    }

    return {
      name,
      version,
      description,
      author,
      license,
      module,
      ...this.manifest,
    } as StrictPluginManifest;
  }
}

// Type-safe factory functions
export function createStrictPluginManifest(config: {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  module: StrictPluginModuleMeta;
  dependencies?: Array<{ name: string; version: string }>;
  loadOrder?: number;
  critical?: boolean;
  compatibility?: StrictPluginCompatibility;
}): StrictPluginManifest {
  const builder = new PluginManifestBuilder()
    .setName(config.name)
    .setVersion(config.version)
    .setDescription(config.description)
    .setAuthor(config.author)
    .setLicense(config.license)
    .setModule(config.module);

  if (config.dependencies) {
    config.dependencies.forEach(dep => builder.addDependency(dep.name, dep.version));
  }

  if (config.loadOrder !== undefined) {
    builder.setLoadOrder(config.loadOrder);
  }

  if (config.critical !== undefined) {
    builder.setCritical(config.critical);
  }

  if (config.compatibility) {
    builder.setCompatibility(config.compatibility);
  }

  return builder.build();
}

// Plugin identifier utilities
export function parsePluginId(pluginId: PluginId): { name: PluginName; version: PluginVersion } {
  const parts = pluginId.split('@');
  if (parts.length !== 2) {
    throw new Error(`Invalid plugin ID format: ${pluginId}. Expected format: name@version`);
  }
  
  const [name, version] = parts;
  const { createPluginName, createPluginVersion } = require('./plugin-interfaces');
  return {
    name: createPluginName(name),
    version: createPluginVersion(version),
  };
}

export function getPluginId(manifest: StrictPluginManifest): PluginId {
  const { createPluginId } = require('./plugin-interfaces');
  return createPluginId(manifest.name, manifest.version);
}

// Conversion utilities between strict and loose types
export function toStrictManifest(manifest: any): StrictPluginManifest {
  const {
    createPluginName,
    createPluginVersion,
    createPluginId,
  } = require('./plugin-interfaces');

  const strictModule: StrictPluginModuleMeta = {
    controllers: manifest.module?.controllers?.map(createNonEmptyString),
    providers: manifest.module?.providers?.map(createNonEmptyString),
    exports: manifest.module?.exports?.map(createNonEmptyString),
    imports: manifest.module?.imports?.map(createNonEmptyString),
    guards: manifest.module?.guards,
    crossPluginServices: manifest.module?.crossPluginServices,
  };

  const strictCompatibility: StrictPluginCompatibility | undefined = manifest.compatibility
    ? {
        minimumHostVersion: manifest.compatibility.minimumHostVersion
          ? createPluginVersion(manifest.compatibility.minimumHostVersion)
          : undefined,
        maximumHostVersion: manifest.compatibility.maximumHostVersion
          ? createPluginVersion(manifest.compatibility.maximumHostVersion)
          : undefined,
        nodeVersion: createPluginVersion(manifest.compatibility.nodeVersion),
      }
    : undefined;

  const dependencies = manifest.dependencies?.map((dep: string) => {
    const [name, version] = dep.split('@');
    return createPluginId(createPluginName(name || dep), createPluginVersion(version || '1.0.0'));
  });

  return {
    name: createPluginName(manifest.name),
    version: createPluginVersion(manifest.version),
    description: createNonEmptyString(manifest.description),
    author: createNonEmptyString(manifest.author),
    license: createNonEmptyString(manifest.license),
    dependencies,
    loadOrder: manifest.loadOrder !== undefined ? createNonNegativeNumber(manifest.loadOrder) : undefined,
    critical: manifest.critical,
    security: manifest.security,
    compatibility: strictCompatibility,
    module: strictModule,
  };
}

export function fromStrictManifest(manifest: StrictPluginManifest): any {
  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    license: manifest.license,
    dependencies: manifest.dependencies,
    loadOrder: manifest.loadOrder,
    critical: manifest.critical,
    security: manifest.security,
    compatibility: manifest.compatibility
      ? {
          minimumHostVersion: manifest.compatibility.minimumHostVersion,
          maximumHostVersion: manifest.compatibility.maximumHostVersion,
          nodeVersion: manifest.compatibility.nodeVersion,
        }
      : undefined,
    module: {
      controllers: manifest.module.controllers,
      providers: manifest.module.providers,
      exports: manifest.module.exports,
      imports: manifest.module.imports,
      guards: manifest.module.guards,
      crossPluginServices: manifest.module.crossPluginServices,
    },
  };
}