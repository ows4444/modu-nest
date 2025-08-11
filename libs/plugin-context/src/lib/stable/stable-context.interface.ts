/**
 * Stable Plugin Context API - v1.0
 * 
 * This file defines the stable, versioned plugin context API that plugins
 * can rely on. Changes to this interface will be versioned and backward
 * compatibility will be maintained.
 */

import { VersionedInterface, PluginAPIVersion } from '@libs/plugin-core';

/**
 * Stable plugin context interface that won't change without version increment
 */
export interface StablePluginContext extends VersionedInterface {
  readonly pluginName: string;
  readonly version: string;
  
  // File operations - stable API
  readonly files: StableFileAPI;
  
  // Network operations - stable API  
  readonly network: StableNetworkAPI;
  
  // Database operations - stable API
  readonly database: StableDatabaseAPI;
  
  // Utilities and metrics - stable API
  readonly utils: StableUtilsAPI;
}

/**
 * Stable file access API
 */
export interface StableFileAPI {
  /**
   * Read file contents as buffer
   */
  read(path: string): Promise<Buffer>;
  
  /**
   * Write data to file
   */
  write(path: string, data: string | Buffer): Promise<void>;
  
  /**
   * Check if file exists
   */
  exists(path: string): Promise<boolean>;
  
  /**
   * List files in directory
   */
  list(directory: string): Promise<string[]>;
  
  /**
   * Delete file
   */
  delete(path: string): Promise<void>;
  
  /**
   * Get file stats
   */
  stats(path: string): Promise<StableFileStats>;
}

/**
 * Stable file stats interface
 */
export interface StableFileStats {
  readonly size: number;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly modified: Date;
  readonly created: Date;
}

/**
 * Stable network access API
 */
export interface StableNetworkAPI {
  /**
   * Make GET request
   */
  get(url: string, options?: StableRequestOptions): Promise<StableResponse>;
  
  /**
   * Make POST request
   */
  post(url: string, body?: string | Buffer | object, options?: StableRequestOptions): Promise<StableResponse>;
  
  /**
   * Make PUT request
   */
  put(url: string, body?: string | Buffer | object, options?: StableRequestOptions): Promise<StableResponse>;
  
  /**
   * Make DELETE request
   */
  delete(url: string, options?: StableRequestOptions): Promise<StableResponse>;
  
  /**
   * Make generic HTTP request
   */
  request(request: StableRequest): Promise<StableResponse>;
}

/**
 * Stable HTTP request options
 */
export interface StableRequestOptions {
  readonly headers?: Record<string, string>;
  readonly timeout?: number;
  readonly maxRedirects?: number;
}

/**
 * Stable HTTP request interface
 */
export interface StableRequest extends StableRequestOptions {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  readonly url: string;
  readonly body?: string | Buffer | object;
}

/**
 * Stable HTTP response interface
 */
export interface StableResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly data: Buffer;
  
  /**
   * Parse response body as JSON
   */
  json<T = unknown>(): T;
  
  /**
   * Get response body as text
   */
  text(): string;
  
  /**
   * Get response body as buffer
   */
  buffer(): Buffer;
}

/**
 * Stable database access API
 */
export interface StableDatabaseAPI {
  /**
   * Execute raw SQL query
   */
  query(sql: string, params?: unknown[]): Promise<StableDatabaseResult>;
  
  /**
   * Select records from table
   */
  select<T = unknown>(table: string, where?: string | object, params?: unknown[]): Promise<StableDatabaseResult<T>>;
  
  /**
   * Insert record into table
   */
  insert(table: string, data: object): Promise<StableDatabaseResult>;
  
  /**
   * Update records in table
   */
  update(table: string, data: object, where: string | object, params?: unknown[]): Promise<StableDatabaseResult>;
  
  /**
   * Delete records from table
   */
  delete(table: string, where: string | object, params?: unknown[]): Promise<StableDatabaseResult>;
  
  /**
   * Start database transaction
   */
  transaction(): Promise<StableDatabaseTransaction>;
}

/**
 * Stable database result interface
 */
export interface StableDatabaseResult<T = unknown> {
  readonly rows: T[];
  readonly rowCount: number;
  readonly executionTime: number;
  readonly insertId?: number;
  readonly affectedRows?: number;
}

/**
 * Stable database transaction interface
 */
export interface StableDatabaseTransaction {
  readonly id: string;
  
  /**
   * Execute query within transaction
   */
  query(sql: string, params?: unknown[]): Promise<StableDatabaseResult>;
  
  /**
   * Commit transaction
   */
  commit(): Promise<void>;
  
  /**
   * Rollback transaction
   */
  rollback(): Promise<void>;
}

/**
 * Stable utilities API
 */
export interface StableUtilsAPI {
  /**
   * Get plugin metrics
   */
  getMetrics(): Promise<StableMetrics>;
  
  /**
   * Reset metrics counters
   */
  resetMetrics(): Promise<void>;
  
  /**
   * Validate permission for operation
   */
  checkPermission(operation: string, resource?: string): Promise<boolean>;
  
  /**
   * Log message (respects plugin logging configuration)
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: object): Promise<void>;
  
  /**
   * Get plugin configuration
   */
  getConfig(): Promise<StablePluginConfig>;
  
  /**
   * Update plugin configuration (if allowed)
   */
  updateConfig(config: Partial<StablePluginConfig>): Promise<void>;
}

/**
 * Stable plugin metrics interface
 */
export interface StableMetrics {
  readonly files: {
    readonly operations: number;
    readonly bytesRead: number;
    readonly bytesWritten: number;
    readonly errors: number;
  };
  
  readonly network: {
    readonly requests: number;
    readonly bandwidth: number;
    readonly averageResponseTime: number;
    readonly errors: number;
    readonly rateLimitHits: number;
  };
  
  readonly database: {
    readonly queries: number;
    readonly totalTime: number;
    readonly averageTime: number;
    readonly errors: number;
    readonly transactions: number;
  };
  
  readonly resources: {
    readonly memoryUsage: number;
    readonly cpuUsage: number;
    readonly activeOperations: number;
    readonly uptime: number;
  };
}

/**
 * Stable plugin configuration interface
 */
export interface StablePluginConfig {
  readonly name: string;
  readonly version: string;
  
  readonly limits: {
    readonly maxMemory: number;
    readonly maxCpuTime: number;
    readonly maxOperations: number;
    readonly maxFileSize: number;
    readonly maxNetworkRequests: number;
    readonly maxDatabaseQueries: number;
  };
  
  readonly permissions: {
    readonly files: {
      readonly read: boolean;
      readonly write: boolean;
      readonly delete: boolean;
      readonly allowedPaths: string[];
    };
    readonly network: {
      readonly enabled: boolean;
      readonly allowedDomains: string[];
      readonly blockedDomains: string[];
      readonly allowedPorts: number[];
    };
    readonly database: {
      readonly enabled: boolean;
      readonly allowedTables: string[];
      readonly allowedOperations: string[];
    };
  };
}

/**
 * Error types for stable API
 */
export class StableContextError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: object
  ) {
    super(message);
    this.name = 'StableContextError';
  }
}

export class StablePermissionError extends StableContextError {
  constructor(operation: string, resource?: string) {
    super(
      `Permission denied for operation '${operation}' on resource '${resource || 'unknown'}'`,
      'PERMISSION_DENIED',
      { operation, resource }
    );
    this.name = 'StablePermissionError';
  }
}

export class StableLimitError extends StableContextError {
  constructor(limitType: string, current: number, maximum: number) {
    super(
      `${limitType} limit exceeded: ${current}/${maximum}`,
      'LIMIT_EXCEEDED',
      { limitType, current, maximum }
    );
    this.name = 'StableLimitError';
  }
}

/**
 * Context factory for creating versioned contexts
 */
export interface StableContextFactory {
  /**
   * Create stable plugin context
   */
  createContext(
    pluginName: string,
    version: PluginAPIVersion,
    options?: StableContextOptions
  ): Promise<StablePluginContext>;
  
  /**
   * Check if context version is supported
   */
  isVersionSupported(version: PluginAPIVersion): boolean;
  
  /**
   * Get supported versions
   */
  getSupportedVersions(): PluginAPIVersion[];
}

/**
 * Options for creating stable context
 */
export interface StableContextOptions {
  readonly config?: Partial<StablePluginConfig>;
  readonly sandbox?: boolean;
  readonly debugMode?: boolean;
}