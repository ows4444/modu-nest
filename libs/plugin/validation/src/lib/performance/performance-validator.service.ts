/**
 * Performance-Optimized Plugin Validation Service
 *
 * Orchestrates caching, compilation, and optimization strategies
 * to provide the fastest possible plugin validation.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PluginManifest, PluginValidationResult } from '@plugin/core';
import { CachedValidatorService, ValidationOptions } from './cached-validator.service';
import { CompiledValidatorService } from './compiled-validator.service';

export interface PerformanceValidationOptions extends ValidationOptions {
  /** Use compiled validator for maximum speed */
  useCompiledValidator?: boolean;
  /** Validation strategy based on plugin characteristics */
  strategy?: 'auto' | 'cached' | 'compiled' | 'hybrid';
}

interface PerformanceMetrics {
  totalValidations: number;
  averageValidationTime: number;
  cacheHitRate: number;
  compiledValidations: number;
  optimizationSavings: number; // Time saved through optimizations
}

@Injectable()
export class PerformanceValidatorService implements OnModuleInit {
  private readonly logger = new Logger(PerformanceValidatorService.name);
  private readonly performanceMetrics: PerformanceMetrics = {
    totalValidations: 0,
    averageValidationTime: 0,
    cacheHitRate: 0,
    compiledValidations: 0,
    optimizationSavings: 0,
  };

  constructor(
    private readonly cachedValidator: CachedValidatorService,
    private readonly compiledValidator: CompiledValidatorService
  ) {}

  async onModuleInit(): Promise<void> {
    // Pre-compile validators on startup for optimal performance
    await this.compiledValidator.precompileValidators();
    this.logger.log('Performance validator service initialized');
  }

  /**
   * High-performance plugin manifest validation with automatic strategy selection
   */
  async validateManifest(
    manifest: Partial<PluginManifest>,
    options: PerformanceValidationOptions = {}
  ): Promise<PluginValidationResult> {
    const startTime = performance.now();

    try {
      // Auto-select optimal validation strategy
      const strategy = options.strategy || this.selectOptimalStrategy(manifest, options);

      let result: PluginValidationResult;

      switch (strategy) {
        case 'compiled':
          result = await this.validateWithCompiled(manifest, options);
          break;
        case 'cached':
          result = await this.validateWithCaching(manifest, options);
          break;
        case 'hybrid':
          result = await this.validateWithHybrid(manifest, options);
          break;
        case 'auto':
        default:
          result = await this.validateWithAutoStrategy(manifest, options);
          break;
      }

      return result;
    } finally {
      const validationTime = performance.now() - startTime;
      this.updatePerformanceMetrics(validationTime);
    }
  }

  /**
   * Batch validation with performance optimizations
   */
  async validateManifests(
    manifests: Array<{
      manifest: Partial<PluginManifest>;
      options?: PerformanceValidationOptions;
    }>,
    globalOptions: PerformanceValidationOptions = {}
  ): Promise<PluginValidationResult[]> {
    const startTime = performance.now();

    // Analyze batch characteristics for optimal processing
    const batchStrategy = this.selectBatchStrategy(manifests, globalOptions);

    let results: PluginValidationResult[];

    switch (batchStrategy) {
      case 'compiled':
        results = await this.batchValidateCompiled(manifests, globalOptions);
        break;
      case 'cached':
        results = await this.batchValidateCached(manifests, globalOptions);
        break;
      case 'hybrid':
        results = await this.batchValidateHybrid(manifests, globalOptions);
        break;
      default:
        results = await this.batchValidateAuto(manifests, globalOptions);
        break;
    }

    const totalTime = performance.now() - startTime;
    this.logger.log(
      `Batch validated ${manifests.length} manifests in ${totalTime.toFixed(2)}ms (${batchStrategy} strategy)`
    );

    return results;
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics & {
    cachedValidatorMetrics: any;
    compiledValidatorStats: any;
    recommendations: string[];
  } {
    const cachedMetrics = this.cachedValidator.getMetrics();
    const compiledStats = this.compiledValidator.getStats();
    const recommendations = this.generatePerformanceRecommendations();

    return {
      ...this.performanceMetrics,
      cachedValidatorMetrics: cachedMetrics,
      compiledValidatorStats: compiledStats,
      recommendations,
    };
  }

  /**
   * Optimize validation setup based on usage patterns
   */
  async optimizeForWorkload(workloadProfile: {
    repeatValidations?: boolean;
    trustedPlugins?: number;
    totalPlugins?: number;
    validationsPerSecond?: number;
  }): Promise<void> {
    this.logger.log('Optimizing validation setup for workload:', workloadProfile);

    // Pre-warm caches if repeat validations are common
    if (workloadProfile.repeatValidations) {
      // Enable aggressive caching
      this.logger.log('Enabling aggressive caching for repeat validations');
    }

    // Pre-compile validators if high throughput is expected
    if ((workloadProfile.validationsPerSecond || 0) > 10) {
      await this.compiledValidator.precompileValidators();
      this.logger.log('Pre-compiled validators for high-throughput workload');
    }
  }

  private selectOptimalStrategy(
    manifest: Partial<PluginManifest>,
    options: PerformanceValidationOptions
  ): 'compiled' | 'cached' | 'hybrid' | 'auto' {
    // Force compiled if explicitly requested
    if (options.useCompiledValidator) return 'compiled';

    // Use compiled for trusted plugins (fastest path)
    if (manifest.security?.trustLevel === 'internal') return 'compiled';

    // Use caching for complex manifests that might be repeated
    if (manifest.module?.guards && manifest.module.guards.length > 5) return 'cached';

    // Use hybrid for balanced performance
    return 'hybrid';
  }

  private selectBatchStrategy(
    manifests: Array<{
      manifest: Partial<PluginManifest>;
      options?: PerformanceValidationOptions;
    }>,
    _globalOptions: PerformanceValidationOptions
  ): 'compiled' | 'cached' | 'hybrid' | 'auto' {
    // Analyze batch characteristics
    const trustedCount = manifests.filter(({ manifest }) => manifest.security?.trustLevel === 'internal').length;

    const trustedRatio = trustedCount / manifests.length;

    // If mostly trusted plugins, use compiled strategy
    if (trustedRatio > 0.8) return 'compiled';

    // If large batch with potential duplicates, use cached strategy
    if (manifests.length > 50) return 'cached';

    // Default to hybrid for balanced performance
    return 'hybrid';
  }

  private async validateWithCompiled(
    manifest: Partial<PluginManifest>,
    options: PerformanceValidationOptions
  ): Promise<PluginValidationResult> {
    const validationType = this.getValidationType(manifest, options);
    const result = await this.compiledValidator.validateManifest(manifest, validationType);
    this.performanceMetrics.compiledValidations++;
    return result;
  }

  private async validateWithCaching(
    manifest: Partial<PluginManifest>,
    options: PerformanceValidationOptions
  ): Promise<PluginValidationResult> {
    return this.cachedValidator.validateManifest(manifest, options);
  }

  private async validateWithHybrid(
    manifest: Partial<PluginManifest>,
    options: PerformanceValidationOptions
  ): Promise<PluginValidationResult> {
    // Use compiled for trusted plugins, caching for others
    if (manifest.security?.trustLevel === 'internal' || options.essential) {
      return this.validateWithCompiled(manifest, options);
    } else {
      return this.validateWithCaching(manifest, options);
    }
  }

  private async validateWithAutoStrategy(
    manifest: Partial<PluginManifest>,
    options: PerformanceValidationOptions
  ): Promise<PluginValidationResult> {
    const strategy = this.selectOptimalStrategy(manifest, options);

    switch (strategy) {
      case 'compiled':
        return this.validateWithCompiled(manifest, options);
      case 'cached':
        return this.validateWithCaching(manifest, options);
      case 'hybrid':
      default:
        return this.validateWithHybrid(manifest, options);
    }
  }

  private async batchValidateCompiled(
    manifests: Array<{
      manifest: Partial<PluginManifest>;
      options?: PerformanceValidationOptions;
    }>,
    _globalOptions: PerformanceValidationOptions
  ): Promise<PluginValidationResult[]> {
    const results: PluginValidationResult[] = [];

    for (const { manifest, options } of manifests) {
      const validationType = this.getValidationType(manifest, options || {});
      const result = await this.compiledValidator.validateManifest(manifest, validationType);
      results.push(result);
      this.performanceMetrics.compiledValidations++;
    }

    return results;
  }

  private async batchValidateCached(
    manifests: Array<{
      manifest: Partial<PluginManifest>;
      options?: PerformanceValidationOptions;
    }>,
    globalOptions: PerformanceValidationOptions
  ): Promise<PluginValidationResult[]> {
    return this.cachedValidator.validateManifests(
      manifests.map(({ manifest, options }) => ({
        manifest,
        options: { ...globalOptions, ...options },
      })),
      globalOptions
    );
  }

  private async batchValidateHybrid(
    manifests: Array<{
      manifest: Partial<PluginManifest>;
      options?: PerformanceValidationOptions;
    }>,
    globalOptions: PerformanceValidationOptions
  ): Promise<PluginValidationResult[]> {
    // Separate manifests by strategy
    const compiledManifests: typeof manifests = [];
    const cachedManifests: typeof manifests = [];

    for (const item of manifests) {
      if (item.manifest.security?.trustLevel === 'internal' || item.options?.essential || globalOptions.essential) {
        compiledManifests.push(item);
      } else {
        cachedManifests.push(item);
      }
    }

    // Process both batches in parallel
    const [compiledResults, cachedResults] = await Promise.all([
      this.batchValidateCompiled(compiledManifests, globalOptions),
      this.batchValidateCached(cachedManifests, globalOptions),
    ]);

    // Merge results maintaining original order
    const results: PluginValidationResult[] = [];
    let compiledIndex = 0;
    let cachedIndex = 0;

    for (const item of manifests) {
      if (compiledManifests.includes(item)) {
        results.push(compiledResults[compiledIndex++]);
      } else {
        results.push(cachedResults[cachedIndex++]);
      }
    }

    return results;
  }

  private async batchValidateAuto(
    manifests: Array<{
      manifest: Partial<PluginManifest>;
      options?: PerformanceValidationOptions;
    }>,
    globalOptions: PerformanceValidationOptions
  ): Promise<PluginValidationResult[]> {
    // Auto-select strategy and delegate
    const strategy = this.selectBatchStrategy(manifests, globalOptions);

    switch (strategy) {
      case 'compiled':
        return this.batchValidateCompiled(manifests, globalOptions);
      case 'cached':
        return this.batchValidateCached(manifests, globalOptions);
      case 'hybrid':
      default:
        return this.batchValidateHybrid(manifests, globalOptions);
    }
  }

  private getValidationType(
    manifest: Partial<PluginManifest>,
    options: PerformanceValidationOptions
  ): 'full' | 'essential' | 'trusted' {
    if (options.essential) return 'essential';
    if (manifest.security?.trustLevel === 'internal') return 'trusted';
    return 'full';
  }

  private generatePerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    const metrics = this.getPerformanceMetrics();

    // Cache hit rate recommendations
    if (metrics.cachedValidatorMetrics.cacheHitRate < 30) {
      recommendations.push('Consider pre-warming validation cache for better performance');
    }

    // Compilation usage recommendations
    if (metrics.compiledValidations / metrics.totalValidations < 0.2) {
      recommendations.push('Consider using compiled validation for trusted plugins');
    }

    // Performance recommendations
    if (metrics.averageValidationTime > 50) {
      recommendations.push('Average validation time is high - consider using essential validation mode');
    }

    return recommendations;
  }

  private updatePerformanceMetrics(validationTime: number): void {
    this.performanceMetrics.totalValidations++;

    // Update average validation time
    const totalTime =
      this.performanceMetrics.averageValidationTime * (this.performanceMetrics.totalValidations - 1) + validationTime;
    this.performanceMetrics.averageValidationTime = totalTime / this.performanceMetrics.totalValidations;

    // Update cache hit rate from cached validator
    const cachedMetrics = this.cachedValidator.getMetrics();
    this.performanceMetrics.cacheHitRate = cachedMetrics.cacheHitRate;

    // Calculate optimization savings (comparing to baseline of 100ms)
    const baselineTime = 100;
    if (validationTime < baselineTime) {
      this.performanceMetrics.optimizationSavings += baselineTime - validationTime;
    }
  }
}
