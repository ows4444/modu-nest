import { Injectable } from '@nestjs/common';
import { IStandardConfigService } from './interfaces/base-config.interface';

/**
 * Configuration service factory for creating standardized config services
 */
@Injectable()
export class ConfigServiceFactory {
  /**
   * Create a configuration service adapter that wraps legacy services
   * to implement the standard interface
   */
  static createAdapter<T = any>(legacyService: any, mappings?: ConfigServiceMappings): IStandardConfigService<T> {
    return new ConfigServiceAdapter<T>(legacyService, mappings);
  }

  /**
   * Validate that a service implements the standard config interface
   */
  static validateService<T = any>(service: any): service is IStandardConfigService<T> {
    const requiredMethods = [
      'get',
      'getAll',
      'has',
      'getCategory',
      'validate',
      'getValidationErrors',
      'clearCache',
      'refresh',
      'getCacheStats',
      'getEnvironment',
      'isDevelopment',
      'isProduction',
      'isTest',
      'getSchema',
      'getMetadata',
    ];

    return requiredMethods.every((method) => typeof service[method] === 'function');
  }
}

/**
 * Mappings for adapting legacy config services
 */
export interface ConfigServiceMappings {
  get?: string;
  getAll?: string;
  has?: string;
  validate?: string;
  clearCache?: string;
  refresh?: string;
}

/**
 * Adapter class that wraps legacy config services
 */
class ConfigServiceAdapter<T = any> implements IStandardConfigService<T> {
  private readonly cacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    lastRefresh: new Date(),
  };

  constructor(private readonly legacyService: any, private readonly mappings: ConfigServiceMappings = {}) {}

  get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K] {
    const methodName = this.mappings.get || 'get';

    if (typeof this.legacyService[methodName] === 'function') {
      return this.legacyService[methodName](key, defaultValue);
    }

    // Fallback to direct property access
    return this.legacyService[key as string] || defaultValue;
  }

  getAll(): T {
    const methodName = this.mappings.getAll || 'getAll';

    if (typeof this.legacyService[methodName] === 'function') {
      return this.legacyService[methodName]();
    }

    // Fallback: try to return the entire service as config
    return this.legacyService as T;
  }

  has<K extends keyof T>(key: K): boolean {
    const methodName = this.mappings.has || 'has';

    if (typeof this.legacyService[methodName] === 'function') {
      return this.legacyService[methodName](key);
    }

    // Fallback
    return key in this.legacyService;
  }

  getCategory(category: string): Record<string, any> {
    // Try to find methods that might return category configs
    const categoryConfig: Record<string, any> = {};
    const config = this.getAll();

    for (const [key, value] of Object.entries(config as any)) {
      if (key.toLowerCase().includes(category.toLowerCase())) {
        categoryConfig[key] = value;
      }
    }

    return categoryConfig;
  }

  validate(): boolean {
    const methodName = this.mappings.validate || 'validate';

    if (typeof this.legacyService[methodName] === 'function') {
      return this.legacyService[methodName]();
    }

    // Default: assume valid
    return true;
  }

  getValidationErrors(): string[] {
    if (typeof this.legacyService.getValidationErrors === 'function') {
      return this.legacyService.getValidationErrors();
    }

    // Default: no errors
    return [];
  }

  clearCache(): void {
    const methodName = this.mappings.clearCache || 'clearCache';

    if (typeof this.legacyService[methodName] === 'function') {
      this.legacyService[methodName]();
    }

    this.cacheStats.hits = 0;
    this.cacheStats.misses = 0;
  }

  refresh(): void {
    const methodName = this.mappings.refresh || 'refresh';

    if (typeof this.legacyService[methodName] === 'function') {
      this.legacyService[methodName]();
    }

    this.cacheStats.lastRefresh = new Date();
  }

  getCacheStats() {
    if (typeof this.legacyService.getCacheStats === 'function') {
      return this.legacyService.getCacheStats();
    }

    return this.cacheStats;
  }

  getEnvironment(): string {
    // Try common environment property names
    const envKeys = ['NODE_ENV', 'environment', 'env'];

    for (const key of envKeys) {
      if (this.has(key as keyof T)) {
        return String(this.get(key as keyof T));
      }
    }

    return process.env.NODE_ENV || 'development';
  }

  isDevelopment(): boolean {
    return this.getEnvironment().toLowerCase() === 'development';
  }

  isProduction(): boolean {
    return this.getEnvironment().toLowerCase() === 'production';
  }

  isTest(): boolean {
    return this.getEnvironment().toLowerCase() === 'test';
  }

  getSchema(): Record<string, any> {
    if (typeof this.legacyService.getSchema === 'function') {
      return this.legacyService.getSchema();
    }

    // Generate basic schema from config structure
    const config = this.getAll();
    const schema: Record<string, any> = {};

    for (const [key, value] of Object.entries(config as any)) {
      schema[key] = {
        type: typeof value,
        defaultValue: value,
      };
    }

    return schema;
  }

  getMetadata(): Record<string, any> {
    if (typeof this.legacyService.getMetadata === 'function') {
      return this.legacyService.getMetadata();
    }

    // Generate basic metadata
    const config = this.getAll();
    const metadata: Record<string, any> = {};

    for (const key of Object.keys(config as any)) {
      metadata[key] = {
        description: `Configuration for ${key}`,
        category: 'general',
      };
    }

    return metadata;
  }
}

/**
 * Migration helper for updating existing config services
 */
export class ConfigMigrationHelper {
  /**
   * Analyze a legacy config service and suggest migration steps
   */
  static analyzeLegacyService(service: any): ConfigMigrationAnalysis {
    const analysis: ConfigMigrationAnalysis = {
      hasStandardInterface: false,
      missingMethods: [],
      suggestions: [],
      compatibilityScore: 0,
    };

    const requiredMethods = [
      'get',
      'getAll',
      'has',
      'getCategory',
      'validate',
      'getValidationErrors',
      'clearCache',
      'refresh',
      'getCacheStats',
      'getEnvironment',
      'isDevelopment',
      'isProduction',
      'isTest',
      'getSchema',
      'getMetadata',
    ];

    const existingMethods = requiredMethods.filter((method) => typeof service[method] === 'function');

    analysis.missingMethods = requiredMethods.filter((method) => typeof service[method] !== 'function');

    analysis.compatibilityScore = (existingMethods.length / requiredMethods.length) * 100;
    analysis.hasStandardInterface = analysis.missingMethods.length === 0;

    // Generate suggestions
    if (analysis.compatibilityScore < 50) {
      analysis.suggestions.push('Consider using ConfigServiceAdapter to wrap this service');
    }

    if (analysis.missingMethods.includes('validate')) {
      analysis.suggestions.push('Add configuration validation method');
    }

    if (analysis.missingMethods.includes('getSchema')) {
      analysis.suggestions.push('Add configuration schema for documentation and validation');
    }

    return analysis;
  }
}

export interface ConfigMigrationAnalysis {
  hasStandardInterface: boolean;
  missingMethods: string[];
  suggestions: string[];
  compatibilityScore: number;
}
