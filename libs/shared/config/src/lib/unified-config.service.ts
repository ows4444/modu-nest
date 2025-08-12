import { Injectable, Logger } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { UnifiedConfig, ConfigFactory } from './unified-config.types';
import { EnvironmentType } from '@shared/core';
import { IStandardConfigService } from './interfaces/base-config.interface';
import { isValidUrl } from '@shared/utils';

@Injectable()
export class UnifiedConfigService implements IStandardConfigService<UnifiedConfig> {
  private readonly logger = new Logger(UnifiedConfigService.name);
  private readonly config: UnifiedConfig;
  private readonly cacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    lastRefresh: new Date(),
  };

  constructor(private readonly nestConfigService: NestConfigService) {
    // Load and validate configuration
    this.config = this.loadConfiguration();
    this.cacheStats.size = Object.keys(this.config).length;
    this.logger.log(`Configuration loaded for environment: ${this.config.NODE_ENV}`);
  }

  private loadConfiguration(): UnifiedConfig {
    const env = this.nestConfigService.get<EnvironmentType>('NODE_ENV', EnvironmentType.Development);
    const envSpecificConfig = ConfigFactory.createForEnvironment(env);

    // Parse comma-separated strings into arrays
    const corsOrigins = this.nestConfigService.get<string>('CORS_ORIGINS', 'http://localhost:3000');
    const trustedKeys = this.nestConfigService.get<string>('TRUSTED_PLUGIN_KEYS', '');

    return {
      // Core Application Settings
      NODE_ENV: env,
      PORT: this.nestConfigService.get<number>('PORT', 4001),
      HOST: this.nestConfigService.get<string>('HOST', 'localhost'),
      APP_NAME: this.nestConfigService.get<string>('APP_NAME', 'modu-nest-app'),
      API_PREFIX: this.nestConfigService.get<string>('API_PREFIX', 'api'),
      CORS_ORIGINS: corsOrigins.split(',').map((origin) => origin.trim()),

      // Plugin Host Settings
      PLUGIN_REGISTRY_URL: this.nestConfigService.get<string>('PLUGIN_REGISTRY_URL', 'http://localhost:6001'),
      REGISTRY_TIMEOUT: this.nestConfigService.get<number>('REGISTRY_TIMEOUT', 30000),
      PLUGINS_DIR: this.nestConfigService.get<string>('PLUGINS_DIR', './plugins'),

      // Plugin System Configuration
      PLUGIN_LOADING_STRATEGY: this.nestConfigService.get<any>('PLUGIN_LOADING_STRATEGY', 'auto'),
      PLUGIN_BATCH_SIZE: this.nestConfigService.get<number>('PLUGIN_BATCH_SIZE', 10),
      PLUGIN_DISCOVERY_MAX_RETRIES: this.nestConfigService.get<number>('PLUGIN_DISCOVERY_MAX_RETRIES', 2),
      PLUGIN_DISCOVERY_RETRY_DELAY: this.nestConfigService.get<number>('PLUGIN_DISCOVERY_RETRY_DELAY', 1000),
      PLUGIN_MEMORY_TRACKING_MODE: this.nestConfigService.get<any>('PLUGIN_MEMORY_TRACKING_MODE', 'selective'),

      // Plugin File Handling
      MAX_PLUGIN_SIZE: this.nestConfigService.get<number>('MAX_PLUGIN_SIZE', 52428800),
      PLUGIN_REGEX_TIMEOUT_MS: this.nestConfigService.get<number>('PLUGIN_REGEX_TIMEOUT_MS', 5000),
      PLUGIN_MAX_CONTENT_SIZE: this.nestConfigService.get<number>('PLUGIN_MAX_CONTENT_SIZE', 1048576),
      PLUGIN_MAX_ITERATIONS: this.nestConfigService.get<number>('PLUGIN_MAX_ITERATIONS', 10000),
      PLUGIN_MAX_FILE_SIZE: this.nestConfigService.get<number>('PLUGIN_MAX_FILE_SIZE', 52428800),

      // Plugin Metrics and Monitoring
      PLUGIN_METRICS_ENABLED: this.nestConfigService.get<boolean>('PLUGIN_METRICS_ENABLED', true),
      PLUGIN_METRICS_INTERVAL: this.nestConfigService.get<number>('PLUGIN_METRICS_INTERVAL', 30000),
      PLUGIN_METRICS_HISTORY_SIZE: this.nestConfigService.get<number>('PLUGIN_METRICS_HISTORY_SIZE', 1000),
      PLUGIN_MEMORY_CHECK_INTERVAL: this.nestConfigService.get<number>('PLUGIN_MEMORY_CHECK_INTERVAL', 10000),

      // Performance Thresholds
      PLUGIN_ERROR_RATE_THRESHOLD: this.nestConfigService.get<number>('PLUGIN_ERROR_RATE_THRESHOLD', 0.05),
      PLUGIN_RESPONSE_TIME_THRESHOLD: this.nestConfigService.get<number>('PLUGIN_RESPONSE_TIME_THRESHOLD', 5000),
      PLUGIN_MEMORY_GROWTH_THRESHOLD: this.nestConfigService.get<number>('PLUGIN_MEMORY_GROWTH_THRESHOLD', 0.2),

      // Security Configuration
      REQUIRE_PLUGIN_SIGNATURES: this.nestConfigService.get<boolean>('REQUIRE_PLUGIN_SIGNATURES', true),
      ALLOW_UNSIGNED_PLUGINS: this.nestConfigService.get<boolean>('ALLOW_UNSIGNED_PLUGINS', false),
      TRUSTED_PLUGIN_KEYS: trustedKeys ? trustedKeys.split(',').map((key) => key.trim()) : [],

      // Bundle Optimization Security
      BUNDLE_OPT_TREE_SHAKING: this.nestConfigService.get<boolean>('BUNDLE_OPT_TREE_SHAKING', true),
      BUNDLE_OPT_MINIFICATION: this.nestConfigService.get<boolean>('BUNDLE_OPT_MINIFICATION', true),
      BUNDLE_OPT_COMPRESSION: this.nestConfigService.get<any>('BUNDLE_OPT_COMPRESSION', 'gzip'),
      BUNDLE_OPT_COMPRESSION_LEVEL: this.nestConfigService.get<number>('BUNDLE_OPT_COMPRESSION_LEVEL', 6),
      BUNDLE_OPT_REMOVE_SOURCE_MAPS: this.nestConfigService.get<boolean>('BUNDLE_OPT_REMOVE_SOURCE_MAPS', true),
      BUNDLE_OPT_REMOVE_COMMENTS: this.nestConfigService.get<boolean>('BUNDLE_OPT_REMOVE_COMMENTS', true),
      BUNDLE_OPT_OPTIMIZE_IMAGES: this.nestConfigService.get<boolean>('BUNDLE_OPT_OPTIMIZE_IMAGES', false),
      BUNDLE_OPT_ANALYSIS: this.nestConfigService.get<boolean>('BUNDLE_OPT_ANALYSIS', true),

      // Rate Limiting Configuration
      RATE_LIMIT_UPLOAD_WINDOW_MS: this.nestConfigService.get<number>('RATE_LIMIT_UPLOAD_WINDOW_MS', 60000),
      RATE_LIMIT_UPLOAD_MAX: this.nestConfigService.get<number>('RATE_LIMIT_UPLOAD_MAX', 5),
      RATE_LIMIT_DOWNLOAD_WINDOW_MS: this.nestConfigService.get<number>('RATE_LIMIT_DOWNLOAD_WINDOW_MS', 60000),
      RATE_LIMIT_DOWNLOAD_MAX: this.nestConfigService.get<number>('RATE_LIMIT_DOWNLOAD_MAX', 50),
      RATE_LIMIT_API_WINDOW_MS: this.nestConfigService.get<number>('RATE_LIMIT_API_WINDOW_MS', 60000),
      RATE_LIMIT_API_MAX: this.nestConfigService.get<number>('RATE_LIMIT_API_MAX', 100),
      RATE_LIMIT_SEARCH_WINDOW_MS: this.nestConfigService.get<number>('RATE_LIMIT_SEARCH_WINDOW_MS', 60000),
      RATE_LIMIT_SEARCH_MAX: this.nestConfigService.get<number>('RATE_LIMIT_SEARCH_MAX', 30),
      RATE_LIMIT_ADMIN_WINDOW_MS: this.nestConfigService.get<number>('RATE_LIMIT_ADMIN_WINDOW_MS', 300000),
      RATE_LIMIT_ADMIN_MAX: this.nestConfigService.get<number>('RATE_LIMIT_ADMIN_MAX', 10),
      RATE_LIMIT_CLEANUP_INTERVAL_MS: this.nestConfigService.get<number>('RATE_LIMIT_CLEANUP_INTERVAL_MS', 300000),

      // Database Configuration
      DATABASE_TYPE: this.nestConfigService.get<any>('DATABASE_TYPE', 'postgres'),
      DATABASE_HOST: this.nestConfigService.get<string>('DATABASE_HOST', 'localhost'),
      DATABASE_PORT: this.nestConfigService.get<number>('DATABASE_PORT', 5432),
      DATABASE_USERNAME: this.nestConfigService.get<string>('DATABASE_USERNAME', 'postgres'),
      DATABASE_PASSWORD: this.nestConfigService.get<string>('DATABASE_PASSWORD', 'password'),
      DATABASE_NAME: this.nestConfigService.get<string>('DATABASE_NAME', 'plugin_registry'),
      DATABASE_LOGGING: this.nestConfigService.get<boolean>('DATABASE_LOGGING', false),
      DATABASE_SSL: this.nestConfigService.get<boolean>('DATABASE_SSL', false),
      DATABASE_SYNCHRONIZE: this.nestConfigService.get<boolean>('DATABASE_SYNCHRONIZE', false),

      // Cache Configuration
      PLUGIN_VALIDATION_CACHE_TTL: this.nestConfigService.get<number>('PLUGIN_VALIDATION_CACHE_TTL', 86400000),
      PLUGIN_VALIDATION_CACHE_SIZE: this.nestConfigService.get<number>('PLUGIN_VALIDATION_CACHE_SIZE', 1000),
      PLUGIN_VALIDATION_CLEANUP_INTERVAL: this.nestConfigService.get<number>(
        'PLUGIN_VALIDATION_CLEANUP_INTERVAL',
        3600000
      ),

      // Storage Configuration
      REGISTRY_STORAGE_PATH: this.nestConfigService.get<string>('REGISTRY_STORAGE_PATH', './storage'),
      ENABLE_BUNDLE_OPTIMIZATION: this.nestConfigService.get<boolean>('ENABLE_BUNDLE_OPTIMIZATION', true),

      // Development and Debugging
      ENABLE_HOT_RELOAD: this.nestConfigService.get<boolean>('ENABLE_HOT_RELOAD', false),
      ENABLE_SWAGGER: this.nestConfigService.get<boolean>('ENABLE_SWAGGER', true),
      DEBUG: this.nestConfigService.get<string>('DEBUG', ''),
      LOG_LEVEL: this.nestConfigService.get<any>('LOG_LEVEL', 'info'),

      // Security Event Logging
      HOSTNAME: this.nestConfigService.get<string>('HOSTNAME', 'modu-nest-server'),

      // AWS Configuration (optional)
      AWS_REGION: this.nestConfigService.get<string>('AWS_REGION', 'us-east-1'),
      AWS_ACCESS_KEY_ID: this.nestConfigService.get<string>('AWS_ACCESS_KEY_ID'),
      AWS_SECRET_ACCESS_KEY: this.nestConfigService.get<string>('AWS_SECRET_ACCESS_KEY'),

      // Apply environment-specific overrides
      ...envSpecificConfig,
    };
  }

  /**
   * Get the full configuration object
   */
  get all(): UnifiedConfig {
    return this.config;
  }

  /**
   * Get all configuration values (implements IConfigService)
   */
  getAll(): UnifiedConfig {
    this.cacheStats.hits++;
    return this.config;
  }

  /**
   * Get a specific configuration value
   */
  get<K extends keyof UnifiedConfig>(key: K, defaultValue?: UnifiedConfig[K]): UnifiedConfig[K] {
    const value = this.config[key];
    if (value !== undefined) {
      this.cacheStats.hits++;
      return value;
    }

    this.cacheStats.misses++;
    return defaultValue !== undefined ? defaultValue : value;
  }

  /**
   * Check if configuration key exists
   */
  has<K extends keyof UnifiedConfig>(key: K): boolean {
    return key in this.config && this.config[key] !== undefined;
  }

  /**
   * Get configuration subset by category/prefix
   */
  getCategory(category: string): Record<string, any> {
    const categoryConfig: Record<string, any> = {};
    const upperCategory = category.toUpperCase();

    for (const [key, value] of Object.entries(this.config)) {
      if (key.startsWith(upperCategory)) {
        categoryConfig[key] = value;
      }
    }

    return categoryConfig;
  }

  /**
   * Get current environment
   */
  getEnvironment(): string {
    return this.config.NODE_ENV;
  }

  // /**
  //  * Check if running in development mode
  //  */
  // get isDevelopment(): boolean {
  //   return this.config.NODE_ENV === EnvironmentType.Development;
  // }

  /**
   * Check if running in development mode (implements interface)
   */
  isDevelopment(): boolean {
    return this.config.NODE_ENV === EnvironmentType.Development;
  }

  // /**
  //  * Check if running in production mode
  //  */
  // get isProduction(): boolean {
  //   return this.config.NODE_ENV === EnvironmentType.Production;
  // }

  /**
   * Check if running in production mode (implements interface)
   */
  isProduction(): boolean {
    return this.config.NODE_ENV === EnvironmentType.Production;
  }

  /**
   * Check if running in test mode
   */
  isTest(): boolean {
    return this.config.NODE_ENV === EnvironmentType.Test;
  }

  /**
   * Get database configuration object
   */
  get databaseConfig() {
    return {
      type: this.config.DATABASE_TYPE,
      host: this.config.DATABASE_HOST,
      port: this.config.DATABASE_PORT,
      username: this.config.DATABASE_USERNAME,
      password: this.config.DATABASE_PASSWORD,
      database: this.config.DATABASE_NAME,
      logging: this.config.DATABASE_LOGGING,
      ssl: this.config.DATABASE_SSL,
      synchronize: this.config.DATABASE_SYNCHRONIZE,
    };
  }

  /**
   * Get plugin system configuration
   */
  get pluginConfig() {
    return {
      registryUrl: this.config.PLUGIN_REGISTRY_URL,
      timeout: this.config.REGISTRY_TIMEOUT,
      pluginsDir: this.config.PLUGINS_DIR,
      loadingStrategy: this.config.PLUGIN_LOADING_STRATEGY,
      batchSize: this.config.PLUGIN_BATCH_SIZE,
      maxRetries: this.config.PLUGIN_DISCOVERY_MAX_RETRIES,
      retryDelay: this.config.PLUGIN_DISCOVERY_RETRY_DELAY,
      memoryTrackingMode: this.config.PLUGIN_MEMORY_TRACKING_MODE,
      maxPluginSize: this.config.MAX_PLUGIN_SIZE,
      requireSignatures: this.config.REQUIRE_PLUGIN_SIGNATURES,
      allowUnsigned: this.config.ALLOW_UNSIGNED_PLUGINS,
      trustedKeys: this.config.TRUSTED_PLUGIN_KEYS,
    };
  }

  /**
   * Validate configuration values
   */
  validate(): boolean {
    const errors = this.getValidationErrors();
    return errors.length === 0;
  }

  /**
   * Get configuration validation errors
   */
  getValidationErrors(): string[] {
    const errors: string[] = [];

    // Validate URLs
    if (this.config.PLUGIN_REGISTRY_URL && !isValidUrl(this.config.PLUGIN_REGISTRY_URL)) {
      errors.push(`PLUGIN_REGISTRY_URL is not a valid URL: ${this.config.PLUGIN_REGISTRY_URL}`);
    }

    // Validate numeric ranges
    if (this.config.PORT < 1 || this.config.PORT > 65535) {
      errors.push(`PORT must be between 1 and 65535, got: ${this.config.PORT}`);
    }

    if (this.config.PLUGIN_BATCH_SIZE < 1) {
      errors.push(`PLUGIN_BATCH_SIZE must be positive, got: ${this.config.PLUGIN_BATCH_SIZE}`);
    }

    // Validate file sizes
    if (this.config.MAX_PLUGIN_SIZE < 1024) {
      errors.push(`MAX_PLUGIN_SIZE must be at least 1KB, got: ${this.config.MAX_PLUGIN_SIZE}`);
    }

    // Validate timeouts
    if (this.config.REGISTRY_TIMEOUT < 1000) {
      errors.push(`REGISTRY_TIMEOUT must be at least 1000ms, got: ${this.config.REGISTRY_TIMEOUT}`);
    }

    return errors;
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    // Configuration is immutable after loading, so this is a no-op
    // but we reset stats
    this.cacheStats.hits = 0;
    this.cacheStats.misses = 0;
    this.cacheStats.lastRefresh = new Date();
  }

  /**
   * Refresh configuration from source
   */
  refresh(): void {
    // Configuration is loaded once at startup, so this would require
    // a service restart in the current implementation
    this.logger.warn('Configuration refresh requires application restart');
    this.cacheStats.lastRefresh = new Date();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cacheStats.size,
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      lastRefresh: this.cacheStats.lastRefresh,
    };
  }

  /**
   * Get configuration schema for validation
   */
  getSchema(): Record<string, any> {
    return {
      NODE_ENV: { type: 'string', enum: ['development', 'production', 'test'] },
      PORT: { type: 'number', minimum: 1, maximum: 65535 },
      HOST: { type: 'string' },
      PLUGIN_REGISTRY_URL: { type: 'string', format: 'uri' },
      REGISTRY_TIMEOUT: { type: 'number', minimum: 1000 },
      MAX_PLUGIN_SIZE: { type: 'number', minimum: 1024 },
      PLUGIN_BATCH_SIZE: { type: 'number', minimum: 1 },
      // Add more schema definitions as needed
    };
  }

  /**
   * Get configuration metadata
   */
  getMetadata(): Record<string, any> {
    return {
      NODE_ENV: {
        description: 'Application environment mode',
        defaultValue: 'development',
        category: 'core',
      },
      PORT: {
        description: 'Application port number',
        defaultValue: 4001,
        category: 'core',
      },
      PLUGIN_REGISTRY_URL: {
        description: 'URL of the plugin registry service',
        defaultValue: 'http://localhost:6001',
        category: 'plugin',
      },
      // Add more metadata as needed
    };
  }
}
