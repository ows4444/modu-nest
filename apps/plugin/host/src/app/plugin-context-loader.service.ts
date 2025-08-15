import { Injectable, Logger } from '@nestjs/common';
import {
  PluginContextService,
  PluginContext,
  PluginContextConfig,
  PluginFileAccessConfig,
  PluginNetworkAccessConfig,
  PluginDatabaseAccessConfig,
} from '@plugin/context';
import { PluginManifest } from '@plugin/core';
import path from 'path';
import fs from 'fs';

export interface PluginContextConfigFile {
  fileAccess?: Partial<PluginFileAccessConfig>;
  networkAccess?: Partial<PluginNetworkAccessConfig>;
  databaseAccess?: Partial<PluginDatabaseAccessConfig>;
  resourceLimits?: {
    maxMemoryUsage?: number;
    maxCpuTime?: number;
    maxExecutionTime?: number;
    maxConcurrentOperations?: number;
  };
  sandbox?: {
    enabled?: boolean;
    isolateMemory?: boolean;
    restrictSystemCalls?: boolean;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    maxLogSize?: number;
    enableMetrics?: boolean;
  };
  environment?: {
    canReadEnvVars?: boolean;
    allowedEnvVars?: string[];
  };
  config?: {
    maxUsers?: number;
    sessionTimeout?: number; // in seconds
  };
}

@Injectable()
export class PluginContextLoaderService {
  private readonly logger = new Logger(PluginContextLoaderService.name);
  private readonly pluginContexts = new Map<string, PluginContext>();

  constructor(private readonly contextService: PluginContextService) {}

  async createPluginContext(pluginName: string, manifest: PluginManifest, pluginPath: string): Promise<PluginContext> {
    this.logger.debug(`Creating context for plugin: ${pluginName}`);

    try {
      // Load plugin-specific configuration
      const pluginConfig = await this.loadPluginConfig(pluginName, pluginPath, manifest);

      // Create context with merged configuration
      const context = await this.contextService.createPluginContext(pluginName, pluginConfig);

      // Store the context
      this.pluginContexts.set(pluginName, context);

      this.logger.log(`Plugin context created for ${pluginName} with custom configuration`);
      return context;
    } catch (error) {
      this.logger.error(`Failed to create plugin context for ${pluginName}:`, error);
      throw error;
    }
  }

  async destroyPluginContext(pluginName: string): Promise<void> {
    this.logger.debug(`Destroying context for plugin: ${pluginName}`);

    try {
      await this.contextService.destroyPluginContext(pluginName);
      this.pluginContexts.delete(pluginName);
      this.logger.log(`Plugin context destroyed for ${pluginName}`);
    } catch (error) {
      this.logger.error(`Failed to destroy plugin context for ${pluginName}:`, error);
    }
  }

  getPluginContext(pluginName: string): PluginContext | null {
    return this.pluginContexts.get(pluginName) || null;
  }

  getAllPluginContexts(): Map<string, PluginContext> {
    return new Map(this.pluginContexts);
  }

  private async loadPluginConfig(
    pluginName: string,
    pluginPath: string,
    manifest: PluginManifest
  ): Promise<Partial<PluginContextConfig>> {
    const config: Partial<PluginContextConfig> = {
      pluginName,
      version: manifest.version,
    };

    // 1. Load from plugin manifest permissions
    if (manifest.permissions) {
      this.logger.debug(`Loading permissions from manifest for plugin: ${pluginName}`);
    }

    // 2. Load from plugin.context.json file
    const contextConfigPath = path.join(pluginPath, 'plugin.context.json');
    if (fs.existsSync(contextConfigPath)) {
      try {
        this.logger.debug(`Loading context config from file for plugin: ${pluginName}`);
        const fileContent = fs.readFileSync(contextConfigPath, 'utf8');
        const fileConfig: PluginContextConfigFile = JSON.parse(fileContent);

        // Merge file configuration with proper type handling
        if (fileConfig.fileAccess) {
          config.fileAccess = {
            ...config.fileAccess,
            ...(fileConfig.fileAccess as PluginFileAccessConfig),
          };
        }
        if (fileConfig.networkAccess) {
          config.networkAccess = {
            ...config.networkAccess,
            ...(fileConfig.networkAccess as PluginNetworkAccessConfig),
          };
        }
        if (fileConfig.databaseAccess) {
          config.databaseAccess = {
            ...config.databaseAccess,
            ...(fileConfig.databaseAccess as PluginDatabaseAccessConfig),
          };
        }
        if (fileConfig.resourceLimits) {
          config.resourceLimits = {
            ...config.resourceLimits,
            ...Object.fromEntries(Object.entries(fileConfig.resourceLimits).filter(([, value]) => value !== undefined)),
          } as {
            maxMemoryUsage: number;
            maxCpuTime: number;
            maxExecutionTime: number;
            maxConcurrentOperations: number;
          };
        }
        if (fileConfig.sandbox) {
          config.sandbox = {
            ...config.sandbox,
            ...Object.fromEntries(Object.entries(fileConfig.sandbox).filter(([, value]) => value !== undefined)),
          } as {
            enabled: boolean;
            isolateMemory: boolean;
            restrictSystemCalls: boolean;
          };
        }
        if (fileConfig.logging) {
          config.logging = {
            ...config.logging,
            ...Object.fromEntries(Object.entries(fileConfig.logging).filter(([, value]) => value !== undefined)),
          } as {
            level: 'debug' | 'info' | 'warn' | 'error';
            maxLogSize: number;
            enableMetrics: boolean;
          };
        }

        this.logger.debug(`Merged context configuration from file for plugin: ${pluginName}`);
      } catch (error) {
        this.logger.warn(`Failed to load context config file for plugin ${pluginName}:`, error);
      }
    }

    // 3. Apply plugin-specific defaults based on plugin type
    this.applyPluginTypeDefaults(config, manifest);

    // 4. Apply security constraints based on trust level
    this.applySecurityConstraints(config, manifest);

    return config;
  }

  private applyPluginTypeDefaults(config: Partial<PluginContextConfig>, manifest: PluginManifest): void {
    // Since PluginModuleMeta doesn't have a type property, we'll determine type from other manifest properties
    const pluginType = this.determinePluginType(manifest);

    switch (pluginType) {
      case 'data-processor':
        // Data processing plugins need more file access but less network
        if (!config.fileAccess)
          config.fileAccess = {
            allowedExtensions: ['.json', '.csv', '.txt', '.xml', '.yaml'],
            maxFileSize: 50 * 1024 * 1024, // 50MB
            allowDelete: false,
            allowExecute: false,
            allowWrite: true,
          };

        if (!config.resourceLimits)
          config.resourceLimits = {
            maxConcurrentOperations: 5,
            maxExecutionTime: 30000, // 30 seconds
            maxMemoryUsage: 256 * 1024 * 1024, // 256MB
            maxCpuTime: 5000, // 5 seconds
          };
        config.resourceLimits.maxMemoryUsage = config.resourceLimits.maxMemoryUsage || 512 * 1024 * 1024; // 512MB
        break;

      case 'api-client':
        // API client plugins need extensive network access
        if (!config.networkAccess)
          config.networkAccess = {
            allowedProtocols: ['https'],
            allowedDomains: ['api.example.com'],
            blockedDomains: [],
            allowedPorts: [80, 443],
            blockedPorts: [],
            maxRequestSize: 10 * 1024 * 1024, // 10MB
            requestTimeout: 30000, // 30 seconds
            allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
            rateLimits: {
              dailyBandwidthLimit: 100 * 1024 * 1024, // 100MB
              requestsPerMinute: 60,
              requestsPerHour: 1000,
            },
          };
        break;

      case 'database-connector':
        // Database connector plugins need extensive database access
        if (!config.databaseAccess)
          config.databaseAccess = {
            allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
            maxQueryComplexity: 1000,
            connectionPoolSize: 20,
            allowedDatabases: ['plugin_data'],
            allowedTables: ['user_data', 'plugin_settings'],
            allowStoredProcedures: true,
            allowTransactions: true,
            maxResultSize: 5000,
            queryTimeout: 60000, // 60 seconds
          };
        break;

      case 'ui-component':
        // UI components need minimal access but more execution time
        if (!config.resourceLimits)
          config.resourceLimits = {
            maxConcurrentOperations: 10,
            maxExecutionTime: 60000, // 60 seconds
            maxMemoryUsage: 128 * 1024 * 1024, // 128MB
            maxCpuTime: 2000, // 2 seconds
          };
        break;

      default:
        // General plugins get standard defaults
        break;
    }
  }

  private applySecurityConstraints(config: Partial<PluginContextConfig>, manifest: PluginManifest): void {
    const trustLevel = manifest.security?.trustLevel || 'community';

    switch (trustLevel) {
      case 'internal':
        // Trusted plugins get more relaxed constraints
        break;

      case 'verified':
        // Verified plugins get moderate constraints
        if (config.fileAccess) {
          config.fileAccess.allowDelete = false;
          config.fileAccess.allowExecute = false;
        }
        if (config.networkAccess && config.networkAccess.rateLimits) {
          config.networkAccess.rateLimits.requestsPerMinute = Math.min(
            config.networkAccess.rateLimits.requestsPerMinute,
            100
          );
        }
        break;

      case 'community':
      default:
        // Untrusted plugins get strict constraints
        if (!config.sandbox)
          config.sandbox = {
            enabled: true,
            isolateMemory: true,
            restrictSystemCalls: true,
          };

        if (config.fileAccess) {
          config.fileAccess.allowDelete = false;
          config.fileAccess.allowExecute = false;
          config.fileAccess.maxFileSize = Math.min(config.fileAccess.maxFileSize || 10 * 1024 * 1024, 10 * 1024 * 1024);
        }

        if (config.networkAccess) {
          config.networkAccess.allowedProtocols = ['https']; // Only HTTPS for untrusted plugins
          if (config.networkAccess.rateLimits) {
            config.networkAccess.rateLimits.requestsPerMinute = Math.min(
              config.networkAccess.rateLimits.requestsPerMinute,
              30
            );
            config.networkAccess.rateLimits.requestsPerHour = Math.min(
              config.networkAccess.rateLimits.requestsPerHour,
              500
            );
          }
        }

        if (config.databaseAccess) {
          config.databaseAccess.allowedOperations = ['SELECT', 'INSERT'] as (
            | 'SELECT'
            | 'INSERT'
            | 'UPDATE'
            | 'DELETE'
            | 'CREATE'
            | 'DROP'
            | 'ALTER'
          )[]; // No DELETE/UPDATE for untrusted
          config.databaseAccess.allowStoredProcedures = false;
          config.databaseAccess.maxResultSize = Math.min(config.databaseAccess.maxResultSize || 100, 100);
        }

        if (config.resourceLimits) {
          config.resourceLimits.maxMemoryUsage = Math.min(
            config.resourceLimits.maxMemoryUsage || 128 * 1024 * 1024,
            128 * 1024 * 1024
          ); // 128MB max for untrusted
          config.resourceLimits.maxConcurrentOperations = Math.min(
            config.resourceLimits.maxConcurrentOperations || 5,
            5
          );
        }
        break;
    }

    this.logger.debug(`Applied security constraints for trust level '${trustLevel}' to plugin: ${manifest.name}`);
  }

  // Admin methods
  async getSystemMetrics() {
    return this.contextService.getSystemMetrics();
  }

  async updatePluginConfig(pluginName: string, config: Partial<PluginContextConfig>): Promise<void> {
    await this.contextService.updatePluginConfig(pluginName, config);
    this.logger.log(`Updated configuration for plugin: ${pluginName}`);
  }

  async validatePluginAccess(pluginName: string, operation: string, resource: string): Promise<boolean> {
    const context = this.getPluginContext(pluginName);
    if (!context) {
      return false;
    }
    return context.utils.validatePermissions(operation, resource);
  }

  // Helper method to create plugin-specific data directories
  async ensurePluginDirectories(pluginName: string): Promise<void> {
    const pluginDataDir = path.join('./plugins/data', pluginName);
    const pluginTempDir = path.join('./temp', pluginName);

    try {
      if (!fs.existsSync(pluginDataDir)) {
        fs.mkdirSync(pluginDataDir, { recursive: true });
        this.logger.debug(`Created data directory for plugin: ${pluginName}`);
      }

      if (!fs.existsSync(pluginTempDir)) {
        fs.mkdirSync(pluginTempDir, { recursive: true });
        this.logger.debug(`Created temp directory for plugin: ${pluginName}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to create directories for plugin ${pluginName}:`, error);
    }
  }

  private determinePluginType(manifest: PluginManifest): string {
    // Determine plugin type from manifest properties
    if (manifest.name.includes('data') || manifest.description.toLowerCase().includes('data')) {
      return 'data-processor';
    }
    if (manifest.name.includes('network') || manifest.description.toLowerCase().includes('network')) {
      return 'network-service';
    }
    if (manifest.name.includes('auth') || manifest.description.toLowerCase().includes('auth')) {
      return 'auth-service';
    }
    if (manifest.name.includes('ui') || manifest.description.toLowerCase().includes('user interface')) {
      return 'ui-component';
    }
    return 'general';
  }
}
