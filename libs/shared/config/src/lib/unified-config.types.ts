import { EnvironmentType } from '@libs/shared-core';

/**
 * Unified configuration interface for all modu-nest applications
 */
export interface UnifiedConfig {
  // Core Application Settings
  NODE_ENV: EnvironmentType;
  PORT: number;
  HOST: string;
  APP_NAME: string;
  API_PREFIX: string;
  CORS_ORIGINS: string[];

  // Plugin Host Settings
  PLUGIN_REGISTRY_URL: string;
  REGISTRY_TIMEOUT: number;
  PLUGINS_DIR: string;

  // Plugin System Configuration
  PLUGIN_LOADING_STRATEGY: 'auto' | 'sequential' | 'parallel' | 'batch';
  PLUGIN_BATCH_SIZE: number;
  PLUGIN_DISCOVERY_MAX_RETRIES: number;
  PLUGIN_DISCOVERY_RETRY_DELAY: number;
  PLUGIN_MEMORY_TRACKING_MODE: 'minimal' | 'selective' | 'comprehensive';

  // Plugin File Handling
  MAX_PLUGIN_SIZE: number;
  PLUGIN_REGEX_TIMEOUT_MS: number;
  PLUGIN_MAX_CONTENT_SIZE: number;
  PLUGIN_MAX_ITERATIONS: number;
  PLUGIN_MAX_FILE_SIZE: number;

  // Plugin Metrics and Monitoring
  PLUGIN_METRICS_ENABLED: boolean;
  PLUGIN_METRICS_INTERVAL: number;
  PLUGIN_METRICS_HISTORY_SIZE: number;
  PLUGIN_MEMORY_CHECK_INTERVAL: number;

  // Performance Thresholds
  PLUGIN_ERROR_RATE_THRESHOLD: number;
  PLUGIN_RESPONSE_TIME_THRESHOLD: number;
  PLUGIN_MEMORY_GROWTH_THRESHOLD: number;

  // Security Configuration
  REQUIRE_PLUGIN_SIGNATURES: boolean;
  ALLOW_UNSIGNED_PLUGINS: boolean;
  TRUSTED_PLUGIN_KEYS: string[];

  // Bundle Optimization Security
  BUNDLE_OPT_TREE_SHAKING: boolean;
  BUNDLE_OPT_MINIFICATION: boolean;
  BUNDLE_OPT_COMPRESSION: 'gzip' | 'brotli' | 'deflate';
  BUNDLE_OPT_COMPRESSION_LEVEL: number;
  BUNDLE_OPT_REMOVE_SOURCE_MAPS: boolean;
  BUNDLE_OPT_REMOVE_COMMENTS: boolean;
  BUNDLE_OPT_OPTIMIZE_IMAGES: boolean;
  BUNDLE_OPT_ANALYSIS: boolean;

  // Rate Limiting Configuration
  RATE_LIMIT_UPLOAD_WINDOW_MS: number;
  RATE_LIMIT_UPLOAD_MAX: number;
  RATE_LIMIT_DOWNLOAD_WINDOW_MS: number;
  RATE_LIMIT_DOWNLOAD_MAX: number;
  RATE_LIMIT_API_WINDOW_MS: number;
  RATE_LIMIT_API_MAX: number;
  RATE_LIMIT_SEARCH_WINDOW_MS: number;
  RATE_LIMIT_SEARCH_MAX: number;
  RATE_LIMIT_ADMIN_WINDOW_MS: number;
  RATE_LIMIT_ADMIN_MAX: number;
  RATE_LIMIT_CLEANUP_INTERVAL_MS: number;

  // Database Configuration
  DATABASE_TYPE: 'postgres' | 'mysql' | 'sqlite';
  DATABASE_HOST: string;
  DATABASE_PORT: number;
  DATABASE_USERNAME: string;
  DATABASE_PASSWORD: string;
  DATABASE_NAME: string;
  DATABASE_LOGGING: boolean;
  DATABASE_SSL: boolean;
  DATABASE_SYNCHRONIZE: boolean;

  // Cache Configuration
  PLUGIN_VALIDATION_CACHE_TTL: number;
  PLUGIN_VALIDATION_CACHE_SIZE: number;
  PLUGIN_VALIDATION_CLEANUP_INTERVAL: number;

  // Storage Configuration
  REGISTRY_STORAGE_PATH: string;
  ENABLE_BUNDLE_OPTIMIZATION: boolean;

  // Development and Debugging
  ENABLE_HOT_RELOAD: boolean;
  ENABLE_SWAGGER: boolean;
  DEBUG: string;
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug' | 'verbose';

  // Security Event Logging
  HOSTNAME: string;

  // AWS Configuration (optional)
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
}

/**
 * Environment-specific configuration factory
 */
export class ConfigFactory {
  static createForEnvironment(env: EnvironmentType): Partial<UnifiedConfig> {
    const commonConfig = {
      NODE_ENV: env,
    };

    switch (env) {
      case EnvironmentType.Development:
        return {
          ...commonConfig,
          // Permissive settings for development
          ALLOW_UNSIGNED_PLUGINS: true,
          PLUGIN_METRICS_ENABLED: true,
          ENABLE_HOT_RELOAD: true,
          DATABASE_SYNCHRONIZE: true,
          DATABASE_LOGGING: true,
          BUNDLE_OPT_REMOVE_SOURCE_MAPS: false,
          LOG_LEVEL: 'debug',
          ENABLE_SWAGGER: true,
        };

      case EnvironmentType.Production:
        return {
          ...commonConfig,
          // Secure settings for production
          ALLOW_UNSIGNED_PLUGINS: false,
          REQUIRE_PLUGIN_SIGNATURES: true,
          PLUGIN_METRICS_ENABLED: true,
          ENABLE_HOT_RELOAD: false,
          DATABASE_SYNCHRONIZE: false,
          DATABASE_LOGGING: false,
          BUNDLE_OPT_REMOVE_SOURCE_MAPS: true,
          BUNDLE_OPT_MINIFICATION: true,
          LOG_LEVEL: 'warn',
          ENABLE_SWAGGER: false,
        };

      default:
        return commonConfig;
    }
  }
}
