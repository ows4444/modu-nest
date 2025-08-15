import { DynamicModule } from '@nestjs/common';
import {
  IPluginLoadingStrategy,
  PluginDiscovery,
  PluginLoaderContext,
  PluginLoadingState,
  LoadingStrategyType,
} from './plugin-loading-strategy.interface';

export class ParallelLoadingStrategy implements IPluginLoadingStrategy {
  readonly name = LoadingStrategyType.PARALLEL;
  readonly description = 'Loads plugins in parallel batches respecting dependency order';

  private performanceMetrics = {
    totalExecutions: 0,
    totalLoadTime: 0,
    pluginsLoaded: 0,
    successfulLoads: 0,
  };

  async loadPlugins(
    loadOrder: string[],
    discoveredPlugins: Map<string, PluginDiscovery>,
    context: PluginLoaderContext
  ): Promise<DynamicModule[]> {
    const startTime = Date.now();
    this.performanceMetrics.totalExecutions++;
    const dependencyGraph = context.buildDependencyGraph(loadOrder);
    const batches = context.calculateLoadBatches(dependencyGraph);
    const dynamicModules: DynamicModule[] = [];

    context.logger.log(`Loading plugins in ${batches.length} parallel batches using ParallelLoadingStrategy`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      context.logger.log(`Loading batch ${batchIndex + 1}/${batches.length}: [${batch.join(', ')}]`);

      // Load plugins in current batch in parallel
      const batchPromises = batch.map((pluginName) => context.loadPluginWithErrorHandling(pluginName));
      const batchResults = await Promise.allSettled(batchPromises);

      // Process results and handle failures
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const pluginName = batch[i];

        if (result.status === 'fulfilled' && result.value) {
          dynamicModules.push(result.value.module as DynamicModule);
          context.setLoadedPlugin(pluginName, result.value);
          context.setLoadingState(pluginName, PluginLoadingState.LOADED);
          context.logger.log(`✓ Successfully loaded plugin: ${pluginName}`);
        } else {
          context.setLoadingState(pluginName, PluginLoadingState.FAILED);
          const error = result.status === 'rejected' ? result.reason : 'Unknown error';
          context.logger.error(`Failed to load plugin ${pluginName}:`, error);

          // Check if any plugins in subsequent batches depend on this failed plugin
          const affectedPlugins = context.getPluginsDependingOn(pluginName, loadOrder);
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

      const successCount = batch.filter(
        (name) => context.getLoadingState().get(name)?.currentState === PluginLoadingState.LOADED
      ).length;

      context.logger.log(
        `Batch ${batchIndex + 1} completed: ${successCount}/${batch.length} plugins loaded successfully`
      );
    }

    const loadTime = Date.now() - startTime;
    this.performanceMetrics.totalLoadTime += loadTime;
    this.performanceMetrics.pluginsLoaded += loadOrder.length;
    this.performanceMetrics.successfulLoads += dynamicModules.length;

    context.logger.debug(
      `ParallelLoadingStrategy completed in ${loadTime}ms: ${dynamicModules.length}/${loadOrder.length} plugins loaded`
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
      concurrencyLevel: -1, // Dynamic based on dependency batches
      failureRate:
        this.performanceMetrics.pluginsLoaded > 0
          ? (this.performanceMetrics.pluginsLoaded - this.performanceMetrics.successfulLoads) /
            this.performanceMetrics.pluginsLoaded
          : 0,
    };
  }

  configure(options: { maxConcurrency?: number }): void {
    // Could be extended to support max concurrency limits
    // Note: context is not available here, would need to be stored during loadPlugins call
  }
}
