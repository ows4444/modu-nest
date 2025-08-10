import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FileAccessService } from './file-access.service';
import { NetworkAccessService, NetworkRequest, NetworkResponse } from './network-access.service';
import { DatabaseAccessService, DatabaseResult } from './database-access.service';
import { PluginContextConfigService, PluginContextConfig } from './plugin-context.config';

export interface PluginContextMetrics {
  fileAccess: {
    operationsCount: number;
    bytesRead: number;
    bytesWritten: number;
    errorCount: number;
  };
  networkAccess: {
    requestCount: number;
    totalBandwidth: number;
    averageResponseTime: number;
    errorCount: number;
    rateLimitViolations: number;
  };
  databaseAccess: {
    queryCount: number;
    totalExecutionTime: number;
    averageExecutionTime: number;
    errorCount: number;
    transactionCount: number;
    dataTransferred: number;
  };
  resourceUsage: {
    memoryUsage: number;
    cpuUsage: number;
    activeOperations: number;
  };
}

export interface PluginContext {
  pluginName: string;
  config: PluginContextConfig;
  fileAccess: {
    readFile: (path: string) => Promise<Buffer>;
    writeFile: (path: string, data: Buffer | string) => Promise<void>;
    deleteFile: (path: string) => Promise<void>;
    listFiles: (directory: string) => Promise<string[]>;
    exists: (path: string) => Promise<boolean>;
    stat: (path: string) => Promise<any>;
  };
  networkAccess: {
    get: (url: string, headers?: Record<string, string>) => Promise<NetworkResponse>;
    post: (url: string, body: string | Buffer, headers?: Record<string, string>) => Promise<NetworkResponse>;
    put: (url: string, body: string | Buffer, headers?: Record<string, string>) => Promise<NetworkResponse>;
    delete: (url: string, headers?: Record<string, string>) => Promise<NetworkResponse>;
    makeRequest: (request: NetworkRequest) => Promise<NetworkResponse>;
  };
  databaseAccess: {
    query: (sql: string, parameters?: any[]) => Promise<DatabaseResult>;
    select: (table: string, where?: string, parameters?: any[]) => Promise<DatabaseResult>;
    insert: (table: string, data: Record<string, any>) => Promise<DatabaseResult>;
    update: (table: string, data: Record<string, any>, where: string, parameters?: any[]) => Promise<DatabaseResult>;
    delete: (table: string, where: string, parameters?: any[]) => Promise<DatabaseResult>;
    startTransaction: () => Promise<string>;
    commitTransaction: (transactionId: string) => Promise<DatabaseResult[]>;
    rollbackTransaction: (transactionId: string) => Promise<void>;
  };
  utils: {
    getMetrics: () => Promise<PluginContextMetrics>;
    resetMetrics: () => Promise<void>;
    updateConfig: (config: Partial<PluginContextConfig>) => Promise<void>;
    validatePermissions: (operation: string, resource: string) => Promise<boolean>;
  };
}

@Injectable()
export class PluginContextService implements OnModuleInit {
  private readonly logger = new Logger(PluginContextService.name);
  private readonly activeContexts = new Map<string, PluginContext>();
  private readonly resourceUsageTracker = new Map<
    string,
    {
      memoryUsage: number;
      cpuUsage: number;
      activeOperations: number;
      lastUpdate: number;
    }
  >();

  constructor(
    private readonly configService: PluginContextConfigService,
    private readonly fileAccessService: FileAccessService,
    private readonly networkAccessService: NetworkAccessService,
    private readonly databaseAccessService: DatabaseAccessService
  ) {}

  async onModuleInit() {
    this.logger.log('Plugin Context Service initialized');
    // Start resource monitoring
    this.startResourceMonitoring();
  }

  async createPluginContext(pluginName: string, customConfig?: Partial<PluginContextConfig>): Promise<PluginContext> {
    this.logger.debug(`Creating plugin context for: ${pluginName}`);

    // Get plugin-specific configuration
    let config = this.configService.getPluginConfig(pluginName);
    if (customConfig) {
      if (!this.configService.validatePluginConfig(customConfig)) {
        throw new Error(`Invalid plugin configuration for ${pluginName}`);
      }
      // Merge custom config (this is simplified - in real implementation you'd deep merge)
      config = { ...config, ...customConfig };
    }

    // Create the plugin context
    const context: PluginContext = {
      pluginName,
      config,
      fileAccess: this.createFileAccessInterface(pluginName, config),
      networkAccess: this.createNetworkAccessInterface(pluginName, config),
      databaseAccess: this.createDatabaseAccessInterface(pluginName, config),
      utils: this.createUtilsInterface(pluginName, config),
    };

    // Store the active context
    this.activeContexts.set(pluginName, context);

    // Initialize resource tracking
    this.resourceUsageTracker.set(pluginName, {
      memoryUsage: 0,
      cpuUsage: 0,
      activeOperations: 0,
      lastUpdate: Date.now(),
    });

    this.logger.log(
      `Plugin context created for ${pluginName} with configuration: ${JSON.stringify({
        fileAccess: !!config.fileAccess,
        networkAccess: !!config.networkAccess,
        databaseAccess: !!config.databaseAccess,
        sandbox: config.sandbox.enabled,
      })}`
    );

    return context;
  }

  async destroyPluginContext(pluginName: string): Promise<void> {
    this.logger.debug(`Destroying plugin context for: ${pluginName}`);

    // Clean up resources
    this.activeContexts.delete(pluginName);
    this.resourceUsageTracker.delete(pluginName);

    // Reset service metrics
    this.networkAccessService.resetMetrics(pluginName);
    this.networkAccessService.resetRateLimits(pluginName);
    this.databaseAccessService.resetMetrics(pluginName);
    this.databaseAccessService.clearCache(pluginName);

    this.logger.log(`Plugin context destroyed for ${pluginName}`);
  }

  getPluginContext(pluginName: string): PluginContext | null {
    return this.activeContexts.get(pluginName) || null;
  }

  getAllActiveContexts(): string[] {
    return Array.from(this.activeContexts.keys());
  }

  private createFileAccessInterface(pluginName: string, config: PluginContextConfig) {
    return {
      readFile: async (path: string): Promise<Buffer> => {
        await this.trackOperation(pluginName, 'file_read');
        const content = await this.fileAccessService.readFile(path, pluginName);
        return Buffer.from(content, 'utf8');
      },

      writeFile: async (path: string, data: Buffer | string): Promise<void> => {
        await this.trackOperation(pluginName, 'file_write');
        const content = data instanceof Buffer ? data.toString('utf8') : data;
        return this.fileAccessService.writeFile(path, content, pluginName);
      },

      deleteFile: async (path: string): Promise<void> => {
        await this.trackOperation(pluginName, 'file_delete');
        return this.fileAccessService.deleteFile(path, pluginName);
      },

      listFiles: async (directory: string): Promise<string[]> => {
        await this.trackOperation(pluginName, 'file_list');
        return this.fileAccessService.listFiles(directory, pluginName);
      },

      exists: async (path: string): Promise<boolean> => {
        await this.trackOperation(pluginName, 'file_exists');
        try {
          await this.fileAccessService.readFile(path, pluginName);
          return true;
        } catch {
          return false;
        }
      },

      stat: async (path: string): Promise<any> => {
        await this.trackOperation(pluginName, 'file_stat');
        // Mock implementation - in real scenario would use fs.stat
        return {
          isFile: () => true,
          isDirectory: () => false,
          size: 0,
          mtime: new Date(),
        };
      },
    };
  }

  private createNetworkAccessInterface(pluginName: string, config: PluginContextConfig) {
    return {
      get: async (url: string, headers?: Record<string, string>): Promise<NetworkResponse> => {
        await this.trackOperation(pluginName, 'network_get');
        return this.networkAccessService.get(pluginName, config.networkAccess, url, headers);
      },

      post: async (url: string, body: string | Buffer, headers?: Record<string, string>): Promise<NetworkResponse> => {
        await this.trackOperation(pluginName, 'network_post');
        return this.networkAccessService.post(pluginName, config.networkAccess, url, body, headers);
      },

      put: async (url: string, body: string | Buffer, headers?: Record<string, string>): Promise<NetworkResponse> => {
        await this.trackOperation(pluginName, 'network_put');
        return this.networkAccessService.put(pluginName, config.networkAccess, url, body, headers);
      },

      delete: async (url: string, headers?: Record<string, string>): Promise<NetworkResponse> => {
        await this.trackOperation(pluginName, 'network_delete');
        return this.networkAccessService.delete(pluginName, config.networkAccess, url, headers);
      },

      makeRequest: async (request: NetworkRequest): Promise<NetworkResponse> => {
        await this.trackOperation(pluginName, 'network_request');
        return this.networkAccessService.makeRequest(pluginName, config.networkAccess, request);
      },
    };
  }

  private createDatabaseAccessInterface(pluginName: string, config: PluginContextConfig) {
    return {
      query: async (sql: string, parameters?: any[]): Promise<DatabaseResult> => {
        await this.trackOperation(pluginName, 'db_query');
        return this.databaseAccessService.executeQuery(pluginName, config.databaseAccess, { sql, parameters });
      },

      select: async (table: string, where?: string, parameters?: any[]): Promise<DatabaseResult> => {
        await this.trackOperation(pluginName, 'db_select');
        return this.databaseAccessService.select(pluginName, config.databaseAccess, table, where, parameters);
      },

      insert: async (table: string, data: Record<string, any>): Promise<DatabaseResult> => {
        await this.trackOperation(pluginName, 'db_insert');
        return this.databaseAccessService.insert(pluginName, config.databaseAccess, table, data);
      },

      update: async (
        table: string,
        data: Record<string, any>,
        where: string,
        parameters?: any[]
      ): Promise<DatabaseResult> => {
        await this.trackOperation(pluginName, 'db_update');
        return this.databaseAccessService.update(pluginName, config.databaseAccess, table, data, where, parameters);
      },

      delete: async (table: string, where: string, parameters?: any[]): Promise<DatabaseResult> => {
        await this.trackOperation(pluginName, 'db_delete');
        return this.databaseAccessService.delete(pluginName, config.databaseAccess, table, where, parameters);
      },

      startTransaction: async (): Promise<string> => {
        await this.trackOperation(pluginName, 'db_tx_start');
        return this.databaseAccessService.startTransaction(pluginName, config.databaseAccess);
      },

      commitTransaction: async (transactionId: string): Promise<DatabaseResult[]> => {
        await this.trackOperation(pluginName, 'db_tx_commit');
        return this.databaseAccessService.commitTransaction(pluginName, config.databaseAccess, transactionId);
      },

      rollbackTransaction: async (transactionId: string): Promise<void> => {
        await this.trackOperation(pluginName, 'db_tx_rollback');
        return this.databaseAccessService.rollbackTransaction(pluginName, transactionId);
      },
    };
  }

  private createUtilsInterface(pluginName: string, config: PluginContextConfig) {
    return {
      getMetrics: async (): Promise<PluginContextMetrics> => {
        const networkMetrics = this.networkAccessService.getMetrics(pluginName);
        const databaseMetrics = this.databaseAccessService.getMetrics(pluginName);
        const resourceUsage = this.resourceUsageTracker.get(pluginName);

        return {
          fileAccess: {
            operationsCount: 0, // Would be tracked by FileAccessService
            bytesRead: 0,
            bytesWritten: 0,
            errorCount: 0,
          },
          networkAccess: {
            requestCount: networkMetrics?.requestCount || 0,
            totalBandwidth: networkMetrics?.totalBandwidth || 0,
            averageResponseTime: networkMetrics?.averageResponseTime || 0,
            errorCount: networkMetrics?.errorCount || 0,
            rateLimitViolations: networkMetrics?.rateLimitViolations || 0,
          },
          databaseAccess: {
            queryCount: databaseMetrics?.queryCount || 0,
            totalExecutionTime: databaseMetrics?.totalExecutionTime || 0,
            averageExecutionTime: databaseMetrics?.averageExecutionTime || 0,
            errorCount: databaseMetrics?.errorCount || 0,
            transactionCount: databaseMetrics?.transactionCount || 0,
            dataTransferred: databaseMetrics?.dataTransferred || 0,
          },
          resourceUsage: {
            memoryUsage: resourceUsage?.memoryUsage || 0,
            cpuUsage: resourceUsage?.cpuUsage || 0,
            activeOperations: resourceUsage?.activeOperations || 0,
          },
        };
      },

      resetMetrics: async (): Promise<void> => {
        this.networkAccessService.resetMetrics(pluginName);
        this.databaseAccessService.resetMetrics(pluginName);
        const resourceUsage = this.resourceUsageTracker.get(pluginName);
        if (resourceUsage) {
          resourceUsage.memoryUsage = 0;
          resourceUsage.cpuUsage = 0;
          resourceUsage.activeOperations = 0;
          resourceUsage.lastUpdate = Date.now();
        }
      },

      updateConfig: async (newConfig: Partial<PluginContextConfig>): Promise<void> => {
        if (!this.configService.validatePluginConfig(newConfig)) {
          throw new Error(`Invalid plugin configuration update for ${pluginName}`);
        }
        this.configService.setPluginConfig(pluginName, newConfig);
        // Update the active context config
        const context = this.activeContexts.get(pluginName);
        if (context) {
          context.config = { ...context.config, ...newConfig };
        }
      },

      validatePermissions: async (operation: string, resource: string): Promise<boolean> => {
        // Implementation would depend on PluginPermissionService
        // Mock implementation - would integrate with actual permission service
        return Promise.resolve(true);
      },
    };
  }

  private async trackOperation(pluginName: string, operationType: string): Promise<void> {
    const resourceUsage = this.resourceUsageTracker.get(pluginName);
    if (resourceUsage) {
      resourceUsage.activeOperations++;

      // Check resource limits
      const config = this.configService.getPluginConfig(pluginName);
      if (resourceUsage.activeOperations > config.resourceLimits.maxConcurrentOperations) {
        resourceUsage.activeOperations--;
        throw new Error(`Plugin ${pluginName} exceeded maximum concurrent operations limit`);
      }

      // Simulate resource usage tracking
      resourceUsage.memoryUsage += Math.random() * 1024 * 1024; // Random memory usage
      resourceUsage.cpuUsage = Math.min(100, resourceUsage.cpuUsage + Math.random() * 5);

      setTimeout(() => {
        resourceUsage.activeOperations = Math.max(0, resourceUsage.activeOperations - 1);
      }, 1000);
    }

    this.logger.debug(`Plugin ${pluginName} performed operation: ${operationType}`);
  }

  private startResourceMonitoring(): void {
    setInterval(() => {
      for (const [pluginName, resourceUsage] of this.resourceUsageTracker) {
        const config = this.configService.getPluginConfig(pluginName);

        // Check memory limits
        if (resourceUsage.memoryUsage > config.resourceLimits.maxMemoryUsage) {
          this.logger.warn(
            `Plugin ${pluginName} exceeded memory limit: ${resourceUsage.memoryUsage}/${config.resourceLimits.maxMemoryUsage}`
          );
        }

        // Decay resource usage over time
        resourceUsage.memoryUsage = Math.max(0, resourceUsage.memoryUsage * 0.99);
        resourceUsage.cpuUsage = Math.max(0, resourceUsage.cpuUsage * 0.95);
        resourceUsage.lastUpdate = Date.now();
      }
    }, 5000); // Check every 5 seconds
  }

  // Admin methods
  async getSystemMetrics(): Promise<{
    totalActiveContexts: number;
    totalMemoryUsage: number;
    totalCpuUsage: number;
    pluginMetrics: Record<string, PluginContextMetrics>;
  }> {
    const pluginMetrics: Record<string, PluginContextMetrics> = {};
    let totalMemoryUsage = 0;
    let totalCpuUsage = 0;

    for (const pluginName of this.activeContexts.keys()) {
      const context = this.activeContexts.get(pluginName)!;
      pluginMetrics[pluginName] = await context.utils.getMetrics();

      const resourceUsage = this.resourceUsageTracker.get(pluginName);
      if (resourceUsage) {
        totalMemoryUsage += resourceUsage.memoryUsage;
        totalCpuUsage += resourceUsage.cpuUsage;
      }
    }

    return {
      totalActiveContexts: this.activeContexts.size,
      totalMemoryUsage,
      totalCpuUsage: totalCpuUsage / this.activeContexts.size || 0,
      pluginMetrics,
    };
  }

  async updatePluginConfig(pluginName: string, config: Partial<PluginContextConfig>): Promise<void> {
    const context = this.activeContexts.get(pluginName);
    if (context) {
      await context.utils.updateConfig(config);
    } else {
      this.configService.setPluginConfig(pluginName, config);
    }
  }
}
