import { Injectable, Logger } from '@nestjs/common';

/**
 * Configuration cache service for optimizing config loading performance
 * 
 * Implements singleton pattern with memoization and lazy loading to prevent
 * redundant configuration loading across multiple services and modules.
 */
@Injectable()
export class ConfigCacheService {
  private static instance: ConfigCacheService | null = null;
  private readonly cache = new Map<string, any>();
  private readonly computingPromises = new Map<string, Promise<any>>();
  private readonly logger = new Logger(ConfigCacheService.name);
  
  /**
   * Cache timestamps for TTL support
   */
  private readonly cacheTimestamps = new Map<string, number>();
  
  /**
   * Default TTL in milliseconds (5 minutes)
   */
  private readonly defaultTTL = 5 * 60 * 1000;
  
  /**
   * Get singleton instance
   */
  static getInstance(): ConfigCacheService {
    if (!ConfigCacheService.instance) {
      ConfigCacheService.instance = new ConfigCacheService();
    }
    return ConfigCacheService.instance;
  }

  private constructor() {
    this.logger.log('ConfigCacheService initialized');
  }

  /**
   * Get cached configuration or compute if not exists
   */
  async get<T>(
    key: string, 
    factory: () => Promise<T> | T,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    // Check if value exists and is not expired
    if (this.has(key) && !this.isExpired(key, ttl)) {
      this.logger.debug(`Cache hit for key: ${key}`);
      return this.cache.get(key) as T;
    }

    // Check if computation is already in progress
    if (this.computingPromises.has(key)) {
      this.logger.debug(`Computation in progress for key: ${key}, waiting...`);
      return this.computingPromises.get(key) as Promise<T>;
    }

    // Start computation
    this.logger.debug(`Cache miss for key: ${key}, computing...`);
    const computePromise = this.computeValue(key, factory, ttl);
    this.computingPromises.set(key, computePromise);

    try {
      const result = await computePromise;
      return result;
    } finally {
      this.computingPromises.delete(key);
    }
  }

  /**
   * Synchronous get with memoization
   */
  getSync<T>(
    key: string,
    factory: () => T,
    ttl: number = this.defaultTTL
  ): T {
    // Check if value exists and is not expired
    if (this.has(key) && !this.isExpired(key, ttl)) {
      this.logger.debug(`Sync cache hit for key: ${key}`);
      return this.cache.get(key) as T;
    }

    this.logger.debug(`Sync cache miss for key: ${key}, computing...`);
    const result = factory();
    this.set(key, result);
    return result;
  }

  /**
   * Set value in cache with timestamp
   */
  set(key: string, value: any): void {
    this.cache.set(key, value);
    this.cacheTimestamps.set(key, Date.now());
    this.logger.debug(`Cached value for key: ${key}`);
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    this.cacheTimestamps.delete(key);
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.logger.debug(`Deleted cache entry for key: ${key}`);
    }
    return deleted;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.cacheTimestamps.clear();
    this.logger.log(`Cleared cache with ${size} entries`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      timestamps: Object.fromEntries(this.cacheTimestamps),
      computingKeys: Array.from(this.computingPromises.keys()),
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanup(ttl: number = this.defaultTTL): number {
    const now = Date.now();
    let deletedCount = 0;

    for (const [key, timestamp] of this.cacheTimestamps.entries()) {
      if (now - timestamp > ttl) {
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.logger.log(`Cleaned up ${deletedCount} expired cache entries`);
    }

    return deletedCount;
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup(intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout {
    return setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  private async computeValue<T>(
    key: string,
    factory: () => Promise<T> | T,
    ttl: number
  ): Promise<T> {
    try {
      const startTime = Date.now();
      const result = await factory();
      const duration = Date.now() - startTime;
      
      this.set(key, result);
      this.logger.debug(`Computed and cached value for key: ${key} in ${duration}ms`);
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to compute value for key: ${key}`, error);
      throw error;
    }
  }

  private isExpired(key: string, ttl: number): boolean {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp) return true;
    
    const isExpired = Date.now() - timestamp > ttl;
    if (isExpired) {
      this.logger.debug(`Cache entry expired for key: ${key}`);
    }
    return isExpired;
  }
}

/**
 * Global instance for easy access
 */
export const configCache = ConfigCacheService.getInstance();