import { DynamicModule } from '@nestjs/common';
import {
  IPluginLoadingStrategy,
  PluginDiscovery,
  PluginLoaderContext,
  PluginLoadingState,
  LoadingStrategyType,
} from './plugin-loading-strategy.interface';

export class SequentialLoadingStrategy implements IPluginLoadingStrategy {
  readonly name = LoadingStrategyType.SEQUENTIAL;
  readonly description = 'Loads plugins one by one in strict dependency order';

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
    const dynamicModules: DynamicModule[] = [];

    context.logger.log(`Loading ${loadOrder.length} plugins sequentially using SequentialLoadingStrategy`);

    for (let i = 0; i < loadOrder.length; i++) {
      const pluginName = loadOrder[i];
      context.logger.log(`Loading plugin ${i + 1}/${loadOrder.length}: ${pluginName}`);

      try {
        const loadedPlugin = await context.loadPluginWithErrorHandling(pluginName);

        if (loadedPlugin) {
          dynamicModules.push(loadedPlugin.module as DynamicModule);
          context.setLoadedPlugin(pluginName, loadedPlugin);
          context.setLoadingState(pluginName, PluginLoadingState.LOADED);
          context.logger.log(`✓ Successfully loaded plugin: ${pluginName}`);
        } else {
          context.setLoadingState(pluginName, PluginLoadingState.FAILED);
          context.logger.error(`Failed to load plugin: ${pluginName} (returned null)`);

          // Handle plugin failure
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
            throw new Error(`Critical plugin ${pluginName} failed to load`);
          }
        }
      } catch (error) {
        context.setLoadingState(pluginName, PluginLoadingState.FAILED);
        context.logger.error(`Failed to load plugin ${pluginName}:`, error as Error);

        // Handle plugin failure
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

    const successCount = dynamicModules.length;
    const failureCount = loadOrder.length - successCount;

    context.logger.log(
      `Sequential loading completed: ${successCount} loaded, ${failureCount} failed`
    );

    const loadTime = Date.now() - startTime;
    this.performanceMetrics.totalLoadTime += loadTime;
    this.performanceMetrics.pluginsLoaded += loadOrder.length;
    this.performanceMetrics.successfulLoads += successCount;

    context.logger.debug(
      `SequentialLoadingStrategy completed in ${loadTime}ms: ${successCount}/${loadOrder.length} plugins loaded`
    );

    return dynamicModules;
  }

  getPerformanceMetrics() {
    return {
      averageLoadTime: this.performanceMetrics.totalExecutions > 0 
        ? this.performanceMetrics.totalLoadTime / this.performanceMetrics.totalExecutions 
        : 0,
      totalPluginsLoaded: this.performanceMetrics.pluginsLoaded,
      concurrencyLevel: 1, // Always sequential (concurrency = 1)
      failureRate: this.performanceMetrics.pluginsLoaded > 0 
        ? (this.performanceMetrics.pluginsLoaded - this.performanceMetrics.successfulLoads) / this.performanceMetrics.pluginsLoaded 
        : 0,
    };
  }

  configure(options: { timeoutPerPlugin?: number }): void {
    // Could be extended to support per-plugin timeout configuration
  }
}