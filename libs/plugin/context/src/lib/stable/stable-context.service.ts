/**
 * Stable Plugin Context Service Implementation
 *
 * Provides a stable, versioned API for plugin contexts that maintains
 * backward compatibility across framework updates.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  StablePluginContext,
  StableContextFactory,
  StableContextOptions,
  StableFileAPI,
  StableNetworkAPI,
  StableDatabaseAPI,
  StableUtilsAPI,
  StableMetrics,
  StablePluginConfig,
  StableContextError,
} from './stable-context.interface';
import { PluginAPIVersion, CURRENT_API_VERSION, createVersionedInterface, VersionedInterface } from '@plugin/core';
import { PluginContextService } from '../plugin-context.service';

@Injectable()
export class StableContextService implements StableContextFactory {
  private readonly logger = new Logger(StableContextService.name);
  private readonly stableContexts = new Map<string, StablePluginContext>();

  // Supported stable API versions
  private readonly SUPPORTED_STABLE_VERSIONS = [
    PluginAPIVersion.V2_0, // Current stable version
    PluginAPIVersion.V1_1, // Previous stable version with compatibility layer
  ];

  constructor(private readonly pluginContextService: PluginContextService) {}

  /**
   * Create a stable plugin context with version compatibility
   */
  async createContext(
    pluginName: string,
    version: PluginAPIVersion = CURRENT_API_VERSION,
    options: StableContextOptions = {}
  ): Promise<StablePluginContext> {
    this.logger.debug(`Creating stable context for plugin ${pluginName} with API version ${version}`);

    if (!this.isVersionSupported(version)) {
      throw new StableContextError(`Unsupported API version: ${version}`, 'UNSUPPORTED_VERSION', {
        pluginName,
        version,
        supportedVersions: this.SUPPORTED_STABLE_VERSIONS,
      });
    }

    // Create underlying context
    const underlyingContext = await this.pluginContextService.createPluginContext(
      pluginName,
      options.config as any // Type conversion handled internally
    );

    // Create stable context wrapper
    const stableContext = this.wrapWithStableAPI(pluginName, version, underlyingContext, options);

    this.stableContexts.set(pluginName, stableContext);
    return stableContext;
  }

  /**
   * Check if API version is supported
   */
  isVersionSupported(version: PluginAPIVersion): boolean {
    return this.SUPPORTED_STABLE_VERSIONS.includes(version);
  }

  /**
   * Get list of supported versions
   */
  getSupportedVersions(): PluginAPIVersion[] {
    return [...this.SUPPORTED_STABLE_VERSIONS];
  }

  /**
   * Get stable context for a plugin
   */
  getStableContext(pluginName: string): StablePluginContext | null {
    return this.stableContexts.get(pluginName) || null;
  }

  /**
   * Destroy stable context
   */
  async destroyContext(pluginName: string): Promise<void> {
    const context = this.stableContexts.get(pluginName);
    if (context) {
      await this.pluginContextService.destroyPluginContext(pluginName);
      this.stableContexts.delete(pluginName);
      this.logger.debug(`Stable context destroyed for plugin ${pluginName}`);
    }
  }

  /**
   * Wrap underlying context with stable API
   */
  private wrapWithStableAPI(
    pluginName: string,
    version: PluginAPIVersion,
    underlyingContext: any,
    options: StableContextOptions
  ): StablePluginContext {
    const stableFiles = this.createStableFileAPI(pluginName, underlyingContext.fileAccess);
    const stableNetwork = this.createStableNetworkAPI(pluginName, underlyingContext.networkAccess);
    const stableDatabase = this.createStableDatabaseAPI(pluginName, underlyingContext.databaseAccess);
    const stableUtils = this.createStableUtilsAPI(pluginName, underlyingContext.utils);

    const stableContext: Omit<StablePluginContext, keyof VersionedInterface> = {
      pluginName,
      version: underlyingContext.config.version,
      files: stableFiles,
      network: stableNetwork,
      database: stableDatabase,
      utils: stableUtils,
    };

    return createVersionedInterface(stableContext, version, '1.0');
  }

  /**
   * Create stable file API wrapper
   */
  private createStableFileAPI(pluginName: string, fileAccess: any): StableFileAPI {
    const logger = this.logger;
    return {
      async read(path: string): Promise<Buffer> {
        try {
          return await fileAccess.readFile(path);
        } catch (error) {
          const errorMessage = error instanceof Error ? (error as Error).message : String(error);
          throw new StableContextError(`File read failed: ${errorMessage}`, 'FILE_READ_ERROR', {
            pluginName,
            path,
            error: errorMessage,
          });
        }
      },

      async write(path: string, data: string | Buffer): Promise<void> {
        try {
          return await fileAccess.writeFile(path, data);
        } catch (error) {
          throw new StableContextError(`File write failed: ${(error as Error).message}`, 'FILE_WRITE_ERROR', {
            pluginName,
            path,
            error: (error as Error).message,
          });
        }
      },

      async exists(path: string): Promise<boolean> {
        try {
          return await fileAccess.exists(path);
        } catch (error) {
          logger.warn(`File exists check failed for ${path}:`, error);
          return false;
        }
      },

      async list(directory: string): Promise<string[]> {
        try {
          return await fileAccess.listFiles(directory);
        } catch (error) {
          throw new StableContextError(`Directory listing failed: ${(error as Error).message}`, 'FILE_LIST_ERROR', {
            pluginName,
            directory,
            error: (error as Error).message,
          });
        }
      },

      async delete(path: string): Promise<void> {
        try {
          return await fileAccess.deleteFile(path);
        } catch (error) {
          throw new StableContextError(`File deletion failed: ${(error as Error).message}`, 'FILE_DELETE_ERROR', {
            pluginName,
            path,
            error: (error as Error).message,
          });
        }
      },

      async stats(path: string): Promise<any> {
        try {
          const stat = await fileAccess.stat(path);
          return {
            size: stat.size || 0,
            isFile: stat.isFile(),
            isDirectory: stat.isDirectory(),
            modified: stat.mtime || new Date(),
            created: stat.birthtime || stat.mtime || new Date(),
          };
        } catch (error) {
          throw new StableContextError(`File stats failed: ${(error as Error).message}`, 'FILE_STATS_ERROR', {
            pluginName,
            path,
            error: (error as Error).message,
          });
        }
      },
    };
  }

  /**
   * Create stable network API wrapper
   */
  private createStableNetworkAPI(pluginName: string, networkAccess: any): StableNetworkAPI {
    return {
      async get(url: string, options: any = {}): Promise<any> {
        try {
          return await networkAccess.get(url, options.headers);
        } catch (error) {
          throw new StableContextError(`Network GET failed: ${(error as Error).message}`, 'NETWORK_ERROR', {
            pluginName,
            url,
            method: 'GET',
            error: (error as Error).message,
          });
        }
      },

      async post(url: string, body?: any, options: any = {}): Promise<any> {
        try {
          return await networkAccess.post(url, body, options.headers);
        } catch (error) {
          throw new StableContextError(`Network POST failed: ${(error as Error).message}`, 'NETWORK_ERROR', {
            pluginName,
            url,
            method: 'POST',
            error: (error as Error).message,
          });
        }
      },

      async put(url: string, body?: any, options: any = {}): Promise<any> {
        try {
          return await networkAccess.put(url, body, options.headers);
        } catch (error) {
          throw new StableContextError(`Network PUT failed: ${(error as Error).message}`, 'NETWORK_ERROR', {
            pluginName,
            url,
            method: 'PUT',
            error: (error as Error).message,
          });
        }
      },

      async delete(url: string, options: any = {}): Promise<any> {
        try {
          return await networkAccess.delete(url, options.headers);
        } catch (error) {
          throw new StableContextError(`Network DELETE failed: ${(error as Error).message}`, 'NETWORK_ERROR', {
            pluginName,
            url,
            method: 'DELETE',
            error: (error as Error).message,
          });
        }
      },

      async request(request: any): Promise<any> {
        try {
          return await networkAccess.makeRequest(request);
        } catch (error) {
          throw new StableContextError(`Network request failed: ${(error as Error).message}`, 'NETWORK_ERROR', {
            pluginName,
            request: request.url,
            method: request.method,
            error: (error as Error).message,
          });
        }
      },
    };
  }

  /**
   * Create stable database API wrapper
   */
  private createStableDatabaseAPI(pluginName: string, databaseAccess: any): StableDatabaseAPI {
    return {
      async query(sql: string, params?: unknown[]): Promise<any> {
        try {
          return await databaseAccess.query(sql, params);
        } catch (error) {
          throw new StableContextError(`Database query failed: ${(error as Error).message}`, 'DATABASE_ERROR', {
            pluginName,
            sql: sql.substring(0, 100),
            error: (error as Error).message,
          });
        }
      },

      async select(table: string, where?: string | object, params?: unknown[]): Promise<any> {
        try {
          return await databaseAccess.select(table, where, params);
        } catch (error) {
          throw new StableContextError(`Database select failed: ${(error as Error).message}`, 'DATABASE_ERROR', {
            pluginName,
            table,
            where,
            error: (error as Error).message,
          });
        }
      },

      async insert(table: string, data: object): Promise<any> {
        try {
          return await databaseAccess.insert(table, data);
        } catch (error) {
          throw new StableContextError(`Database insert failed: ${(error as Error).message}`, 'DATABASE_ERROR', {
            pluginName,
            table,
            error: (error as Error).message,
          });
        }
      },

      async update(table: string, data: object, where: string | object, params?: unknown[]): Promise<any> {
        try {
          return await databaseAccess.update(table, data, where, params);
        } catch (error) {
          throw new StableContextError(`Database update failed: ${(error as Error).message}`, 'DATABASE_ERROR', {
            pluginName,
            table,
            where,
            error: (error as Error).message,
          });
        }
      },

      async delete(table: string, where: string | object, params?: unknown[]): Promise<any> {
        try {
          return await databaseAccess.delete(table, where, params);
        } catch (error) {
          throw new StableContextError(`Database delete failed: ${(error as Error).message}`, 'DATABASE_ERROR', {
            pluginName,
            table,
            where,
            error: (error as Error).message,
          });
        }
      },

      async transaction(): Promise<any> {
        try {
          const txId = await databaseAccess.startTransaction();
          return {
            id: txId,
            query: async (sql: string, params?: unknown[]) => {
              return await databaseAccess.query(sql, params);
            },
            commit: async () => {
              return await databaseAccess.commitTransaction(txId);
            },
            rollback: async () => {
              return await databaseAccess.rollbackTransaction(txId);
            },
          };
        } catch (error) {
          throw new StableContextError(`Database transaction failed: ${(error as Error).message}`, 'DATABASE_ERROR', {
            pluginName,
            operation: 'transaction',
            error: (error as Error).message,
          });
        }
      },
    };
  }

  /**
   * Create stable utils API wrapper
   */
  private createStableUtilsAPI(pluginName: string, utils: any): StableUtilsAPI {
    const logger = this.logger;
    const pluginContextService = this.pluginContextService;
    const transformToStableConfig = this.transformToStableConfig.bind(this);
    const transformFromStableConfig = this.transformFromStableConfig.bind(this);
    const stableContexts = this.stableContexts;
    
    return {
      async getMetrics(): Promise<StableMetrics> {
        try {
          const metrics = await utils.getMetrics();
          // Transform to stable format
          return {
            files: {
              operations: metrics.fileAccess?.operationsCount || 0,
              bytesRead: metrics.fileAccess?.bytesRead || 0,
              bytesWritten: metrics.fileAccess?.bytesWritten || 0,
              errors: metrics.fileAccess?.errorCount || 0,
            },
            network: {
              requests: metrics.networkAccess?.requestCount || 0,
              bandwidth: metrics.networkAccess?.totalBandwidth || 0,
              averageResponseTime: metrics.networkAccess?.averageResponseTime || 0,
              errors: metrics.networkAccess?.errorCount || 0,
              rateLimitHits: metrics.networkAccess?.rateLimitViolations || 0,
            },
            database: {
              queries: metrics.databaseAccess?.queryCount || 0,
              totalTime: metrics.databaseAccess?.totalExecutionTime || 0,
              averageTime: metrics.databaseAccess?.averageExecutionTime || 0,
              errors: metrics.databaseAccess?.errorCount || 0,
              transactions: metrics.databaseAccess?.transactionCount || 0,
            },
            resources: {
              memoryUsage: metrics.resourceUsage?.memoryUsage || 0,
              cpuUsage: metrics.resourceUsage?.cpuUsage || 0,
              activeOperations: metrics.resourceUsage?.activeOperations || 0,
              uptime: Date.now() - (stableContexts.get(pluginName) as any)?._createdAt || 0,
            },
          };
        } catch (error) {
          throw new StableContextError(`Metrics retrieval failed: ${(error as Error).message}`, 'METRICS_ERROR', {
            pluginName,
            error: (error as Error).message,
          });
        }
      },

      async resetMetrics(): Promise<void> {
        try {
          return await utils.resetMetrics();
        } catch (error) {
          throw new StableContextError(`Metrics reset failed: ${(error as Error).message}`, 'METRICS_ERROR', {
            pluginName,
            error: (error as Error).message,
          });
        }
      },

      async checkPermission(operation: string, resource?: string): Promise<boolean> {
        try {
          return await utils.validatePermissions(operation, resource);
        } catch (error) {
          logger.warn(`Permission check failed for ${pluginName}: ${(error as Error).message}`);
          return false;
        }
      },

      async log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: object): Promise<void> {
        const logMessage = `[${pluginName}] ${message}`;
        switch (level) {
          case 'debug':
            logger.debug(logMessage, meta);
            break;
          case 'info':
            logger.log(logMessage, meta);
            break;
          case 'warn':
            logger.warn(logMessage, meta);
            break;
          case 'error':
            logger.error(logMessage, meta);
            break;
        }
      },

      async getConfig(): Promise<StablePluginConfig> {
        // Transform internal config to stable format
        const context = pluginContextService.getPluginContext(pluginName);
        if (!context) {
          throw new StableContextError('Plugin context not found', 'CONTEXT_NOT_FOUND', { pluginName });
        }

        return transformToStableConfig(context.config);
      },

      async updateConfig(config: Partial<StablePluginConfig>): Promise<void> {
        try {
          // Transform stable config to internal format and update
          const internalConfig = transformFromStableConfig(config);
          return await utils.updateConfig(internalConfig);
        } catch (error) {
          throw new StableContextError(`Config update failed: ${(error as Error).message}`, 'CONFIG_ERROR', {
            pluginName,
            error: (error as Error).message,
          });
        }
      },
    };
  }

  /**
   * Transform internal config to stable format
   */
  private transformToStableConfig(config: any): StablePluginConfig {
    return {
      name: config.pluginName,
      version: config.version,
      limits: {
        maxMemory: config.resourceLimits?.maxMemoryUsage || 0,
        maxCpuTime: config.resourceLimits?.maxCpuTime || 0,
        maxOperations: config.resourceLimits?.maxConcurrentOperations || 0,
        maxFileSize: config.fileAccess?.maxFileSize || 0,
        maxNetworkRequests: config.networkAccess?.rateLimits?.requestsPerMinute || 0,
        maxDatabaseQueries: config.databaseAccess?.maxQueryComplexity || 0,
      },
      permissions: {
        files: {
          read: true, // Simplified for stable API
          write: config.fileAccess?.allowWrite || false,
          delete: config.fileAccess?.allowDelete || false,
          allowedPaths: config.fileAccess?.allowedExtensions || [],
        },
        network: {
          enabled: true,
          allowedDomains: config.networkAccess?.allowedDomains || [],
          blockedDomains: config.networkAccess?.blockedDomains || [],
          allowedPorts: config.networkAccess?.allowedPorts || [],
        },
        database: {
          enabled: true,
          allowedTables: config.databaseAccess?.allowedTables || [],
          allowedOperations: config.databaseAccess?.allowedOperations || [],
        },
      },
    };
  }

  /**
   * Transform stable config to internal format
   */
  private transformFromStableConfig(stableConfig: Partial<StablePluginConfig>): any {
    // Reverse transformation - simplified for this implementation
    return {
      resourceLimits: stableConfig.limits
        ? {
            maxMemoryUsage: stableConfig.limits.maxMemory,
            maxCpuTime: stableConfig.limits.maxCpuTime,
            maxConcurrentOperations: stableConfig.limits.maxOperations,
          }
        : undefined,
      fileAccess: stableConfig.permissions?.files
        ? {
            allowWrite: stableConfig.permissions.files.write,
            allowDelete: stableConfig.permissions.files.delete,
            maxFileSize: stableConfig.limits?.maxFileSize,
          }
        : undefined,
    };
  }
}
