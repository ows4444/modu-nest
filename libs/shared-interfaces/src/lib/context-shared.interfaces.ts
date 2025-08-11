/**
 * Shared context interfaces to prevent circular dependencies
 */

/**
 * File access configuration interface
 */
export interface IFileAccessConfig {
  allowedExtensions: string[];
  maxFileSize: number;
  allowWrite: boolean;
  allowDelete: boolean;
  allowExecute: boolean;
}

/**
 * Network access configuration interface
 */
export interface INetworkAccessConfig {
  allowedDomains: string[];
  blockedDomains: string[];
  allowedPorts: number[];
  blockedPorts: number[];
  maxRequestSize: number;
  requestTimeout: number;
}

/**
 * Database access configuration interface
 */
export interface IDatabaseAccessConfig {
  allowedDatabases: string[];
  allowedTables: string[];
  allowedOperations: string[];
  maxQueryComplexity: number;
  queryTimeout: number;
  maxResultSize: number;
}

/**
 * Plugin context configuration interface
 */
export interface IPluginContextConfig {
  pluginName: string;
  version: string;
  fileAccess: IFileAccessConfig;
  networkAccess: INetworkAccessConfig;
  databaseAccess: IDatabaseAccessConfig;
}

/**
 * Plugin metrics interface
 */
export interface IPluginMetrics {
  memoryUsage: number;
  cpuUsage: number;
  requestCount: number;
  errorCount: number;
  uptime: number;
}

/**
 * Context service interface
 */
export interface IContextService {
  getConfig(pluginName: string): IPluginContextConfig;
  getMetrics(pluginName: string): IPluginMetrics;
  validateAccess(pluginName: string, resource: string, operation: string): boolean;
}