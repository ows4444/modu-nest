import { DynamicModule } from '@nestjs/common';
import {
  IPluginLoadingStrategy,
  PluginDiscovery,
  PluginLoaderContext,
  PluginLoadingState,
  LoadingStrategyType,
} from './plugin-loading-strategy.interface';

export class BatchLoadingStrategy implements IPluginLoadingStrategy {
  readonly name = LoadingStrategyType.BATCH;
  readonly description = 'Loads plugins in fixed-size batches with dependency checking';

  private performanceMetrics = {
    totalExecutions: 0,
    totalLoadTime: 0,
    pluginsLoaded: 0,
    successfulLoads: 0,
  };

  constructor(private readonly batchSize = 5) {}

  async loadPlugins(
    loadOrder: string[],
    discoveredPlugins: Map<string, PluginDiscovery>,
    context: PluginLoaderContext
  ): Promise<DynamicModule[]> {
    const startTime = Date.now();
    this.performanceMetrics.totalExecutions++;
    const dynamicModules: DynamicModule[] = [];
    const batches = this.createFixedSizeBatches(loadOrder, this.batchSize);

    context.logger.log(
      `Loading ${loadOrder.length} plugins in ${batches.length} fixed-size batches (batch size: ${this.batchSize}) using BatchLoadingStrategy`
    );

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      context.logger.log(`Loading batch ${batchIndex + 1}/${batches.length}: [${batch.join(', ')}]`);

      // Check dependencies for each plugin in the batch
      const validPluginsInBatch = await this.filterPluginsByDependencyAvailability(batch, discoveredPlugins, context);

      if (validPluginsInBatch.length < batch.length) {
        const skippedPlugins = batch.filter((p) => !validPluginsInBatch.includes(p));
        context.logger.warn(
          `Skipping plugins with unmet dependencies in batch ${batchIndex + 1}: [${skippedPlugins.join(', ')}]`
        );

        // Mark skipped plugins as failed due to dependency issues
        skippedPlugins.forEach((pluginName) => {
          context.setLoadingState(pluginName, PluginLoadingState.FAILED);
        });
      }

      if (validPluginsInBatch.length === 0) {
        context.logger.warn(`No valid plugins to load in batch ${batchIndex + 1}, skipping`);
        continue;
      }

      // Load valid plugins in current batch in parallel
      const batchPromises = validPluginsInBatch.map((pluginName) => context.loadPluginWithErrorHandling(pluginName));
      const batchResults = await Promise.allSettled(batchPromises);

      // Process results and handle failures
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const pluginName = validPluginsInBatch[i];

        if (result.status === 'fulfilled' && result.value) {
          dynamicModules.push(result.value.module as DynamicModule);
          context.setLoadedPlugin(pluginName, result.value);
          context.setLoadingState(pluginName, PluginLoadingState.LOADED);
          context.logger.log(`✓ Successfully loaded plugin: ${pluginName}`);
        } else {
          context.setLoadingState(pluginName, PluginLoadingState.FAILED);
          const error = result.status === 'rejected' ? result.reason : 'Unknown error';
          context.logger.error(`Failed to load plugin ${pluginName}:`, error);

          // Check if any remaining plugins depend on this failed plugin
          const remainingPlugins = loadOrder.slice(batchIndex * this.batchSize + batch.length);
          const affectedPlugins = context.getPluginsDependingOn(pluginName, remainingPlugins);
          if (affectedPlugins.length > 0) {
            context.logger.warn(`Plugin ${pluginName} failure affects: [${affectedPlugins.join(', ')}]`);
            // Mark affected plugins as failed
            affectedPlugins.forEach((affected) => {
              context.setLoadingState(affected, PluginLoadingState.FAILED);
            });
          }

          // Decide whether to continue or fail fast
          if (context.isCriticalPlugin(pluginName)) {
            throw error;
          }
        }
      }

      const successCount = validPluginsInBatch.filter(
        (name) => context.getLoadingState().get(name)?.currentState === PluginLoadingState.LOADED
      ).length;

      context.logger.log(
        `Batch ${batchIndex + 1} completed: ${successCount}/${validPluginsInBatch.length} plugins loaded successfully`
      );

      // Small delay between batches to prevent overwhelming the system
      if (batchIndex < batches.length - 1) {
        await this.sleep(100); // 100ms delay
      }
    }

    const loadTime = Date.now() - startTime;
    this.performanceMetrics.totalLoadTime += loadTime;
    this.performanceMetrics.pluginsLoaded += loadOrder.length;
    this.performanceMetrics.successfulLoads += dynamicModules.length;

    context.logger.debug(
      `BatchLoadingStrategy completed in ${loadTime}ms: ${dynamicModules.length}/${loadOrder.length} plugins loaded (batch size: ${this.batchSize})`
    );

    return dynamicModules;
  }

  getPerformanceMetrics() {
    return {
      averageLoadTime:
        this.performanceMetrics.totalExecutions > 0
          ? this.performanceMetrics.totalLoadTime / this.performanceMetrics.totalExecutions
          : 0,
      totalPluginsLoaded: this.performanceMetrics.pluginsLoaded,
      concurrencyLevel: this.batchSize,
      failureRate:
        this.performanceMetrics.pluginsLoaded > 0
          ? (this.performanceMetrics.pluginsLoaded - this.performanceMetrics.successfulLoads) /
            this.performanceMetrics.pluginsLoaded
          : 0,
    };
  }

  configure(options: { batchSize?: number; delayBetweenBatches?: number }): void {
    if (options.batchSize && options.batchSize > 0) {
      // Note: Would need to make batchSize mutable to support runtime reconfiguration
      // For now, this is a placeholder for future enhancement
    }
  }

  private createFixedSizeBatches(loadOrder: string[], batchSize: number): string[][] {
    const batches: string[][] = [];

    for (let i = 0; i < loadOrder.length; i += batchSize) {
      batches.push(loadOrder.slice(i, i + batchSize));
    }

    return batches;
  }

  private async filterPluginsByDependencyAvailability(
    batch: string[],
    discoveredPlugins: Map<string, PluginDiscovery>,
    context: PluginLoaderContext
  ): Promise<string[]> {
    const validPlugins: string[] = [];
    const loadingState = context.getLoadingState();

    for (const pluginName of batch) {
      const discovery = discoveredPlugins.get(pluginName);
      if (!discovery) {
        context.logger.warn(`Plugin discovery not found: ${pluginName}`);
        continue;
      }

      // Check if all dependencies are already loaded
      const dependencyStates = discovery.dependencies.map((dep) => loadingState.get(dep));
      const allDependenciesLoaded = dependencyStates.every((state) => state?.currentState === PluginLoadingState.LOADED);
      const anyDependencyFailed = dependencyStates.some((state) => state?.currentState === PluginLoadingState.FAILED);

      if (anyDependencyFailed) {
        const failedDeps = discovery.dependencies.filter((dep) => loadingState.get(dep)?.currentState === PluginLoadingState.FAILED);
        context.logger.warn(`Plugin ${pluginName} has failed dependencies: [${failedDeps.join(', ')}]`);
        continue;
      }

      if (allDependenciesLoaded) {
        validPlugins.push(pluginName);
      } else {
        const pendingDeps = discovery.dependencies.filter((dep) => loadingState.get(dep)?.currentState !== PluginLoadingState.LOADED);
        context.logger.debug(`Plugin ${pluginName} has pending dependencies: [${pendingDeps.join(', ')}]`);
      }
    }

    return validPlugins;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
