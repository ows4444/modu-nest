import { DynamicModule } from '@nestjs/common';
import { PluginManifest, LoadedPlugin } from '@modu-nest/plugin-types';
import { PluginStateMachine } from '../state-machine';

export interface IPluginLoadingStrategy {
  /**
   * The name of the loading strategy
   */
  readonly name: string;

  /**
   * Description of the loading strategy for logging and debugging
   */
  readonly description: string;

  /**
   * Load plugins using this strategy
   * @param loadOrder - Array of plugin names in dependency order
   * @param discoveredPlugins - Map of discovered plugin information
   * @param pluginLoader - Reference to the plugin loader for access to loading methods
   * @returns Promise<DynamicModule[]> - Array of successfully loaded dynamic modules
   */
  loadPlugins(
    loadOrder: string[],
    discoveredPlugins: Map<string, PluginDiscovery>,
    pluginLoader: PluginLoaderContext
  ): Promise<DynamicModule[]>;

  /**
   * Get strategy-specific performance metrics
   * @returns Object containing performance information
   */
  getPerformanceMetrics?(): {
    averageLoadTime?: number;
    totalPluginsLoaded?: number;
    concurrencyLevel?: number;
    failureRate?: number;
  };

  /**
   * Configure strategy-specific options
   * @param options - Strategy configuration options
   */
  configure?(options: Record<string, any>): void;
}

export interface PluginDiscovery {
  name: string;
  path: string;
  manifest: PluginManifest;
  dependencies: string[];
  loadOrder: number;
}

export interface PluginLoaderContext {
  /**
   * Load a single plugin with error handling
   */
  loadPluginWithErrorHandling(pluginName: string): Promise<LoadedPlugin | null>;

  /**
   * Get plugins that depend on a given plugin
   */
  getPluginsDependingOn(failedPlugin: string, loadOrder: string[]): string[];

  /**
   * Check if a plugin is critical
   */
  isCriticalPlugin(pluginName: string): boolean;

  /**
   * Build dependency graph from plugin load order
   */
  buildDependencyGraph(loadOrder: string[]): Map<string, string[]>;

  /**
   * Calculate load batches for parallel loading
   */
  calculateLoadBatches(dependencyGraph: Map<string, string[]>): string[][];

  /**
   * Get current loading state
   */
  getLoadingState(): Map<string, PluginLoadingState>;

  /**
   * Set loading state for a plugin
   */
  setLoadingState(pluginName: string, state: PluginLoadingState): void;

  /**
   * Get plugin state machine for advanced state management
   */
  getStateMachine(): PluginStateMachine;

  /**
   * Get loaded plugins map
   */
  getLoadedPluginsMap(): Map<string, LoadedPlugin>;

  /**
   * Set loaded plugin
   */
  setLoadedPlugin(pluginName: string, plugin: LoadedPlugin): void;

  /**
   * Logger instance
   */
  readonly logger: {
    log(message: string): void;
    debug(message: string): void;
    warn(message: string): void;
    error(message: string, error?: Error): void;
  };
}

export enum PluginLoadingState {
  DISCOVERED = 'discovered',
  LOADING = 'loading',
  LOADED = 'loaded',
  FAILED = 'failed',
  UNLOADED = 'unloaded',
}

export enum LoadingStrategyType {
  PARALLEL = 'parallel',
  SEQUENTIAL = 'sequential',
  BATCH = 'batch',
}

export interface StrategyPerformanceMetrics {
  strategyName: string;
  totalExecutions: number;
  averageLoadTime: number;
  successRate: number;
  pluginsLoaded: number;
  lastExecution: Date;
}
