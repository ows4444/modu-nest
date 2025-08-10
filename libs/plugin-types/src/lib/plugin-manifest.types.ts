// Import types that will be referenced
import type { GuardEntry, CrossPluginServiceConfig, PluginSecurity } from './plugin-security.types';

export interface PluginModuleMeta {
  controllers?: string[];
  providers?: string[];
  exports?: string[];
  imports?: string[];
  guards?: GuardEntry[];
  crossPluginServices?: CrossPluginServiceConfig[];
}

export interface PluginCompatibility {
  minimumHostVersion?: string;
  maximumHostVersion?: string;
  nodeVersion: string;
}

export interface PluginPermissions {
  services?: string[];
  modules?: string[];
  network?: {
    outbound?: boolean;
    inbound?: boolean;
    allowedHosts?: string[];
    allowedPorts?: number[];
  };
  environment?: {
    canReadEnvVars?: boolean;
    allowedEnvVars?: string[];
  };
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dependencies?: string[];
  loadOrder?: number;
  critical?: boolean;
  security?: PluginSecurity;
  compatibility?: PluginCompatibility;
  permissions?: PluginPermissions;
  config?: Record<string, any>;
  module: PluginModuleMeta;
}

export interface PluginMetadata extends PluginManifest {
  uploadedAt: string;
  fileSize: number;
  checksum: string;
}

export interface PluginPackage {
  metadata: PluginMetadata;
  filePath: string;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  module: unknown;
  instance: unknown;
}

export interface PluginUpdateInfo {
  name: string;
  currentVersion: string;
  availableVersion: string;
}

export interface PluginValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PluginConfig {
  allowedExtensions: string[];
  allowedDirectories: string[];
  maxFileSize: number;
  storageLocation: string;
}

export enum PluginStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  LOADING = 'loading',
}

export interface PluginVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string | null;
  build?: string | null;
  raw?: string;
}
