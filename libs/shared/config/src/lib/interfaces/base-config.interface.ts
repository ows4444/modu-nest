/**
 * Base configuration interface for all configuration services
 * Provides standardized methods and patterns across the framework
 */
export interface IConfigService<T = any> {
  /**
   * Get a specific configuration value by key
   * @param key - Configuration key
   * @param defaultValue - Optional default value if key doesn't exist
   */
  get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K];

  /**
   * Get all configuration values
   */
  getAll(): T;

  /**
   * Check if configuration key exists
   * @param key - Configuration key to check
   */
  has<K extends keyof T>(key: K): boolean;

  /**
   * Get configuration subset by prefix or category
   * @param category - Configuration category/prefix
   */
  getCategory(category: string): Record<string, any>;

  /**
   * Validate configuration values
   * @returns true if configuration is valid
   */
  validate(): boolean;

  /**
   * Get configuration validation errors
   */
  getValidationErrors(): string[];
}

/**
 * Cache-aware configuration service interface
 */
export interface ICacheableConfigService<T = any> extends IConfigService<T> {
  /**
   * Clear configuration cache
   */
  clearCache(): void;

  /**
   * Refresh configuration from source
   */
  refresh(): Promise<void> | void;

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    lastRefresh?: Date;
  };
}

/**
 * Environment-aware configuration service interface
 */
export interface IEnvironmentConfigService<T = any> extends IConfigService<T> {
  /**
   * Get current environment
   */
  getEnvironment(): string;

  /**
   * Check if running in development mode
   */
  isDevelopment(): boolean;

  /**
   * Check if running in production mode
   */
  isProduction(): boolean;

  /**
   * Check if running in test mode
   */
  isTest(): boolean;
}

/**
 * Combined interface for full-featured configuration services
 */
export interface IStandardConfigService<T = any> 
  extends ICacheableConfigService<T>, IEnvironmentConfigService<T> {
  
  /**
   * Get configuration schema for validation
   */
  getSchema(): Record<string, any>;

  /**
   * Get configuration metadata (descriptions, types, etc.)
   */
  getMetadata(): Record<string, any>;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingRequired: string[];
  invalidTypes: Array<{
    key: string;
    expected: string;
    actual: string;
  }>;
}

/**
 * Configuration change event
 */
export interface ConfigChangeEvent<T = any> {
  key: keyof T;
  oldValue: any;
  newValue: any;
  timestamp: Date;
  source: string;
}

/**
 * Configuration service with event support
 */
export interface IObservableConfigService<T = any> extends IStandardConfigService<T> {
  /**
   * Subscribe to configuration changes
   */
  onChange(callback: (event: ConfigChangeEvent<T>) => void): () => void;

  /**
   * Subscribe to specific key changes
   */
  onKeyChange<K extends keyof T>(key: K, callback: (newValue: T[K], oldValue: T[K]) => void): () => void;

  /**
   * Emit configuration change event
   */
  emit(event: ConfigChangeEvent<T>): void;
}