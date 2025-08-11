/**
 * Shared interfaces for plugin system to avoid circular dependencies
 */

/**
 * Basic plugin metadata interface
 */
export interface IPluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
}

/**
 * Plugin status enumeration
 */
export enum PluginStatus {
  LOADING = 'loading',
  LOADED = 'loaded',
  FAILED = 'failed',
  UNLOADING = 'unloading',
  UNLOADED = 'unloaded',
}

/**
 * Plugin lifecycle interface
 */
export interface IPluginLifecycle {
  onLoad?(): Promise<void> | void;
  onUnload?(): Promise<void> | void;
  onError?(error: Error): Promise<void> | void;
}

/**
 * Plugin permissions interface
 */
export interface IPluginPermissions {
  services: string[];
  modules: string[];
}

/**
 * Plugin security configuration
 */
export interface IPluginSecurity {
  trustLevel: string;
  permissions?: IPluginPermissions;
}