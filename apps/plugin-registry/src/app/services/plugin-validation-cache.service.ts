import { Injectable, Logger } from '@nestjs/common';
import { PluginValidationResult } from '@modu-nest/plugin-types';

/**
 * Cache entry interface for validation results
 */
interface ValidationCacheEntry {
  result: PluginValidationResult;
  timestamp: number;
  checksum: string;
  validationType: 'security' | 'manifest' | 'structure' | 'full';
  accessCount: number;
  lastAccessed: number;
}

/**
 * Cache statistics interface
 */
interface CacheStatistics {
  size: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  oldestEntry: Date | null;
  memoryUsage: number;
  validationTypes: Record<string, number>;
}

/**
 * Plugin Validation Cache Service
 * 
 * Provides caching for plugin validation results to eliminate redundant security
 * scanning and improve performance. Uses SHA-256 checksums as cache keys to ensure
 * cache validity and supports different validation types with configurable TTL.
 * 
 * Features:
 * - SHA-256 checksum-based caching
 * - TTL expiration with automatic cleanup
 * - LRU eviction for memory management
 * - Validation type compatibility
 * - Comprehensive cache statistics
 * - Hit rate monitoring
 */
@Injectable()
export class PluginValidationCacheService {
  private readonly logger = new Logger(PluginValidationCacheService.name);
  
  private validationCache = new Map<string, ValidationCacheEntry>();
  
  // Configuration
  private readonly CACHE_TTL = parseInt(process.env.PLUGIN_VALIDATION_CACHE_TTL || '86400000', 10); // 24 hours
  private readonly MAX_CACHE_SIZE = parseInt(process.env.PLUGIN_VALIDATION_CACHE_SIZE || '1000', 10);
  private readonly CLEANUP_INTERVAL = parseInt(process.env.PLUGIN_VALIDATION_CLEANUP_INTERVAL || '3600000', 10); // 1 hour
  
  // Statistics tracking
  private totalHits = 0;
  private totalMisses = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.logger.log(`Validation cache initialized: TTL=${this.CACHE_TTL}ms, maxSize=${this.MAX_CACHE_SIZE}, cleanupInterval=${this.CLEANUP_INTERVAL}ms`);
    this.startPeriodicCleanup();
  }

  /**
   * Get cached validation result by checksum
   * @param checksum - SHA-256 checksum of the plugin content
   * @param validationType - Type of validation requested (optional)
   * @returns Cached validation result or null if not found/expired
   */
  getCachedValidation(checksum: string, validationType?: 'security' | 'manifest' | 'structure' | 'full'): PluginValidationResult | null {
    const cached = this.validationCache.get(checksum);
    
    if (!cached) {
      this.totalMisses++;
      this.logger.debug(`Cache miss for checksum: ${checksum.substring(0, 8)}...`);
      return null;
    }

    // Check TTL expiration
    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_TTL) {
      this.validationCache.delete(checksum);
      this.totalMisses++;
      this.logger.debug(`Cache expired for checksum: ${checksum.substring(0, 8)}... (age: ${now - cached.timestamp}ms)`);
      return null;
    }

    // Check validation type compatibility
    if (validationType && cached.validationType !== validationType && cached.validationType !== 'full') {
      this.totalMisses++;
      this.logger.debug(`Cache type mismatch for checksum: ${checksum.substring(0, 8)}... (cached: ${cached.validationType}, requested: ${validationType})`);
      return null;
    }

    // Update access statistics
    cached.accessCount++;
    cached.lastAccessed = now;
    this.totalHits++;
    
    this.logger.debug(`Cache hit for checksum: ${checksum.substring(0, 8)}... (type: ${cached.validationType}, hits: ${cached.accessCount})`);
    return cached.result;
  }

  /**
   * Cache validation result
   * @param checksum - SHA-256 checksum of the plugin content
   * @param result - Validation result to cache
   * @param validationType - Type of validation performed
   */
  setCachedValidation(
    checksum: string, 
    result: PluginValidationResult,
    validationType: 'security' | 'manifest' | 'structure' | 'full' = 'full'
  ): void {
    // Implement cache size limit with LRU eviction
    if (this.validationCache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestEntry();
    }

    const now = Date.now();
    const entry: ValidationCacheEntry = {
      result,
      timestamp: now,
      checksum,
      validationType,
      accessCount: 0,
      lastAccessed: now
    };

    this.validationCache.set(checksum, entry);
    
    this.logger.debug(`Cached validation result for checksum: ${checksum.substring(0, 8)}... (type: ${validationType}, valid: ${result.isValid})`);
  }

  /**
   * Clear all cached validation results
   */
  clearCache(): void {
    const size = this.validationCache.size;
    this.validationCache.clear();
    this.totalHits = 0;
    this.totalMisses = 0;
    
    this.logger.log(`Cache cleared: removed ${size} entries`);
  }

  /**
   * Remove expired entries from cache
   * @returns Number of entries removed
   */
  cleanupExpiredEntries(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [checksum, entry] of this.validationCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.validationCache.delete(checksum);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.debug(`Cleanup removed ${removedCount} expired cache entries`);
    }

    return removedCount;
  }

  /**
   * Get comprehensive cache statistics
   * @returns Cache statistics object
   */
  getCacheStats(): CacheStatistics {
    const now = Date.now();
    let oldestTimestamp = now;
    const validationTypes: Record<string, number> = {};

    // Calculate statistics
    for (const entry of this.validationCache.values()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
      
      validationTypes[entry.validationType] = (validationTypes[entry.validationType] || 0) + 1;
    }

    const totalRequests = this.totalHits + this.totalMisses;
    const hitRate = totalRequests > 0 ? (this.totalHits / totalRequests) * 100 : 0;

    // Estimate memory usage (rough calculation)
    const avgEntrySize = 500; // Estimated bytes per cache entry
    const memoryUsage = this.validationCache.size * avgEntrySize;

    return {
      size: this.validationCache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      oldestEntry: oldestTimestamp < now ? new Date(oldestTimestamp) : null,
      memoryUsage,
      validationTypes
    };
  }

  /**
   * Check if a specific checksum is cached
   * @param checksum - SHA-256 checksum to check
   * @returns True if cached and not expired
   */
  isCached(checksum: string): boolean {
    const cached = this.validationCache.get(checksum);
    if (!cached) return false;

    // Check if expired
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.validationCache.delete(checksum);
      return false;
    }

    return true;
  }

  /**
   * Get cache entry details for a specific checksum
   * @param checksum - SHA-256 checksum
   * @returns Cache entry details or null if not found
   */
  getCacheEntryDetails(checksum: string): {
    validationType: string;
    timestamp: Date;
    accessCount: number;
    lastAccessed: Date;
    isValid: boolean;
    age: number;
  } | null {
    const cached = this.validationCache.get(checksum);
    if (!cached) return null;

    const now = Date.now();
    return {
      validationType: cached.validationType,
      timestamp: new Date(cached.timestamp),
      accessCount: cached.accessCount,
      lastAccessed: new Date(cached.lastAccessed),
      isValid: cached.result.isValid,
      age: now - cached.timestamp
    };
  }

  /**
   * Remove validation cache entry for specific checksum
   * @param checksum - SHA-256 checksum to remove
   * @returns True if entry was removed
   */
  removeCacheEntry(checksum: string): boolean {
    const existed = this.validationCache.has(checksum);
    if (existed) {
      this.validationCache.delete(checksum);
      this.logger.debug(`Removed cache entry for checksum: ${checksum.substring(0, 8)}...`);
    }
    return existed;
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      const removed = this.cleanupExpiredEntries();
      if (removed > 0) {
        this.logger.debug(`Periodic cleanup removed ${removed} expired entries`);
      }
    }, this.CLEANUP_INTERVAL);

    this.logger.debug(`Started periodic cache cleanup every ${this.CLEANUP_INTERVAL}ms`);
  }

  /**
   * Evict the oldest (least recently accessed) cache entry
   */
  private evictOldestEntry(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [checksum, entry] of this.validationCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = checksum;
      }
    }

    if (oldestKey) {
      this.validationCache.delete(oldestKey);
      this.logger.debug(`Evicted oldest cache entry: ${oldestKey.substring(0, 8)}... (last accessed: ${new Date(oldestTime).toISOString()})`);
    }
  }

  /**
   * Cleanup resources on service destruction
   */
  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.logger.debug('Validation cache service destroyed');
  }
}