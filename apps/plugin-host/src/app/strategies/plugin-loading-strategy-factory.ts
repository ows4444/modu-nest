import { IPluginLoadingStrategy, LoadingStrategyType } from './plugin-loading-strategy.interface';
import { ParallelLoadingStrategy } from './parallel-loading-strategy';
import { SequentialLoadingStrategy } from './sequential-loading-strategy';
import { BatchLoadingStrategy } from './batch-loading-strategy';

export class PluginLoadingStrategyFactory {
  private static readonly strategies = new Map<LoadingStrategyType, () => IPluginLoadingStrategy>([
    [LoadingStrategyType.PARALLEL, () => new ParallelLoadingStrategy()],
    [LoadingStrategyType.SEQUENTIAL, () => new SequentialLoadingStrategy()],
    [LoadingStrategyType.BATCH, () => new BatchLoadingStrategy()],
  ]);

  private static performanceHistory = new Map<LoadingStrategyType, number[]>();

  static createStrategy(strategyType: LoadingStrategyType, options?: { batchSize?: number }): IPluginLoadingStrategy {
    const strategyFactory = this.strategies.get(strategyType);

    if (!strategyFactory) {
      throw new Error(`Unknown loading strategy: ${strategyType}`);
    }

    if (strategyType === LoadingStrategyType.BATCH && options?.batchSize) {
      return new BatchLoadingStrategy(options.batchSize);
    }

    return strategyFactory();
  }

  static getAvailableStrategies(): LoadingStrategyType[] {
    return Array.from(this.strategies.keys());
  }

  static getDefaultStrategy(): LoadingStrategyType {
    return LoadingStrategyType.PARALLEL;
  }

  static getStrategyFromEnvironment(): LoadingStrategyType {
    const envStrategy = process.env.PLUGIN_LOADING_STRATEGY as LoadingStrategyType;

    if (envStrategy && this.strategies.has(envStrategy)) {
      return envStrategy;
    }

    return this.getDefaultStrategy();
  }

  /**
   * Get strategy descriptions for debugging and monitoring
   */
  static getStrategyDescriptions(): Map<LoadingStrategyType, string> {
    const descriptions = new Map<LoadingStrategyType, string>();

    for (const strategyType of this.strategies.keys()) {
      const strategy = this.createStrategy(strategyType);
      descriptions.set(strategyType, strategy.description);
    }

    return descriptions;
  }

  /**
   * Get performance metrics for all strategies
   */
  static getPerformanceMetrics(): Map<LoadingStrategyType, any> {
    const metrics = new Map<LoadingStrategyType, any>();

    for (const strategyType of this.strategies.keys()) {
      const strategy = this.createStrategy(strategyType);
      if (strategy.getPerformanceMetrics) {
        metrics.set(strategyType, strategy.getPerformanceMetrics());
      }
    }

    return metrics;
  }

  /**
   * Record performance data for strategy selection optimization
   */
  static recordPerformance(strategyType: LoadingStrategyType, loadTimeMs: number): void {
    if (!this.performanceHistory.has(strategyType)) {
      this.performanceHistory.set(strategyType, []);
    }

    const history = this.performanceHistory.get(strategyType)!;
    history.push(loadTimeMs);

    // Keep only last 100 measurements
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Get recommended strategy based on historical performance and plugin count
   */
  static getRecommendedStrategy(pluginCount: number): LoadingStrategyType {
    // Simple heuristics for strategy recommendation
    if (pluginCount <= 5) {
      return LoadingStrategyType.SEQUENTIAL; // Low overhead for small plugin sets
    } else if (pluginCount <= 20) {
      return LoadingStrategyType.BATCH; // Good balance for medium plugin sets
    } else {
      return LoadingStrategyType.PARALLEL; // Maximum concurrency for large plugin sets
    }
  }
}
