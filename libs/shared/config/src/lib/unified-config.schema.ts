import * as Joi from 'joi';

/**
 * Unified configuration schema for all modu-nest applications
 * Covers plugin-host, plugin-registry, and shared settings
 */
export const unifiedConfigSchema = Joi.object({
  // Core Application Settings
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(4001),
  HOST: Joi.string().hostname().default('localhost'),

  // Application Identity
  APP_NAME: Joi.string().default('modu-nest-app'),
  API_PREFIX: Joi.string().default('api'),

  // CORS Configuration
  CORS_ORIGINS: Joi.string().default('http://localhost:3000,http://localhost:4200'),

  // Plugin Host Settings
  PLUGIN_REGISTRY_URL: Joi.string().uri().default('http://localhost:6001'),
  REGISTRY_TIMEOUT: Joi.number().positive().default(30000),
  PLUGINS_DIR: Joi.string().default('./plugins'),

  // Plugin System Configuration
  PLUGIN_LOADING_STRATEGY: Joi.string().valid('auto', 'sequential', 'parallel', 'batch').default('auto'),
  PLUGIN_BATCH_SIZE: Joi.number().positive().default(10),
  PLUGIN_DISCOVERY_MAX_RETRIES: Joi.number().min(0).default(2),
  PLUGIN_DISCOVERY_RETRY_DELAY: Joi.number().positive().default(1000),
  PLUGIN_MEMORY_TRACKING_MODE: Joi.string().valid('minimal', 'selective', 'comprehensive').default('selective'),

  // Plugin File Handling
  MAX_PLUGIN_SIZE: Joi.number().positive().default(52428800), // 50MB
  PLUGIN_REGEX_TIMEOUT_MS: Joi.number().positive().default(5000),
  PLUGIN_MAX_CONTENT_SIZE: Joi.number().positive().default(1048576), // 1MB
  PLUGIN_MAX_ITERATIONS: Joi.number().positive().default(10000),
  PLUGIN_MAX_FILE_SIZE: Joi.number().positive().default(52428800), // 50MB

  // Plugin Metrics and Monitoring
  PLUGIN_METRICS_ENABLED: Joi.boolean().default(true),
  PLUGIN_METRICS_INTERVAL: Joi.number().positive().default(30000),
  PLUGIN_METRICS_HISTORY_SIZE: Joi.number().positive().default(1000),
  PLUGIN_MEMORY_CHECK_INTERVAL: Joi.number().positive().default(10000),

  // Performance Thresholds
  PLUGIN_ERROR_RATE_THRESHOLD: Joi.number().min(0).max(1).default(0.05), // 5%
  PLUGIN_RESPONSE_TIME_THRESHOLD: Joi.number().positive().default(5000),
  PLUGIN_MEMORY_GROWTH_THRESHOLD: Joi.number().min(0).max(1).default(0.2), // 20%

  // Security Configuration
  REQUIRE_PLUGIN_SIGNATURES: Joi.boolean().default(true),
  ALLOW_UNSIGNED_PLUGINS: Joi.boolean().default(false),
  TRUSTED_PLUGIN_KEYS: Joi.string().default(''),

  // Bundle Optimization Security
  BUNDLE_OPT_TREE_SHAKING: Joi.boolean().default(true),
  BUNDLE_OPT_MINIFICATION: Joi.boolean().default(true),
  BUNDLE_OPT_COMPRESSION: Joi.string().valid('gzip', 'brotli', 'deflate').default('gzip'),
  BUNDLE_OPT_COMPRESSION_LEVEL: Joi.number().min(1).max(9).default(6),
  BUNDLE_OPT_REMOVE_SOURCE_MAPS: Joi.boolean().default(true),
  BUNDLE_OPT_REMOVE_COMMENTS: Joi.boolean().default(true),
  BUNDLE_OPT_OPTIMIZE_IMAGES: Joi.boolean().default(false),
  BUNDLE_OPT_ANALYSIS: Joi.boolean().default(true),

  // Rate Limiting Configuration
  RATE_LIMIT_UPLOAD_WINDOW_MS: Joi.number().positive().default(60000), // 1 minute
  RATE_LIMIT_UPLOAD_MAX: Joi.number().positive().default(5),
  RATE_LIMIT_DOWNLOAD_WINDOW_MS: Joi.number().positive().default(60000),
  RATE_LIMIT_DOWNLOAD_MAX: Joi.number().positive().default(50),
  RATE_LIMIT_API_WINDOW_MS: Joi.number().positive().default(60000),
  RATE_LIMIT_API_MAX: Joi.number().positive().default(100),
  RATE_LIMIT_SEARCH_WINDOW_MS: Joi.number().positive().default(60000),
  RATE_LIMIT_SEARCH_MAX: Joi.number().positive().default(30),
  RATE_LIMIT_ADMIN_WINDOW_MS: Joi.number().positive().default(300000), // 5 minutes
  RATE_LIMIT_ADMIN_MAX: Joi.number().positive().default(10),
  RATE_LIMIT_CLEANUP_INTERVAL_MS: Joi.number().positive().default(300000),

  // Database Configuration
  DATABASE_TYPE: Joi.string().valid('postgres', 'mysql', 'sqlite').default('postgres'),
  DATABASE_HOST: Joi.string().hostname().default('localhost'),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_USERNAME: Joi.string().default('postgres'),
  DATABASE_PASSWORD: Joi.string().default('password'),
  DATABASE_NAME: Joi.string().default('plugin_registry'),
  DATABASE_LOGGING: Joi.boolean().default(false),
  DATABASE_SSL: Joi.boolean().default(false),
  DATABASE_SYNCHRONIZE: Joi.boolean().default(false),

  // Cache Configuration
  PLUGIN_VALIDATION_CACHE_TTL: Joi.number().positive().default(86400000), // 24 hours
  PLUGIN_VALIDATION_CACHE_SIZE: Joi.number().positive().default(1000),
  PLUGIN_VALIDATION_CLEANUP_INTERVAL: Joi.number().positive().default(3600000), // 1 hour

  // Storage Configuration
  REGISTRY_STORAGE_PATH: Joi.string().default('./storage'),
  ENABLE_BUNDLE_OPTIMIZATION: Joi.boolean().default(true),

  // Development and Debugging
  ENABLE_HOT_RELOAD: Joi.boolean().default(false),
  ENABLE_SWAGGER: Joi.boolean().default(true),
  DEBUG: Joi.string().default(''),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info'),

  // Security Event Logging
  HOSTNAME: Joi.string().hostname().default('modu-nest-server'),

  // AWS Configuration (optional)
  AWS_REGION: Joi.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
});
