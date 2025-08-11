/**
 * High-Performance Cached Plugin Validator
 * 
 * Optimizes plugin validation through caching, lazy validation,
 * and performance-aware validation strategies.
 */

import { Injectable, Logger } from '@nestjs/common';
import { 
  PluginManifest, 
  PluginValidationResult,
  PluginSecurity 
} from '@libs/plugin-core';
import { PluginValidator } from '../plugin-validators';

interface ValidationCacheEntry {
  result: PluginValidationResult;
  checksum: string;
  timestamp: number;
  trustLevel?: string;
}

interface ValidationMetrics {
  cacheHits: number;
  cacheMisses: number;
  validationTime: number;
  totalValidations: number;
  averageValidationTime: number;
}

export interface ValidationOptions {
  /** Skip expensive validations for trusted plugins */
  skipTrustedValidation?: boolean;
  /** Cache validation results */
  enableCache?: boolean;
  /** Force re-validation even if cached */
  forceRevalidation?: boolean;
  /** Stop validation on first critical error */
  failFast?: boolean;
  /** Skip non-essential validations */
  essential?: boolean;
}

@Injectable()
export class CachedValidatorService {
  private readonly logger = new Logger(CachedValidatorService.name);
  private readonly validationCache = new Map<string, ValidationCacheEntry>();
  private readonly metrics: ValidationMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    validationTime: 0,
    totalValidations: 0,
    averageValidationTime: 0,
  };

  // Cache configuration
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  constructor() {
    // Start cache cleanup interval
    setInterval(() => this.cleanupCache(), this.CLEANUP_INTERVAL_MS);
    
    this.logger.log('Cached validator service initialized');
  }

  /**
   * High-performance manifest validation with caching and optimizations
   */
  async validateManifest(
    manifest: Partial<PluginManifest>, 
    options: ValidationOptions = {}
  ): Promise<PluginValidationResult> {
    const startTime = Date.now();
    
    try {
      // Generate cache key from manifest content
      const manifestContent = JSON.stringify(manifest);
      const checksum = this.generateChecksum(manifestContent);
      const cacheKey = `manifest:${manifest.name}:${checksum}`;

      // Check cache first (if enabled)
      if (options.enableCache !== false && !options.forceRevalidation) {
        const cached = this.getCachedResult(cacheKey);
        if (cached) {
          this.metrics.cacheHits++;
          this.logger.debug(`Cache hit for plugin ${manifest.name}`);
          return cached.result;
        }
      }

      // Cache miss - perform validation
      this.metrics.cacheMisses++;
      const result = await this.performValidation(manifest, options);

      // Cache the result (if caching is enabled)
      if (options.enableCache !== false) {
        this.setCachedResult(cacheKey, result, checksum, manifest.security?.trustLevel);
      }

      return result;
    } finally {
      // Update metrics
      const validationTime = Date.now() - startTime;
      this.updateMetrics(validationTime);
      
      if (validationTime > 1000) { // Log slow validations
        this.logger.warn(`Slow validation for ${manifest.name}: ${validationTime}ms`);
      }
    }
  }

  /**
   * Batch validation with optimized processing
   */
  async validateManifests(
    manifests: Array<{ manifest: Partial<PluginManifest>, options?: ValidationOptions }>,
    globalOptions: ValidationOptions = {}
  ): Promise<PluginValidationResult[]> {
    const startTime = Date.now();
    
    // Sort by trust level to validate trusted plugins first (they're faster)
    const sortedManifests = manifests.sort((a, b) => {
      const trustA = a.manifest.security?.trustLevel || 'community';
      const trustB = b.manifest.security?.trustLevel || 'community';
      const trustOrder = { internal: 0, verified: 1, community: 2 };
      return trustOrder[trustA] - trustOrder[trustB];
    });

    // Process in batches to avoid memory spikes
    const BATCH_SIZE = 10;
    const results: PluginValidationResult[] = [];
    
    for (let i = 0; i < sortedManifests.length; i += BATCH_SIZE) {
      const batch = sortedManifests.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(({ manifest, options }) => 
        this.validateManifest(manifest, { ...globalOptions, ...options })
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Log progress for large batches
      if (sortedManifests.length > 50) {
        this.logger.debug(`Validated batch ${i / BATCH_SIZE + 1}/${Math.ceil(sortedManifests.length / BATCH_SIZE)}`);
      }
    }

    const totalTime = Date.now() - startTime;
    this.logger.log(`Batch validated ${manifests.length} manifests in ${totalTime}ms`);
    
    return results;
  }

  /**
   * Get validation performance metrics
   */
  getMetrics(): ValidationMetrics & { cacheSize: number, cacheHitRate: number } {
    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? (this.metrics.cacheHits / totalRequests) * 100 : 0;
    
    return {
      ...this.metrics,
      cacheSize: this.validationCache.size,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
    };
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validationCache.clear();
    this.logger.log('Validation cache cleared');
  }

  /**
   * Precompile validation rules for known manifests
   */
  async precompileValidation(manifests: Partial<PluginManifest>[]): Promise<void> {
    this.logger.log(`Precompiling validation for ${manifests.length} manifests`);
    
    const options: ValidationOptions = { 
      enableCache: true, 
      essential: true 
    };
    
    await this.validateManifests(
      manifests.map(manifest => ({ manifest, options })),
      options
    );
  }

  private async performValidation(
    manifest: Partial<PluginManifest>, 
    options: ValidationOptions
  ): Promise<PluginValidationResult> {
    
    // Fast path for trusted internal plugins
    if (options.skipTrustedValidation && 
        manifest.security?.trustLevel === 'internal') {
      return this.performTrustedValidation(manifest);
    }

    // Essential validation only
    if (options.essential) {
      return this.performEssentialValidation(manifest, options.failFast);
    }

    // Full validation (existing logic)
    return this.performFullValidation(manifest, options.failFast);
  }

  /**
   * Fast validation for trusted internal plugins
   */
  private performTrustedValidation(manifest: Partial<PluginManifest>): PluginValidationResult {
    const errors: string[] = [];
    
    // Only validate critical fields for trusted plugins
    const criticalFields = ['name', 'version'];
    for (const field of criticalFields) {
      if (!manifest[field]) {
        errors.push(`Missing critical field: ${field}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [], // Skip warning generation for trusted plugins
    };
  }

  /**
   * Essential validation with minimal overhead
   */
  private performEssentialValidation(
    manifest: Partial<PluginManifest>, 
    failFast?: boolean
  ): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields check
    const requiredFields: (keyof PluginManifest)[] = [
      'name', 'version', 'description', 'author', 'license'
    ];

    for (const field of requiredFields) {
      if (!manifest[field]) {
        errors.push(`Missing required field: ${field}`);
        if (failFast) break;
      }
    }

    if (failFast && errors.length > 0) {
      return { isValid: false, errors, warnings: [] };
    }

    // Basic format validation
    if (manifest.name && !/^[a-z0-9-_]+$/.test(manifest.name)) {
      errors.push('Invalid plugin name format');
    }

    if (manifest.version && !/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/.test(manifest.version)) {
      errors.push('Invalid version format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Full validation with existing comprehensive logic
   */
  private performFullValidation(
    manifest: Partial<PluginManifest>, 
    failFast?: boolean
  ): PluginValidationResult {
    // Use existing validator but with fail-fast optimization
    if (failFast) {
      return this.performFailFastValidation(manifest);
    }
    
    return PluginValidator.validateManifest(manifest);
  }

  /**
   * Fail-fast validation that stops on first critical error
   */
  private performFailFastValidation(manifest: Partial<PluginManifest>): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields first
    const requiredFields: (keyof PluginManifest)[] = [
      'name', 'version', 'description', 'author', 'license'
    ];

    for (const field of requiredFields) {
      if (!manifest[field]) {
        return {
          isValid: false,
          errors: [`Missing required field: ${field}`],
          warnings: [],
        };
      }
    }

    // Quick format checks
    if (!/^[a-z0-9-_]+$/.test(manifest.name!)) {
      return {
        isValid: false,
        errors: ['Invalid plugin name format'],
        warnings: [],
      };
    }

    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/.test(manifest.version!)) {
      return {
        isValid: false,
        errors: ['Invalid version format'],
        warnings: [],
      };
    }

    // If basic validation passes, do full validation
    return PluginValidator.validateManifest(manifest);
  }

  private getCachedResult(cacheKey: string): ValidationCacheEntry | null {
    const entry = this.validationCache.get(cacheKey);
    
    if (!entry) return null;
    
    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.validationCache.delete(cacheKey);
      return null;
    }
    
    return entry;
  }

  private setCachedResult(
    cacheKey: string, 
    result: PluginValidationResult, 
    checksum: string, 
    trustLevel?: string
  ): void {
    // Implement LRU eviction if cache is full
    if (this.validationCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.validationCache.keys().next().value;
      if (oldestKey) {
        this.validationCache.delete(oldestKey);
      }
    }

    this.validationCache.set(cacheKey, {
      result,
      checksum,
      timestamp: Date.now(),
      trustLevel,
    });
  }

  private generateChecksum(content: string): string {
    // Simple hash function for caching (not cryptographic)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  private cleanupCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.validationCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL_MS) {
        this.validationCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  private updateMetrics(validationTime: number): void {
    this.metrics.validationTime += validationTime;
    this.metrics.totalValidations++;
    this.metrics.averageValidationTime = 
      this.metrics.validationTime / this.metrics.totalValidations;
  }
}