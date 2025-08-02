export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dependencies?: string[];
  loadOrder?: number;
  module?: {
    controllers?: string[];
    providers?: string[];
    exports?: string[];
    imports?: string[];
  };
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

export type PluginLifecycleHook = 'beforeLoad' | 'afterLoad' | 'beforeUnload' | 'afterUnload' | 'onError';
