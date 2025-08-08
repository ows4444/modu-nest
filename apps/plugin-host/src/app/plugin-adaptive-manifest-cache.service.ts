import { Injectable, Logger } from '@nestjs/common';
import { PluginManifest, PluginCacheService, PluginCacheKeyBuilder } from '@modu-nest/plugin-types';

export interface ManifestCacheConfig {
  ttl: number; // Time to live in milliseconds
  priority: 'high' | 'medium' | 'low';
  validateOnRead?: boolean;
  invalidateOnUpdate?: boolean;
}

export interface PluginCacheContext {
  pluginPath: string;
  manifest?: PluginManifest;
  trustLevel?: string;
  lastModified?: Date;
  accessCount?: number;
}

@Injectable()
export class PluginAdaptiveManifestCacheService {
  private readonly logger = new Logger(PluginAdaptiveManifestCacheService.name);
  private readonly accessCounts = new Map<string, number>();
  private readonly lastAccessTime = new Map<string, Date>();

  constructor(private readonly cacheService: PluginCacheService) {}

  /**
   * Get cached manifest with adaptive TTL consideration
   */
  getCachedManifest(pluginPath: string, context?: Partial<PluginCacheContext>): PluginManifest | null {
    const cacheKey = PluginCacheKeyBuilder.pluginManifest(pluginPath);
    const cachedManifest = this.cacheService.get<PluginManifest>(cacheKey);

    if (cachedManifest) {
      // Update access tracking
      this.updateAccessTracking(pluginPath);
      
      this.logger.debug(`Cache hit for manifest: ${pluginPath}`);
      return cachedManifest;
    }

    this.logger.debug(`Cache miss for manifest: ${pluginPath}`);
    return null;
  }

  /**
   * Cache manifest with adaptive TTL based on plugin characteristics
   */
  cacheManifest(manifest: PluginManifest, context: PluginCacheContext): void {
    const config = this.determineCacheConfig(manifest, context);
    const cacheKey = PluginCacheKeyBuilder.pluginManifest(context.pluginPath);

    // Store with adaptive TTL
    this.cacheService.set(cacheKey, manifest, config.ttl);

    // Update access tracking
    this.updateAccessTracking(context.pluginPath);

    this.logger.debug(
      `Cached manifest: ${context.pluginPath} with TTL: ${config.ttl}ms (priority: ${config.priority})`
    );

    // Emit cache metrics
    this.emitCacheMetrics(manifest.name, config, 'set');
  }

  /**
   * Invalidate cached manifest for a specific plugin
   */
  invalidateManifest(pluginPath: string): void {
    const cacheKey = PluginCacheKeyBuilder.pluginManifest(pluginPath);
    this.cacheService.delete(cacheKey);
    
    // Clean up tracking data
    this.accessCounts.delete(pluginPath);
    this.lastAccessTime.delete(pluginPath);

    this.logger.debug(`Invalidated manifest cache: ${pluginPath}`);
  }

  /**
   * Determine appropriate cache configuration based on plugin characteristics
   */
  private determineCacheConfig(manifest: PluginManifest, context: PluginCacheContext): ManifestCacheConfig {
    let baseTTL: number;
    let priority: 'high' | 'medium' | 'low';

    // Base TTL determination based on plugin criticality
    if (manifest.critical === true) {
      // Critical plugins: shorter cache to ensure updates are picked up quickly
      baseTTL = 5 * 60 * 1000; // 5 minutes
      priority = 'high';
    } else if (manifest.critical === false) {
      // Non-critical plugins: longer cache to reduce overhead
      baseTTL = 30 * 60 * 1000; // 30 minutes
      priority = 'low';
    } else {
      // Default plugins: moderate caching
      baseTTL = 15 * 60 * 1000; // 15 minutes
      priority = 'medium';
    }

    // Adjust based on trust level
    baseTTL = this.adjustTTLForTrustLevel(baseTTL, context.trustLevel);

    // Adjust based on access frequency
    baseTTL = this.adjustTTLForAccessFrequency(baseTTL, context.pluginPath);

    // Adjust based on version stability
    baseTTL = this.adjustTTLForVersionStability(baseTTL, manifest.version);

    // Apply environment-specific adjustments
    baseTTL = this.adjustTTLForEnvironment(baseTTL);

    return {
      ttl: baseTTL,
      priority,
      validateOnRead: manifest.critical === true,
      invalidateOnUpdate: true,
    };
  }

  /**
   * Adjust TTL based on plugin trust level
   */
  private adjustTTLForTrustLevel(baseTTL: number, trustLevel?: string): number {
    if (!trustLevel) return baseTTL;

    switch (trustLevel) {
      case 'internal':
        // Internal plugins: longer cache (more stable)
        return baseTTL * 2;
      
      case 'verified':
        // Verified plugins: slightly longer cache
        return baseTTL * 1.5;
      
      case 'community':
        // Community plugins: standard cache
        return baseTTL;
      
      case 'untrusted':
        // Untrusted plugins: shorter cache (more validation needed)
        return baseTTL * 0.5;
      
      case 'quarantined':
        // Quarantined plugins: minimal cache
        return Math.min(baseTTL * 0.2, 60 * 1000); // Max 1 minute
      
      default:
        return baseTTL;
    }
  }

  /**
   * Adjust TTL based on access frequency
   */
  private adjustTTLForAccessFrequency(baseTTL: number, pluginPath: string): number {
    const accessCount = this.accessCounts.get(pluginPath) || 0;
    const lastAccess = this.lastAccessTime.get(pluginPath);

    if (accessCount > 10) {
      // Frequently accessed plugins: longer cache
      return baseTTL * 1.5;
    } else if (accessCount > 5) {
      // Moderately accessed plugins: standard cache
      return baseTTL;
    } else if (lastAccess && Date.now() - lastAccess.getTime() > 24 * 60 * 60 * 1000) {
      // Rarely accessed plugins: shorter cache
      return baseTTL * 0.7;
    }

    return baseTTL;
  }

  /**
   * Adjust TTL based on version stability (pre-release versions get shorter cache)
   */
  private adjustTTLForVersionStability(baseTTL: number, version: string): number {
    // Check for pre-release indicators
    if (version.includes('-alpha') || version.includes('-beta') || version.includes('-rc')) {
      // Pre-release versions: shorter cache
      return baseTTL * 0.5;
    }

    // Check for development versions (0.x.x)
    if (version.startsWith('0.')) {
      // Development versions: shorter cache
      return baseTTL * 0.8;
    }

    return baseTTL;
  }

  /**
   * Adjust TTL based on environment (development vs production)
   */
  private adjustTTLForEnvironment(baseTTL: number): number {
    const nodeEnv = process.env.NODE_ENV;

    if (nodeEnv === 'development') {
      // Development: shorter cache for faster iteration
      return Math.max(baseTTL * 0.3, 30 * 1000); // Min 30 seconds
    } else if (nodeEnv === 'test') {
      // Test environment: minimal cache
      return Math.max(baseTTL * 0.1, 5 * 1000); // Min 5 seconds
    }

    // Production: use calculated TTL
    return baseTTL;
  }

  /**
   * Update access tracking for cache optimization
   */
  private updateAccessTracking(pluginPath: string): void {
    const currentCount = this.accessCounts.get(pluginPath) || 0;
    this.accessCounts.set(pluginPath, currentCount + 1);
    this.lastAccessTime.set(pluginPath, new Date());
  }

  /**
   * Get cache statistics for a specific plugin
   */
  getCacheStats(pluginPath: string): {
    accessCount: number;
    lastAccess: Date | null;
    isCached: boolean;
  } {
    const cacheKey = PluginCacheKeyBuilder.pluginManifest(pluginPath);
    return {
      accessCount: this.accessCounts.get(pluginPath) || 0,
      lastAccess: this.lastAccessTime.get(pluginPath) || null,
      isCached: this.cacheService.has(cacheKey),
    };
  }

  /**
   * Get overall cache statistics
   */
  getAllCacheStats(): {
    totalCachedManifests: number;
    totalAccessCount: number;
    averageAccessCount: number;
    cacheHitRate: number;
  } {
    const totalAccess = Array.from(this.accessCounts.values()).reduce((sum, count) => sum + count, 0);
    const totalPlugins = this.accessCounts.size;

    return {
      totalCachedManifests: totalPlugins,
      totalAccessCount: totalAccess,
      averageAccessCount: totalPlugins > 0 ? totalAccess / totalPlugins : 0,
      cacheHitRate: this.calculateCacheHitRate(),
    };
  }

  /**
   * Calculate cache hit rate based on access patterns
   */
  private calculateCacheHitRate(): number {
    // This is a simplified calculation
    // In a real implementation, you'd track hits vs misses more precisely
    const totalPlugins = this.accessCounts.size;
    if (totalPlugins === 0) return 0;

    const pluginsWithMultipleAccess = Array.from(this.accessCounts.values()).filter(count => count > 1).length;
    return pluginsWithMultipleAccess / totalPlugins;
  }

  /**
   * Emit cache metrics for monitoring
   */
  private emitCacheMetrics(pluginName: string, config: ManifestCacheConfig, operation: 'get' | 'set'): void {
    // This would integrate with your metrics system
    this.logger.debug(`Cache ${operation} for ${pluginName}: TTL=${config.ttl}ms, Priority=${config.priority}`);
  }

  /**
   * Clean up old tracking data periodically
   */
  cleanupOldTracking(maxAge: number = 7 * 24 * 60 * 60 * 1000): void { // 7 days default
    const now = Date.now();
    const cutoffTime = now - maxAge;

    for (const [pluginPath, lastAccess] of this.lastAccessTime.entries()) {
      if (lastAccess.getTime() < cutoffTime) {
        this.accessCounts.delete(pluginPath);
        this.lastAccessTime.delete(pluginPath);
        this.logger.debug(`Cleaned up old tracking data for: ${pluginPath}`);
      }
    }
  }
}