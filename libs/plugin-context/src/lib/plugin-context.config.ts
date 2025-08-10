import { Injectable, Inject } from '@nestjs/common';

export const PLUGIN_CONTEXT_CONFIG = Symbol('PLUGIN_CONTEXT_CONFIG');

// Plugin-specific configuration interfaces
export interface PluginFileAccessConfig {
  allowedExtensions: string[];
  maxFileSize: number;
  allowWrite: boolean;
  allowDelete: boolean;
  allowExecute: boolean;
}

export interface PluginNetworkAccessConfig {
  allowedDomains: string[];
  blockedDomains: string[];
  allowedPorts: number[];
  blockedPorts: number[];
  maxRequestSize: number;
  requestTimeout: number;
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    dailyBandwidthLimit: number; // in bytes
  };
  allowedMethods: string[];
  allowedProtocols: string[];
}

export interface PluginDatabaseAccessConfig {
  allowedDatabases: string[];
  allowedTables: string[];
  allowedOperations: ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP' | 'ALTER')[];
  maxQueryComplexity: number;
  queryTimeout: number;
  maxResultSize: number;
  allowTransactions: boolean;
  allowStoredProcedures: boolean;
  connectionPoolSize: number;
}

export interface PluginResourceLimits {
  maxMemoryUsage: number; // in bytes
  maxCpuTime: number; // in milliseconds
  maxExecutionTime: number; // in milliseconds
  maxConcurrentOperations: number;
}

// Complete plugin context configuration
export interface PluginContextConfig {
  pluginName: string;
  version: string;
  fileAccess: PluginFileAccessConfig;
  networkAccess: PluginNetworkAccessConfig;
  databaseAccess: PluginDatabaseAccessConfig;
  resourceLimits: PluginResourceLimits;
  sandbox: {
    enabled: boolean;
    isolateMemory: boolean;
    restrictSystemCalls: boolean;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    maxLogSize: number;
    enableMetrics: boolean;
  };
}

// Global configuration for all plugins
export interface GlobalPluginContextConfig {
  defaultConfig: PluginContextConfig;
  pluginConfigs: Map<string, Partial<PluginContextConfig>>;
  globalLimits: {
    maxPluginCount: number;
    totalMemoryLimit: number;
    totalCpuLimit: number;
    globalRateLimit: number;
  };
  security: {
    enforceStrictMode: boolean;
    enableAuditLogging: boolean;
    requireDigitalSignatures: boolean;
  };
}

// Default configurations
export const DEFAULT_FILE_ACCESS_CONFIG: PluginFileAccessConfig = {
  allowedExtensions: ['.json', '.txt', '.md', '.yaml', '.yml', '.csv'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowWrite: true,
  allowDelete: false,
  allowExecute: false,
};

export const DEFAULT_NETWORK_ACCESS_CONFIG: PluginNetworkAccessConfig = {
  allowedDomains: ['api.example.com', 'cdn.example.com'],
  blockedDomains: ['malicious.com', 'spam.com'],
  allowedPorts: [80, 443, 8080],
  blockedPorts: [22, 23, 3389, 5432, 3306],
  maxRequestSize: 5 * 1024 * 1024, // 5MB
  requestTimeout: 30000, // 30 seconds
  rateLimits: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    dailyBandwidthLimit: 100 * 1024 * 1024, // 100MB
  },
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedProtocols: ['https', 'http'],
};

export const DEFAULT_DATABASE_ACCESS_CONFIG: PluginDatabaseAccessConfig = {
  allowedDatabases: ['plugin_data'],
  allowedTables: ['user_data', 'plugin_settings'],
  allowedOperations: ['SELECT', 'INSERT', 'UPDATE'],
  maxQueryComplexity: 100,
  queryTimeout: 30000, // 30 seconds
  maxResultSize: 1000,
  allowTransactions: true,
  allowStoredProcedures: false,
  connectionPoolSize: 5,
};

export const DEFAULT_RESOURCE_LIMITS: PluginResourceLimits = {
  maxMemoryUsage: 256 * 1024 * 1024, // 256MB
  maxCpuTime: 5000, // 5 seconds
  maxExecutionTime: 30000, // 30 seconds
  maxConcurrentOperations: 10,
};

export const DEFAULT_PLUGIN_CONTEXT_CONFIG: PluginContextConfig = {
  pluginName: 'default',
  version: '1.0.0',
  fileAccess: DEFAULT_FILE_ACCESS_CONFIG,
  networkAccess: DEFAULT_NETWORK_ACCESS_CONFIG,
  databaseAccess: DEFAULT_DATABASE_ACCESS_CONFIG,
  resourceLimits: DEFAULT_RESOURCE_LIMITS,
  sandbox: {
    enabled: true,
    isolateMemory: true,
    restrictSystemCalls: true,
  },
  logging: {
    level: 'info',
    maxLogSize: 50 * 1024 * 1024, // 50MB
    enableMetrics: true,
  },
};

export const DEFAULT_GLOBAL_CONTEXT_CONFIG: GlobalPluginContextConfig = {
  defaultConfig: DEFAULT_PLUGIN_CONTEXT_CONFIG,
  pluginConfigs: new Map(),
  globalLimits: {
    maxPluginCount: 100,
    totalMemoryLimit: 2 * 1024 * 1024 * 1024, // 2GB
    totalCpuLimit: 80, // 80% CPU
    globalRateLimit: 10000, // requests per minute
  },
  security: {
    enforceStrictMode: true,
    enableAuditLogging: true,
    requireDigitalSignatures: false,
  },
};

@Injectable()
export class PluginContextConfigService {
  constructor(@Inject(PLUGIN_CONTEXT_CONFIG) private readonly globalConfig: GlobalPluginContextConfig) {}

  getPluginConfig(pluginName: string): PluginContextConfig {
    const pluginSpecificConfig = this.globalConfig.pluginConfigs.get(pluginName) || {};
    return this.mergeConfigs(this.globalConfig.defaultConfig, pluginSpecificConfig);
  }

  setPluginConfig(pluginName: string, config: Partial<PluginContextConfig>): void {
    this.globalConfig.pluginConfigs.set(pluginName, config);
  }

  validatePluginConfig(config: Partial<PluginContextConfig>): boolean {
    // Validate against global limits
    if (
      config.resourceLimits?.maxMemoryUsage &&
      config.resourceLimits.maxMemoryUsage > this.globalConfig.globalLimits.totalMemoryLimit
    ) {
      return false;
    }

    if (config.fileAccess?.maxFileSize && config.fileAccess.maxFileSize > 100 * 1024 * 1024) {
      // 100MB limit
      return false;
    }

    return true;
  }

  private mergeConfigs(
    defaultConfig: PluginContextConfig,
    pluginConfig: Partial<PluginContextConfig>
  ): PluginContextConfig {
    return {
      ...defaultConfig,
      ...pluginConfig,
      fileAccess: { ...defaultConfig.fileAccess, ...pluginConfig.fileAccess },
      networkAccess: { ...defaultConfig.networkAccess, ...pluginConfig.networkAccess },
      databaseAccess: { ...defaultConfig.databaseAccess, ...pluginConfig.databaseAccess },
      resourceLimits: { ...defaultConfig.resourceLimits, ...pluginConfig.resourceLimits },
      sandbox: { ...defaultConfig.sandbox, ...pluginConfig.sandbox },
      logging: { ...defaultConfig.logging, ...pluginConfig.logging },
    };
  }

  getGlobalConfig(): GlobalPluginContextConfig {
    return this.globalConfig;
  }

  updateGlobalLimits(limits: Partial<GlobalPluginContextConfig['globalLimits']>): void {
    Object.assign(this.globalConfig.globalLimits, limits);
  }
}
