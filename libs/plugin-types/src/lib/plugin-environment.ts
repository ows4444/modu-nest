import { Injectable } from '@nestjs/common';

export interface EnvironmentConfig {
  // Plugin Registry Configuration
  registry: {
    storageUrl: string;
    maxPluginSize: number;
    timeout: number;
    enableCaching: boolean;
  };

  // Plugin Host Configuration
  host: {
    pluginsDir: string;
    autoLoad: boolean;
    enableHotReload: boolean;
    loadTimeout: number;
  };

  // Security Configuration
  security: {
    allowUnsignedPlugins: boolean;
    enableSandbox: boolean;
    maxMemoryUsage: number;
    trustedAuthors: string[];
  };

  // Logging Configuration
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableFileLogging: boolean;
    logDir: string;
    maxLogSize: number;
  };
}

@Injectable()
export class PluginEnvironmentService {
  private config: EnvironmentConfig;

  constructor() {
    this.config = this.loadConfiguration();
  }

  private loadConfiguration(): EnvironmentConfig {
    return {
      registry: {
        storageUrl: process.env.PLUGIN_REGISTRY_URL || 'http://localhost:3001',
        maxPluginSize: parseInt(process.env.MAX_PLUGIN_SIZE || '52428800', 10),
        timeout: parseInt(process.env.REGISTRY_TIMEOUT || '30000', 10),
        enableCaching: process.env.ENABLE_REGISTRY_CACHING === 'true',
      },
      host: {
        pluginsDir: process.env.PLUGINS_DIR || 'assets/plugins',
        autoLoad: process.env.AUTO_LOAD_PLUGINS !== 'false',
        enableHotReload: process.env.ENABLE_HOT_RELOAD === 'true',
        loadTimeout: parseInt(process.env.PLUGIN_LOAD_TIMEOUT || '10000', 10),
      },
      security: {
        allowUnsignedPlugins: process.env.ALLOW_UNSIGNED_PLUGINS === 'true',
        enableSandbox: process.env.ENABLE_PLUGIN_SANDBOX === 'true',
        maxMemoryUsage: parseInt(process.env.MAX_PLUGIN_MEMORY || '134217728', 10), // 128MB
        trustedAuthors: (process.env.TRUSTED_AUTHORS || '').split(',').filter(Boolean),
      },
      logging: {
        level: (process.env.LOG_LEVEL as any) || 'info',
        enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
        logDir: process.env.LOG_DIR || 'logs',
        maxLogSize: parseInt(process.env.MAX_LOG_SIZE || '10485760', 10), // 10MB
      },
    };
  }

  getConfig(): EnvironmentConfig {
    return { ...this.config };
  }

  getRegistryConfig() {
    return { ...this.config.registry };
  }

  getHostConfig() {
    return { ...this.config.host };
  }

  getSecurityConfig() {
    return { ...this.config.security };
  }

  getLoggingConfig() {
    return { ...this.config.logging };
  }

  /**
   * Validate environment configuration
   */
  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate registry configuration
    if (this.config.registry.maxPluginSize <= 0) {
      errors.push('MAX_PLUGIN_SIZE must be greater than 0');
    }

    if (this.config.registry.timeout <= 0) {
      errors.push('REGISTRY_TIMEOUT must be greater than 0');
    }

    try {
      new URL(this.config.registry.storageUrl);
    } catch {
      errors.push('PLUGIN_REGISTRY_URL must be a valid URL');
    }

    // Validate host configuration
    if (this.config.host.loadTimeout <= 0) {
      errors.push('PLUGIN_LOAD_TIMEOUT must be greater than 0');
    }

    // Validate security configuration
    if (this.config.security.maxMemoryUsage <= 0) {
      errors.push('MAX_PLUGIN_MEMORY must be greater than 0');
    }

    // Validate logging configuration
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(this.config.logging.level)) {
      errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
    }

    if (this.config.logging.maxLogSize <= 0) {
      errors.push('MAX_LOG_SIZE must be greater than 0');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Update configuration at runtime (for non-critical settings)
   */
  updateConfig(updates: Partial<EnvironmentConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      registry: { ...this.config.registry, ...updates.registry },
      host: { ...this.config.host, ...updates.host },
      security: { ...this.config.security, ...updates.security },
      logging: { ...this.config.logging, ...updates.logging },
    };
  }

  /**
   * Get environment information summary
   */
  getEnvironmentInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      config: this.getConfig(),
      configValid: this.validateConfiguration().valid,
    };
  }
}

/**
 * Environment configuration validation decorator
 */
export function ValidateEnvironment() {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const envService = new PluginEnvironmentService();
      const validation = envService.validateConfiguration();

      if (!validation.valid) {
        throw new Error(`Environment configuration invalid: ${validation.errors.join(', ')}`);
      }

      return method.apply(this, args);
    };
  };
}
