import { Injectable, Logger, DynamicModule } from '@nestjs/common';
import { PluginDiscoveryService, PluginDiscoveryResult } from './plugin-discovery.service';
import { PluginInstantiationService, PluginInstantiationResult } from './plugin-instantiation.service';
import { PluginCleanupService, PluginCleanupResult } from './plugin-cleanup.service';
import { PluginDependencyResolver } from '../plugin-dependency-resolver';
import { PluginMetricsService } from '../plugin-metrics.service';
import { CrossPluginServiceManager } from '../cross-plugin-service-manager';
import { IPluginLoadingStrategy, PluginLoaderContext, PluginLoadingStrategyFactory } from '../strategies';
import { PluginEventEmitter } from '@plugin/services';
import { LoadedPlugin } from '@plugin/core';
import { PluginDiscovery } from './plugin-discovery.service';

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
  private readonly logger = new Logger(PluginLoaderCoordinatorService.name);

  private readonly discoveryService: PluginDiscoveryService;
  private readonly instantiationService: PluginInstantiationService;
  private readonly cleanupService: PluginCleanupService;
  private readonly dependencyResolver: PluginDependencyResolver;
  private readonly crossPluginServiceManager: CrossPluginServiceManager;
  private readonly eventEmitter: PluginEventEmitter;
  private readonly metricsService?: PluginMetricsService;

  private loadingStrategy: IPluginLoadingStrategy;
  private isLoading = false;

  constructor(metricsService?: PluginMetricsService) {
    // Initialize event emitter
    this.eventEmitter = new PluginEventEmitter();

    // Initialize dependency resolver
    this.dependencyResolver = new PluginDependencyResolver();

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
    const result = await this.loadingStrategy.loadPlugins(this, discoveredPlugins, loadOrder);

    if (result.failed.length > 0) {
      this.logger.warn('Plugin instantiation errors found:');
      result.failed.forEach((error) => {
        this.logger.warn(`- ${error.pluginName}: ${error.phase} - ${error.error.message}`);
      });
    }

    return result.successful;
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
      this.metricsService.recordDiscoveryMetrics(discoveryResult);

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
}
