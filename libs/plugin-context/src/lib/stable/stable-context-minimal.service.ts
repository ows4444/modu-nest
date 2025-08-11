/**
 * Minimal Stable Plugin Context Service Implementation
 * 
 * Provides a working stable API implementation that focuses on
 * API stability rather than full feature implementation.
 */

import { Injectable, Logger } from '@nestjs/common';
import { 
  StablePluginContext, 
  StableContextFactory, 
  StableContextOptions,
  StableContextError
} from './stable-context.interface';
import { 
  PluginAPIVersion, 
  CURRENT_API_VERSION,
  createVersionedInterface,
  VersionedInterface
} from '@libs/plugin-core';

@Injectable()
export class StableContextMinimalService implements StableContextFactory {
  private readonly logger = new Logger(StableContextMinimalService.name);
  private readonly contexts = new Map<string, StablePluginContext>();
  
  // Supported stable API versions
  private readonly supportedVersions = [
    PluginAPIVersion.V2_0,
    PluginAPIVersion.V1_1,
  ];

  /**
   * Create a stable plugin context
   */
  async createContext(
    pluginName: string,
    version: PluginAPIVersion = CURRENT_API_VERSION,
    options: StableContextOptions = {}
  ): Promise<StablePluginContext> {
    if (!this.isVersionSupported(version)) {
      throw new StableContextError(
        `Unsupported API version: ${version}`,
        'UNSUPPORTED_VERSION'
      );
    }

    const context = this.createMinimalContext(pluginName, version, options);
    this.contexts.set(pluginName, context);
    
    this.logger.log(`Created stable context for ${pluginName} (API v${version})`);
    return context;
  }

  /**
   * Check if version is supported
   */
  isVersionSupported(version: PluginAPIVersion): boolean {
    return this.supportedVersions.includes(version);
  }

  /**
   * Get supported versions
   */
  getSupportedVersions(): PluginAPIVersion[] {
    return [...this.supportedVersions];
  }

  /**
   * Get context
   */
  getStableContext(pluginName: string): StablePluginContext | null {
    return this.contexts.get(pluginName) || null;
  }

  /**
   * Destroy context
   */
  async destroyContext(pluginName: string): Promise<void> {
    this.contexts.delete(pluginName);
    this.logger.log(`Destroyed stable context for ${pluginName}`);
  }

  private createMinimalContext(
    pluginName: string,
    version: PluginAPIVersion,
    options: StableContextOptions
  ): StablePluginContext {
    const contextImpl = {
      pluginName,
      version: '1.0.0',
      files: this.createMinimalFileAPI(pluginName),
      network: this.createMinimalNetworkAPI(pluginName),
      database: this.createMinimalDatabaseAPI(pluginName),
      utils: this.createMinimalUtilsAPI(pluginName),
    };

    return createVersionedInterface(contextImpl, version, '1.0') as StablePluginContext;
  }

  private createMinimalFileAPI(pluginName: string) {
    return {
      async read(path: string): Promise<Buffer> {
        this.logger.debug(`${pluginName}: file.read(${path})`);
        return Buffer.from('stable-api-mock-content');
      },
      
      async write(path: string, data: string | Buffer): Promise<void> {
        this.logger.debug(`${pluginName}: file.write(${path})`);
      },
      
      async exists(path: string): Promise<boolean> {
        this.logger.debug(`${pluginName}: file.exists(${path})`);
        return true;
      },
      
      async list(directory: string): Promise<string[]> {
        this.logger.debug(`${pluginName}: file.list(${directory})`);
        return [];
      },
      
      async delete(path: string): Promise<void> {
        this.logger.debug(`${pluginName}: file.delete(${path})`);
      },
      
      async stats(path: string) {
        this.logger.debug(`${pluginName}: file.stats(${path})`);
        return {
          size: 0,
          isFile: true,
          isDirectory: false,
          modified: new Date(),
          created: new Date(),
        };
      },
    };
  }

  private createMinimalNetworkAPI(pluginName: string) {
    const createMockResponse = () => ({
      status: 200,
      statusText: 'OK',
      headers: {},
      body: 'stable-api-mock-response',
      data: Buffer.from('stable-api-mock-response'),
      json: () => ({ mock: true }),
      text: () => 'stable-api-mock-response',
      buffer: () => Buffer.from('stable-api-mock-response'),
    });

    return {
      async get(url: string, options?: any) {
        this.logger.debug(`${pluginName}: network.get(${url})`);
        return createMockResponse();
      },
      
      async post(url: string, body?: any, options?: any) {
        this.logger.debug(`${pluginName}: network.post(${url})`);
        return createMockResponse();
      },
      
      async put(url: string, body?: any, options?: any) {
        this.logger.debug(`${pluginName}: network.put(${url})`);
        return createMockResponse();
      },
      
      async delete(url: string, options?: any) {
        this.logger.debug(`${pluginName}: network.delete(${url})`);
        return createMockResponse();
      },
      
      async request(request: any) {
        this.logger.debug(`${pluginName}: network.request(${request.url})`);
        return createMockResponse();
      },
    };
  }

  private createMinimalDatabaseAPI(pluginName: string) {
    const createMockResult = () => ({
      rows: [],
      rowCount: 0,
      executionTime: 1,
      insertId: 1,
      affectedRows: 0,
    });

    return {
      async query(sql: string, params?: unknown[]) {
        this.logger.debug(`${pluginName}: db.query(${sql.substring(0, 50)}...)`);
        return createMockResult();
      },
      
      async select(table: string, where?: string | object, params?: unknown[]) {
        this.logger.debug(`${pluginName}: db.select(${table})`);
        return createMockResult();
      },
      
      async insert(table: string, data: object) {
        this.logger.debug(`${pluginName}: db.insert(${table})`);
        return createMockResult();
      },
      
      async update(table: string, data: object, where: string | object, params?: unknown[]) {
        this.logger.debug(`${pluginName}: db.update(${table})`);
        return createMockResult();
      },
      
      async delete(table: string, where: string | object, params?: unknown[]) {
        this.logger.debug(`${pluginName}: db.delete(${table})`);
        return createMockResult();
      },
      
      async transaction() {
        this.logger.debug(`${pluginName}: db.transaction()`);
        return {
          id: 'tx-' + Date.now(),
          query: async (sql: string, params?: unknown[]) => createMockResult(),
          commit: async () => {},
          rollback: async () => {},
        };
      },
    };
  }

  private createMinimalUtilsAPI(pluginName: string) {
    return {
      async getMetrics() {
        return {
          files: { operations: 0, bytesRead: 0, bytesWritten: 0, errors: 0 },
          network: { requests: 0, bandwidth: 0, averageResponseTime: 0, errors: 0, rateLimitHits: 0 },
          database: { queries: 0, totalTime: 0, averageTime: 0, errors: 0, transactions: 0 },
          resources: { memoryUsage: 0, cpuUsage: 0, activeOperations: 0, uptime: Date.now() },
        };
      },
      
      async resetMetrics(): Promise<void> {
        this.logger.debug(`${pluginName}: utils.resetMetrics()`);
      },
      
      async checkPermission(operation: string, resource?: string): Promise<boolean> {
        this.logger.debug(`${pluginName}: utils.checkPermission(${operation}, ${resource})`);
        return true; // Mock implementation allows all operations
      },
      
      async log(level: string, message: string, meta?: object): Promise<void> {
        const logMsg = `[${pluginName}] ${message}`;
        switch (level) {
          case 'debug': this.logger.debug(logMsg, meta); break;
          case 'info': this.logger.log(logMsg, meta); break;
          case 'warn': this.logger.warn(logMsg, meta); break;
          case 'error': this.logger.error(logMsg, meta); break;
          default: this.logger.log(logMsg, meta);
        }
      },
      
      async getConfig() {
        return {
          name: pluginName,
          version: '1.0.0',
          limits: {
            maxMemory: 256 * 1024 * 1024,
            maxCpuTime: 5000,
            maxOperations: 100,
            maxFileSize: 10 * 1024 * 1024,
            maxNetworkRequests: 60,
            maxDatabaseQueries: 100,
          },
          permissions: {
            files: { read: true, write: true, delete: false, allowedPaths: [] },
            network: { enabled: true, allowedDomains: [], blockedDomains: [], allowedPorts: [] },
            database: { enabled: true, allowedTables: [], allowedOperations: [] },
          },
        };
      },
      
      async updateConfig(config: any): Promise<void> {
        this.logger.debug(`${pluginName}: utils.updateConfig()`);
      },
    };
  }
}