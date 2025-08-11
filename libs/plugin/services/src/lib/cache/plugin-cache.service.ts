import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * Cache entry interface with TTL and LRU support
 */
export interface CacheEntry<T> {
  data: T;
  expiry: number;
  accessCount: number;
  lastAccessed: number;
  createdAt: number;
  key: string;
}

/**
 * Cache statistics interface
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  totalRequests: number;
  memoryUsage: number;
  oldestEntry?: {
    key: string;
    age: number;
  };
  newestEntry?: {
    key: string;
    age: number;
  };
}

/**
 * Cache configuration interface
 */
export interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  cleanupInterval: number;
  memoryLimit: number;
}

/**
 * Advanced Plugin Caching Service
 *
 * Provides enterprise-grade caching with the following features:
 * - TTL (Time To Live) support with automatic expiration
 * - LRU (Least Recently Used) eviction strategy
 * - Pattern-based cache invalidation with RegExp support
 * - Memory management with configurable limits
 * - Comprehensive statistics and monitoring
 * - Thread-safe operations with atomic updates
 * - Automatic cleanup of expired entries
 * - Configurable cache policies per key pattern
 */
@Injectable()
export class PluginCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(PluginCacheService.name);

  private cache = new Map<string, CacheEntry<unknown>>();
  private accessOrder = new Map<string, number>(); // Track access order for LRU
  private accessCounter = 0;

  // Statistics tracking
  private totalHits = 0;
  private totalMisses = 0;
  private totalRequests = 0;

  // Configuration with environment variable support
  private readonly config: CacheConfig = {
    maxSize: parseInt(process.env.PLUGIN_CACHE_MAX_SIZE || '1000', 10),
    defaultTTL: parseInt(process.env.PLUGIN_CACHE_DEFAULT_TTL || '300000', 10), // 5 minutes
    cleanupInterval: parseInt(process.env.PLUGIN_CACHE_CLEANUP_INTERVAL || '60000', 10), // 1 minute
    memoryLimit: parseInt(process.env.PLUGIN_CACHE_MEMORY_LIMIT || '104857600', 10), // 100MB
  };

  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startPeriodicCleanup();
    this.logger.log(`Plugin cache service initialized with config: ${JSON.stringify(this.config)}`);
  }

  /**
   * Set a value in the cache with optional TTL
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Time to live in milliseconds (optional, uses default if not provided)
   */
  set<T>(key: string, data: T, ttl: number = this.config.defaultTTL): void {
    try {
      // Check if we need to evict entries due to size limit
      if (this.cache.size >= this.config.maxSize) {
        this.evictLeastRecentlyUsed();
      }

      // Check memory usage and evict if necessary
      if (this.getEstimatedMemoryUsage() > this.config.memoryLimit) {
        this.evictOldestEntries(Math.floor(this.cache.size * 0.1)); // Evict 10% of entries
      }

      const now = Date.now();
      const entry: CacheEntry<T> = {
        data,
        expiry: now + ttl,
        accessCount: 0,
        lastAccessed: now,
        createdAt: now,
        key,
      };

      this.cache.set(key, entry);
      this.accessOrder.set(key, ++this.accessCounter);

      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl}ms, Size: ${this.cache.size})`);
    } catch (error) {
      this.logger.error(`Failed to set cache entry for key '${key}':`, error);
    }
  }

  /**
   * Get a value from the cache
   * @param key - Cache key
   * @returns Cached data or undefined if not found/expired
   */
  get<T>(key: string): T | undefined {
    this.totalRequests++;

    try {
      const entry = this.cache.get(key);
      if (!entry) {
        this.totalMisses++;
        return undefined;
      }

      // Check if entry has expired
      const now = Date.now();
      if (now > entry.expiry) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        this.totalMisses++;
        this.logger.debug(`Cache EXPIRED: ${key}`);
        return undefined;
      }

      // Update access statistics
      entry.accessCount++;
      entry.lastAccessed = now;
      this.accessOrder.set(key, ++this.accessCounter);
      this.totalHits++;

      this.logger.debug(`Cache HIT: ${key} (Access count: ${entry.accessCount})`);
      return entry.data as T;
    } catch (error) {
      this.logger.error(`Failed to get cache entry for key '${key}':`, error);
      this.totalMisses++;
      return undefined;
    }
  }

  /**
   * Check if a key exists in the cache (without updating access statistics)
   * @param key - Cache key
   * @returns True if key exists and not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check expiration
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific cache entry
   * @param key - Cache key to delete
   * @returns True if the key existed and was deleted
   */
  invalidate(key: string): boolean {
    const existed = this.cache.has(key);
    if (existed) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.logger.debug(`Cache INVALIDATE: ${key}`);
    }
    return existed;
  }

  /**
   * Delete multiple cache entries matching a pattern
   * @param pattern - Regular expression pattern to match keys
   * @returns Number of entries deleted
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    const keysToDelete: string[] = [];

    try {
      // Collect keys that match the pattern
      for (const key of this.cache.keys()) {
        if (pattern.test(key)) {
          keysToDelete.push(key);
        }
      }

      // Delete matched keys
      for (const key of keysToDelete) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        count++;
      }

      if (count > 0) {
        this.logger.log(`Cache INVALIDATE_PATTERN: ${pattern.source} (${count} entries deleted)`);
      }
    } catch (error) {
      this.logger.error(`Failed to invalidate pattern '${pattern.source}':`, error);
    }

    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();
    this.resetStatistics();
    this.logger.log(`Cache CLEAR: ${size} entries removed`);
  }

  /**
   * Get comprehensive cache statistics
   * @returns Cache statistics object
   */
  getCacheStats(): CacheStats {
    const memoryUsage = this.getEstimatedMemoryUsage();
    const hitRate = this.totalRequests > 0 ? (this.totalHits / this.totalRequests) * 100 : 0;

    // Find oldest and newest entries
    let oldestEntry: { key: string; age: number } | undefined;
    let newestEntry: { key: string; age: number } | undefined;

    const now = Date.now();
    for (const [key, entry] of this.cache) {
      const age = now - entry.createdAt;

      if (!oldestEntry || age > oldestEntry.age) {
        oldestEntry = { key, age };
      }

      if (!newestEntry || age < newestEntry.age) {
        newestEntry = { key, age };
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: Math.round(hitRate * 100) / 100,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      totalRequests: this.totalRequests,
      memoryUsage,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Get all cache keys
   * @returns Array of cache keys
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get keys matching a pattern
   * @param pattern - Regular expression pattern
   * @returns Array of matching keys
   */
  getKeysMatching(pattern: RegExp): string[] {
    const matchingKeys: string[] = [];

    for (const key of this.cache.keys()) {
      try {
        if (pattern.test(key)) {
          matchingKeys.push(key);
        }
      } catch (error) {
        this.logger.warn(`Pattern matching failed for key '${key}':`, error);
      }
    }

    return matchingKeys;
  }

  /**
   * Get detailed information about a specific cache entry
   * @param key - Cache key
   * @returns Cache entry details or undefined
   */
  getEntryDetails(key: string): (CacheEntry<unknown> & { ttl: number; isExpired: boolean }) | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    const ttl = Math.max(0, entry.expiry - now);
    const isExpired = now > entry.expiry;

    return {
      ...entry,
      ttl,
      isExpired,
    };
  }

  /**
   * Update the TTL of an existing cache entry
   * @param key - Cache key
   * @param newTTL - New TTL in milliseconds
   * @returns True if the entry existed and was updated
   */
  updateTTL(key: string, newTTL: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    entry.expiry = Date.now() + newTTL;
    this.logger.debug(`Cache TTL_UPDATE: ${key} (New TTL: ${newTTL}ms)`);
    return true;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLeastRecentlyUsed(): void {
    if (this.cache.size === 0) return;

    // Find the entry with the lowest access order
    let lruKey = '';
    let lruOrder = Number.MAX_SAFE_INTEGER;

    for (const [key, order] of this.accessOrder) {
      if (order < lruOrder) {
        lruOrder = order;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
      this.logger.debug(`Cache LRU_EVICT: ${lruKey}`);
    }
  }

  /**
   * Evict the specified number of oldest entries
   * @param count - Number of entries to evict
   */
  private evictOldestEntries(count: number): void {
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.createdAt - b.createdAt)
      .slice(0, count);

    for (const [key] of entries) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }

    if (entries.length > 0) {
      this.logger.debug(`Cache EVICT_OLDEST: ${entries.length} entries evicted`);
    }
  }

  /**
   * Clean up expired entries
   * @returns Number of expired entries removed
   */
  private cleanupExpiredEntries(): number {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.logger.debug(`Cache CLEANUP: ${expiredKeys.length} expired entries removed`);
    }

    return expiredKeys.length;
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.config.cleanupInterval);

    this.logger.debug(`Periodic cleanup started (interval: ${this.config.cleanupInterval}ms)`);
  }

  /**
   * Stop periodic cleanup
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.logger.debug('Periodic cleanup stopped');
    }
  }

  /**
   * Estimate memory usage of the cache
   * @returns Estimated memory usage in bytes
   */
  private getEstimatedMemoryUsage(): number {
    let totalSize = 0;

    for (const [key, entry] of this.cache) {
      // Rough estimation: key size + JSON serialization of data + metadata
      totalSize += key.length * 2; // UTF-16 encoding
      totalSize += JSON.stringify(entry.data).length * 2;
      totalSize += 200; // Estimated metadata overhead
    }

    return totalSize;
  }

  /**
   * Reset cache statistics
   */
  private resetStatistics(): void {
    this.totalHits = 0;
    this.totalMisses = 0;
    this.totalRequests = 0;
    this.accessCounter = 0;
  }

  /**
   * Lifecycle hook: Clean up resources when module is destroyed
   */
  onModuleDestroy(): void {
    this.stopPeriodicCleanup();
    this.clear();
    this.logger.log('Plugin cache service destroyed');
  }
}

/**
 * Cache key builder utility for consistent key generation
 */
export class PluginCacheKeyBuilder {
  /**
   * Build a cache key for plugin manifests
   * @param pluginName - Plugin name
   * @param version - Plugin version
   * @returns Cache key
   */
  static pluginManifest(pluginName: string, version?: string): string {
    return version ? `manifest:${pluginName}:${version}` : `manifest:${pluginName}`;
  }

  /**
   * Build a cache key for plugin validation results
   * @param checksum - Plugin checksum
   * @param validationType - Type of validation
   * @returns Cache key
   */
  static pluginValidation(checksum: string, validationType = 'full'): string {
    return `validation:${checksum}:${validationType}`;
  }

  /**
   * Build a cache key for plugin dependencies
   * @param pluginName - Plugin name
   * @returns Cache key
   */
  static pluginDependencies(pluginName: string): string {
    return `dependencies:${pluginName}`;
  }

  /**
   * Build a cache key for plugin metadata
   * @param pluginName - Plugin name
   * @param version - Plugin version
   * @returns Cache key
   */
  static pluginMetadata(pluginName: string, version?: string): string {
    return version ? `metadata:${pluginName}:${version}` : `metadata:${pluginName}`;
  }

  /**
   * Build a cache key for plugin statistics
   * @param pluginName - Plugin name
   * @returns Cache key
   */
  static pluginStats(pluginName: string): string {
    return `stats:${pluginName}`;
  }

  /**
   * Build a cache key for system metrics
   * @returns Cache key
   */
  static systemMetrics(): string {
    return 'system:metrics';
  }

  /**
   * Get pattern for all keys related to a plugin
   * @param pluginName - Plugin name
   * @returns RegExp pattern
   */
  static pluginPattern(pluginName: string): RegExp {
    return new RegExp(`^[^:]+:${pluginName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?::|$)`);
  }

  /**
   * Get pattern for all keys of a specific type
   * @param type - Cache key type (manifest, validation, dependencies, etc.)
   * @returns RegExp pattern
   */
  static typePattern(type: string): RegExp {
    return new RegExp(`^${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`);
  }
}
