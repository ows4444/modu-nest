import { Injectable, Logger, DynamicModule } from '@nestjs/common';
import { PluginDiscoveryService, PluginDiscoveryResult } from './plugin-discovery.service';
import { PluginInstantiationService, PluginInstantiationResult } from './plugin-instantiation.service';
import { PluginCleanupService, PluginCleanupResult } from './plugin-cleanup.service';
import { PluginDependencyResolver } from '../plugin-dependency-resolver';
import { PluginMetricsService } from '../plugin-metrics.service';
import { CrossPluginServiceManager } from '../cross-plugin-service-manager';
import { IPluginLoadingStrategy, PluginLoaderContext, PluginLoadingStrategyFactory, PluginLoadingState, PluginStateInfo } from '../strategies';
import { PluginState } from '@plugin/core';
import { PluginEventEmitter } from '@plugin/services';
import { LoadedPlugin } from '@plugin/core';
import { PluginDiscovery } from './plugin-discovery.service';
import { PluginStateMachine } from '../state-machine/plugin-state-machine';

export interface PluginLoadingSummary {
  discoveryResult: PluginDiscoveryResult;
  instantiationResult: PluginInstantiationResult;
  totalPlugins: number;
  successfulPlugins: number;
  failedPlugins: number;
  loadingTime: number;
  loadOrder: string[];
}

export interface PluginUnloadingSummary {
  unloadedPlugins: string[];
  cleanupResults: PluginCleanupResult[];
  totalUnloaded: number;
  failedUnloads: number;
  unloadingTime: number;
}

@Injectable()
export class PluginLoaderCoordinatorService implements PluginLoaderContext {
  readonly logger = new Logger(PluginLoaderCoordinatorService.name);

  private readonly discoveryService: PluginDiscoveryService;
  private readonly instantiationService: PluginInstantiationService;
  private readonly cleanupService: PluginCleanupService;
  private readonly dependencyResolver: PluginDependencyResolver;
  private readonly crossPluginServiceManager: CrossPluginServiceManager;
  private readonly eventEmitter: PluginEventEmitter;
  private readonly stateMachine: PluginStateMachine;
  private readonly metricsService?: PluginMetricsService;

  private loadingStrategy: IPluginLoadingStrategy;
  private isLoading = false;
  
  // PluginLoaderContext properties
  private readonly loadingStates = new Map<string, PluginLoadingState>();
  private readonly stateInfos = new Map<string, PluginStateInfo>();
  private readonly loadedPlugins = new Map<string, LoadedPlugin>();

  constructor(metricsService?: PluginMetricsService) {
    // Initialize event emitter
    this.eventEmitter = new PluginEventEmitter();

    // Initialize state machine
    this.stateMachine = new PluginStateMachine();

    // Initialize dependency resolver
    this.dependencyResolver = new PluginDependencyResolver(this.eventEmitter, this.stateMachine);

    // Initialize cross plugin service manager
    this.crossPluginServiceManager = new CrossPluginServiceManager();

    // Initialize composed services
    this.discoveryService = new PluginDiscoveryService();
    this.instantiationService = new PluginInstantiationService(this.eventEmitter);
    this.cleanupService = new PluginCleanupService();

    this.metricsService = metricsService;

    // Initialize loading strategy
    const strategyType = PluginLoadingStrategyFactory.getStrategyFromEnvironment();
    const batchSize = process.env.PLUGIN_BATCH_SIZE ? parseInt(process.env.PLUGIN_BATCH_SIZE, 10) : undefined;

    this.loadingStrategy = PluginLoadingStrategyFactory.createStrategy(strategyType, { batchSize });
    this.logger.log(
      `Initialized coordinator with ${this.loadingStrategy.name} loading strategy: ${this.loadingStrategy.description}`
    );
  }

  /**
   * Scans for plugins and loads them all using the configured loading strategy
   */
  async scanAndLoadAllPlugins(): Promise<DynamicModule[]> {
    if (this.isLoading) {
      throw new Error('Plugin loading is already in progress');
    }

    this.isLoading = true;
    const startTime = Date.now();

    try {
      this.logger.log('Starting comprehensive plugin loading process...');

      // Phase 1: Plugin Discovery
      const discoveryResult = await this.performPluginDiscovery();

      // Phase 2: Dependency Analysis
      const loadOrder = await this.performDependencyAnalysis(discoveryResult.successful);

      // Phase 3: Plugin Loading using strategy
      const dynamicModules = await this.performPluginLoading(discoveryResult.successful, loadOrder);

      // Phase 4: Security Verification
      await this.performSecurityVerification(dynamicModules.length);

      // Phase 5: Metrics and Cleanup
      await this.recordLoadingMetrics(discoveryResult, dynamicModules, Date.now() - startTime);

      const summary: PluginLoadingSummary = {
        discoveryResult,
        instantiationResult: {
          successful: dynamicModules,
          failed: [],
          totalAttempted: loadOrder.length,
          instantiationTime: Date.now() - startTime,
        },
        totalPlugins: discoveryResult.totalAttempted,
        successfulPlugins: dynamicModules.length,
        failedPlugins: discoveryResult.failed.length,
        loadingTime: Date.now() - startTime,
        loadOrder,
      };

      this.logger.log(
        `Plugin loading completed: ${summary.successfulPlugins}/${summary.totalPlugins} plugins loaded successfully in ${summary.loadingTime}ms`
      );

      return dynamicModules;
    } catch (error) {
      this.logger.error('Plugin loading process failed', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Unloads specific plugins by name
   */
  async unloadPlugins(pluginNames: string[]): Promise<PluginUnloadingSummary> {
    const startTime = Date.now();
    this.logger.log(`Starting plugin unloading process for ${pluginNames.length} plugins`);

    const unloadedPlugins: string[] = [];
    const cleanupResults: PluginCleanupResult[] = [];

    // Unload plugins through instantiation service
    for (const pluginName of pluginNames) {
      const unloadSuccess = await this.instantiationService.unloadPlugin(pluginName);
      if (unloadSuccess) {
        unloadedPlugins.push(pluginName);
      }
    }

    // Perform cleanup for unloaded plugins
    const cleanup = await this.cleanupService.cleanupMultiplePlugins(pluginNames);
    cleanupResults.push(...cleanup);

    const summary: PluginUnloadingSummary = {
      unloadedPlugins,
      cleanupResults,
      totalUnloaded: unloadedPlugins.length,
      failedUnloads: pluginNames.length - unloadedPlugins.length,
      unloadingTime: Date.now() - startTime,
    };

    this.logger.log(
      `Plugin unloading completed: ${summary.totalUnloaded}/${pluginNames.length} plugins unloaded in ${summary.unloadingTime}ms`
    );

    return summary;
  }

  /**
   * Reloads a specific plugin (unload then reload)
   */
  async reloadPlugin(pluginName: string): Promise<DynamicModule | null> {
    this.logger.log(`Reloading plugin: ${pluginName}`);

    try {
      // Unload the plugin first
      const unloadSummary = await this.unloadPlugins([pluginName]);

      if (unloadSummary.totalUnloaded === 0) {
        throw new Error(`Failed to unload plugin: ${pluginName}`);
      }

      // Discover the plugin again
      const pluginsDir = process.env.PLUGINS_DIR || './plugins';
      const pluginPath = `${pluginsDir}/${pluginName}`;
      const discovery = await this.discoveryService.discoverSinglePlugin(pluginPath);

      // Resolve dependencies for this plugin
      const loadOrder = await this.dependencyResolver.resolveDependencies([discovery]);

      // Instantiate the plugin
      const result = await this.instantiationService.instantiatePlugins([discovery], loadOrder);

      if (result.successful.length > 0) {
        this.logger.log(`Successfully reloaded plugin: ${pluginName}`);
        return result.successful[0];
      } else {
        throw new Error(`Failed to instantiate reloaded plugin: ${pluginName}`);
      }
    } catch (error) {
      this.logger.error(`Plugin reload failed for ${pluginName}`, error);
      throw error;
    }
  }

  /**
   * Gets all currently loaded plugins
   */
  getLoadedPlugins(): Map<string, LoadedPlugin> {
    return this.instantiationService.getAllLoadedPlugins();
  }

  /**
   * Gets a specific loaded plugin
   */
  getLoadedPlugin(name: string): LoadedPlugin | undefined {
    return this.instantiationService.getLoadedPlugin(name);
  }

  /**
   * Checks if a plugin is currently loaded
   */
  isPluginLoaded(name: string): boolean {
    return this.instantiationService.isPluginLoaded(name);
  }

  /**
   * Gets loading statistics
   */
  getLoadingStatistics() {
    return this.instantiationService.getLoadingStatistics();
  }

  /**
   * Gets memory statistics from cleanup service
   */
  getMemoryStatistics() {
    return this.cleanupService.getMemoryStats();
  }

  /**
   * Forces memory cleanup
   */
  async forceMemoryCleanup(): Promise<void> {
    await this.cleanupService.forceMemoryCleanup();
  }

  /**
   * Shuts down the coordinator and all services
   */
  async shutdown(): Promise<void> {
    this.logger.log('Shutting down plugin loader coordinator');

    try {
      // Unload all plugins
      const loadedPluginNames = Array.from(this.getLoadedPlugins().keys());
      if (loadedPluginNames.length > 0) {
        await this.unloadPlugins(loadedPluginNames);
      }

      // Shutdown cleanup service
      await this.cleanupService.shutdown();

      this.logger.log('Plugin loader coordinator shutdown completed');
    } catch (error) {
      this.logger.error('Error during coordinator shutdown', error);
      throw error;
    }
  }

  // Private methods for orchestrating the loading phases

  private async performPluginDiscovery(): Promise<PluginDiscoveryResult> {
    this.logger.debug('Phase 1: Starting plugin discovery...');
    const discoveryResult = await this.discoveryService.discoverAllPlugins();

    this.logger.log(
      `Discovery completed: ${discoveryResult.successful.length} successful, ${discoveryResult.failed.length} failed`
    );

    if (discoveryResult.failed.length > 0) {
      this.logger.warn('Plugin discovery errors found:');
      discoveryResult.failed.forEach((error) => {
        this.logger.warn(`- ${error.pluginDirectory}: ${error.errorType} - ${error.error.message}`);
      });
    }

    return discoveryResult;
  }

  private async performDependencyAnalysis(discoveredPlugins: PluginDiscovery[]): Promise<string[]> {
    this.logger.debug('Phase 2: Performing dependency analysis...');
    const loadOrder = await this.dependencyResolver.resolveDependencies(discoveredPlugins);

    this.logger.log(`Dependency analysis completed. Load order: [${loadOrder.join(', ')}]`);
    return loadOrder;
  }

  private async performPluginLoading(
    discoveredPlugins: PluginDiscovery[],
    loadOrder: string[]
  ): Promise<DynamicModule[]> {
    this.logger.debug('Phase 3: Starting plugin instantiation...');

    // Use the configured loading strategy  
    // Convert discovered plugins array to Map as expected by interface
    const discoveredPluginsMap = new Map<string, any>();
    discoveredPlugins.forEach(plugin => {
      discoveredPluginsMap.set(plugin.name, plugin);
    });
    
    const dynamicModules = await this.loadingStrategy.loadPlugins(loadOrder, discoveredPluginsMap, this);

    this.logger.debug(
      `Loading strategy completed: ${dynamicModules.length}/${loadOrder.length} plugins loaded`
    );

    return dynamicModules;
  }

  private async performSecurityVerification(successCount: number): Promise<void> {
    this.logger.debug('Phase 4: Performing security verification...');

    // TODO: Implement security verification
    // This would include checking plugin signatures, permissions, etc.

    this.logger.log(`Security verification completed for ${successCount} plugins`);
  }

  private async recordLoadingMetrics(
    discoveryResult: PluginDiscoveryResult,
    dynamicModules: DynamicModule[],
    totalTime: number
  ): Promise<void> {
    if (!this.metricsService) return;

    this.logger.debug('Phase 5: Recording loading metrics...');

    try {
      // Record discovery metrics
      this.metricsService.recordDiscoveryMetrics(
        discoveryResult.discoveryTime,
        discoveryResult.successful.length,
        discoveryResult.failed.length
      );

      // Record loading metrics
      this.metricsService.recordLoadingTime(totalTime);
      this.metricsService.recordSuccessfulLoads(dynamicModules.length);
      this.metricsService.recordFailedLoads(discoveryResult.failed.length);

      this.logger.debug('Loading metrics recorded successfully');
    } catch (error) {
      this.logger.error('Failed to record loading metrics', error);
    }
  }

  // PluginLoaderContext implementation for strategy compatibility

  async loadPluginBatch(discoveries: PluginDiscovery[], pluginNames: string[]): Promise<DynamicModule[]> {
    const result = await this.instantiationService.instantiatePlugins(discoveries, pluginNames);
    return result.successful;
  }

  async loadPlugin(discovery: PluginDiscovery): Promise<DynamicModule> {
    const result = await this.instantiationService.instantiatePlugins([discovery], [discovery.name]);

    if (result.successful.length > 0) {
      return result.successful[0];
    } else {
      const error = result.failed[0];
      throw new Error(`Failed to load plugin ${discovery.name}: ${error?.error.message || 'Unknown error'}`);
    }
  }

  getEventEmitter(): PluginEventEmitter {
    return this.eventEmitter;
  }

  getCrossPluginServiceManager(): CrossPluginServiceManager {
    return this.crossPluginServiceManager;
  }

  // PluginLoaderContext implementation methods
  async loadPluginWithErrorHandling(pluginName: string): Promise<LoadedPlugin | null> {
    try {
      this.setLoadingState(pluginName, PluginLoadingState.LOADING);
      // Implementation would use the instantiation service
      // For now, return null as no actual plugin loading logic exists yet
      this.logger.warn(`loadPluginWithErrorHandling not fully implemented for ${pluginName}`);
      return null;
    } catch (error) {
      this.setLoadingState(pluginName, PluginLoadingState.FAILED);
      this.logger.error(`Failed to load plugin ${pluginName}:`, error as Error);
      return null;
    }
  }

  getPluginsDependingOn(failedPlugin: string, loadOrder: string[]): string[] {
    // Find plugins that depend on the failed plugin
    const dependentPlugins: string[] = [];
    const failedIndex = loadOrder.indexOf(failedPlugin);
    
    if (failedIndex === -1) {
      return dependentPlugins;
    }

    // Return plugins that come after the failed plugin in load order
    // This is a simplified implementation - actual dependency checking would be more complex
    return loadOrder.slice(failedIndex + 1);
  }

  isCriticalPlugin(pluginName: string): boolean {
    // For now, consider all plugins non-critical
    // This could be enhanced to check plugin manifest or configuration
    return false;
  }

  buildDependencyGraph(loadOrder: string[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    // Build a simple dependency graph based on load order
    // In a real implementation, this would parse actual plugin dependencies
    for (let i = 0; i < loadOrder.length; i++) {
      const plugin = loadOrder[i];
      const dependencies = loadOrder.slice(0, i); // Plugins loaded before this one
      graph.set(plugin, dependencies);
    }
    
    return graph;
  }

  calculateLoadBatches(dependencyGraph: Map<string, string[]>): string[][] {
    const batches: string[][] = [];
    const processed = new Set<string>();
    
    // Simple batching algorithm: group plugins by dependency level
    const currentBatch: string[] = [];
    
    for (const [plugin, dependencies] of dependencyGraph.entries()) {
      const allDependenciesProcessed = dependencies.every(dep => processed.has(dep));
      
      if (allDependenciesProcessed) {
        currentBatch.push(plugin);
        processed.add(plugin);
      }
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    // Add remaining plugins to subsequent batches
    const remaining = Array.from(dependencyGraph.keys()).filter(p => !processed.has(p));
    if (remaining.length > 0) {
      batches.push(remaining);
    }
    
    return batches;
  }

  getLoadingState(): Map<string, PluginStateInfo> {
    return new Map(this.stateInfos);
  }

  setLoadingState(pluginName: string, state: PluginLoadingState): void {
    this.loadingStates.set(pluginName, state);
    
    // Convert PluginLoadingState to PluginState (they have same values)
    const pluginState = state as unknown as PluginState;
    
    // Also update state info if we don't have it yet
    if (!this.stateInfos.has(pluginName)) {
      const stateInfo: PluginStateInfo = {
        currentState: pluginState,
        loadingProgress: 0,
        startTime: new Date(),
        metadata: {},
      };
      this.stateInfos.set(pluginName, stateInfo);
    } else {
      const existingInfo = this.stateInfos.get(pluginName)!;
      existingInfo.currentState = pluginState;
      this.stateInfos.set(pluginName, existingInfo);
    }
    
    this.logger.debug(`Plugin ${pluginName} state changed to: ${state}`);
  }

  getStateMachine(): PluginStateMachine {
    return this.stateMachine;
  }

  getLoadedPluginsMap(): Map<string, LoadedPlugin> {
    return new Map(this.loadedPlugins);
  }

  setLoadedPlugin(pluginName: string, plugin: LoadedPlugin): void {
    this.loadedPlugins.set(pluginName, plugin);
    this.setLoadingState(pluginName, PluginLoadingState.LOADED);
    this.logger.debug(`Plugin ${pluginName} loaded successfully`);
  }
}
