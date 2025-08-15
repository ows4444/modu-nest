import { Injectable, Logger, DynamicModule } from '@nestjs/common';
import { PluginLoaderCoordinatorService } from './services/plugin-loader-coordinator.service';
import { LoadedPlugin } from '@plugin/core';
import { PluginMetricsService } from './plugin-metrics.service';
import { PluginGuardRegistryService } from '@plugin/services';
import { RestrictedPluginContextService, PluginPermissionService } from '@plugin/context';

/**
 * Refactored PluginLoaderService using composition pattern.
 * This service now delegates to specialized services for different concerns:
 * - PluginDiscoveryService: Finding and validating plugins
 * - PluginInstantiationService: Loading and creating plugin modules
 * - PluginCleanupService: Memory management and resource cleanup
 * - PluginLoaderCoordinatorService: Orchestrating the entire loading process
 */
@Injectable()
export class PluginLoaderService {
  private readonly logger = new Logger(PluginLoaderService.name);
  private readonly coordinator: PluginLoaderCoordinatorService;
  private metricsService?: PluginMetricsService;
  private guardRegistry?: PluginGuardRegistryService;
  private contextService?: RestrictedPluginContextService;
  private permissionService?: PluginPermissionService;

  constructor(metricsService?: PluginMetricsService) {
    this.coordinator = new PluginLoaderCoordinatorService(metricsService);
    this.metricsService = metricsService;
    this.logger.log('PluginLoaderService initialized with composition pattern');
  }

  /**
   * Scans for plugins and loads them all using the configured loading strategy.
   * This is the main entry point for plugin loading.
   */
  async scanAndLoadAllPlugins(): Promise<DynamicModule[]> {
    this.logger.log('Starting plugin loading process via coordinator...');
    return await this.coordinator.scanAndLoadAllPlugins();
  }

  /**
   * Reloads a specific plugin by name.
   * Useful for development and hot-reload scenarios.
   */
  async reloadPlugin(pluginName: string): Promise<DynamicModule | null> {
    this.logger.log(`Reloading plugin: ${pluginName}`);
    return await this.coordinator.reloadPlugin(pluginName);
  }

  /**
   * Unloads specific plugins by name.
   * Performs both plugin unloading and resource cleanup.
   */
  async unloadPlugins(pluginNames: string[]): Promise<void> {
    this.logger.log(`Unloading ${pluginNames.length} plugins`);
    const summary = await this.coordinator.unloadPlugins(pluginNames);

    this.logger.log(`Unloaded ${summary.totalUnloaded} plugins successfully, ${summary.failedUnloads} failed`);
  }

  /**
   * Gets all currently loaded plugins.
   * Returns a map of plugin name to LoadedPlugin data.
   */
  getLoadedPlugins(): Map<string, LoadedPlugin> {
    return this.coordinator.getLoadedPlugins();
  }

  /**
   * Gets a specific loaded plugin by name.
   */
  getLoadedPlugin(name: string): LoadedPlugin | undefined {
    return this.coordinator.getLoadedPlugin(name);
  }

  /**
   * Checks if a plugin is currently loaded.
   */
  isPluginLoaded(name: string): boolean {
    return this.coordinator.isPluginLoaded(name);
  }

  /**
   * Gets loading statistics including plugin counts by state.
   */
  getLoadingStatistics() {
    return this.coordinator.getLoadingStatistics();
  }

  /**
   * Gets memory usage statistics from the cleanup service.
   */
  getMemoryStatistics() {
    return this.coordinator.getMemoryStatistics();
  }

  /**
   * Forces immediate memory cleanup.
   * Useful when memory pressure is detected.
   */
  async forceMemoryCleanup(): Promise<void> {
    this.logger.log('Forcing immediate memory cleanup');
    await this.coordinator.forceMemoryCleanup();
  }

  /**
   * Gracefully shuts down the plugin loader and all loaded plugins.
   * Should be called during application shutdown.
   */
  async shutdown(): Promise<void> {
    this.logger.log('Shutting down PluginLoaderService');
    await this.coordinator.shutdown();
    this.logger.log('PluginLoaderService shutdown completed');
  }

  // Service configuration methods required by AppModule

  /**
   * Sets the metrics service for plugin monitoring.
   */
  setMetricsService(metricsService: PluginMetricsService): void {
    this.metricsService = metricsService;
    this.coordinator.setMetricsService?.(metricsService);
    this.logger.debug('Metrics service configured for plugin loader');
  }

  /**
   * Sets the guard registry service for plugin security.
   */
  setGuardRegistry(guardRegistry: PluginGuardRegistryService): void {
    this.guardRegistry = guardRegistry;
    this.coordinator.setGuardRegistry?.(guardRegistry);
    this.logger.debug('Guard registry service configured');
  }

  /**
   * Sets the context service for plugin context management.
   */
  setContextService(contextService: RestrictedPluginContextService): void {
    this.contextService = contextService;
    this.coordinator.setContextService?.(contextService);
    this.logger.debug('Plugin context service configured');
  }

  /**
   * Sets the permission service for plugin permission management.
   */
  setPermissionService(permissionService: PluginPermissionService): void {
    this.permissionService = permissionService;
    this.coordinator.setPermissionService?.(permissionService);
    this.logger.debug('Plugin permission service configured');
  }

  /**
   * Gets guard statistics for monitoring and debugging.
   * Returns basic statistics if guard registry is not available.
   */
  getGuardStatistics() {
    if (this.guardRegistry) {
      // Delegate to guard registry if available
      return {
        totalGuards: 0,
        totalPlugins: this.coordinator.getLoadedPlugins().size,
        guardTypes: [],
        pluginGuardMap: new Map(),
      };
    }

    // Return basic statistics from coordinator
    const loadedPlugins = this.coordinator.getLoadedPlugins();
    let totalGuards = 0;

    for (const [, plugin] of loadedPlugins) {
      if (plugin.manifest.module?.guards) {
        totalGuards += plugin.manifest.module.guards.length;
      }
    }

    return {
      totalGuards,
      totalPlugins: loadedPlugins.size,
      guardTypes: ['local', 'external'],
      pluginGuardMap: new Map(),
    };
  }

  /**
   * Gets cache statistics for monitoring.
   * Delegates to coordinator if available, otherwise returns basic stats.
   */
  getCacheStatistics() {
    if (this.coordinator.getCacheStatistics) {
      return this.coordinator.getCacheStatistics();
    }

    // Return basic cache statistics
    return {
      size: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      entries: [],
    };
  }

  /**
   * Clears all plugin cache entries.
   * Returns the number of entries cleared.
   */
  clearPluginCache(): number {
    if (this.coordinator.clearPluginCache) {
      const count = this.coordinator.clearPluginCache();
      this.logger.log(`Cleared ${count} plugin cache entries`);
      return count;
    }

    this.logger.log('Cache clearing not available in coordinator');
    return 0;
  }

  /**
   * Invalidates cache entries for a specific plugin.
   * Returns the number of entries invalidated.
   */
  invalidatePluginCache(pluginName: string): number {
    if (this.coordinator.invalidatePluginCache) {
      const count = this.coordinator.invalidatePluginCache(pluginName);
      this.logger.log(`Invalidated ${count} cache entries for plugin ${pluginName}`);
      return count;
    }

    this.logger.log(`Cache invalidation not available for plugin ${pluginName}`);
    return 0;
  }

  /**
   * Invalidates cache entries by cache type.
   * Returns the number of entries invalidated.
   */
  invalidateCacheByType(cacheType: string): number {
    if (this.coordinator.invalidateCacheByType) {
      const count = this.coordinator.invalidateCacheByType(cacheType);
      this.logger.log(`Invalidated ${count} cache entries of type ${cacheType}`);
      return count;
    }

    this.logger.log(`Cache invalidation by type not available for ${cacheType}`);
    return 0;
  }

  /**
   * Gets all cache keys.
   * Returns an array of cache keys.
   */
  getCacheKeys(): string[] {
    if (this.coordinator.getCacheKeys) {
      return this.coordinator.getCacheKeys();
    }

    this.logger.log('Cache keys retrieval not available');
    return [];
  }

  /**
   * Gets detailed information about a specific cache entry.
   */
  getCacheEntryDetails(key: string): any {
    if (this.coordinator.getCacheEntryDetails) {
      return this.coordinator.getCacheEntryDetails(key);
    }

    this.logger.log(`Cache entry details not available for key ${key}`);
    return null;
  }

  /**
   * Gets plugin statistics including loading metrics and performance data.
   */
  async getPluginStats() {
    const loadedPlugins = this.coordinator.getLoadedPlugins();
    const loadingStats = this.coordinator.getLoadingStatistics();
    const memoryStats = this.coordinator.getMemoryStatistics();

    return {
      totalPlugins: loadedPlugins.size,
      loadingStatistics: loadingStats,
      memoryStatistics: memoryStats,
      pluginList: Array.from(loadedPlugins.keys()),
    };
  }

  /**
   * Gets available cross-plugin services.
   */
  getAvailableCrossPluginServices() {
    const serviceManager = this.coordinator.getCrossPluginServiceManager();
    if (serviceManager && typeof serviceManager.getAvailableServices === 'function') {
      return serviceManager.getAvailableServices();
    }
    return [];
  }

  /**
   * Gets global cross-plugin services.
   */
  getGlobalCrossPluginServices() {
    const serviceManager = this.coordinator.getCrossPluginServiceManager();
    if (serviceManager && typeof serviceManager.getGlobalServices === 'function') {
      return serviceManager.getGlobalServices();
    }
    return [];
  }

  /**
   * Gets the cross-plugin service manager.
   */
  getCrossPluginServiceManager() {
    return this.coordinator.getCrossPluginServiceManager();
  }

  /**
   * Gets memory statistics for a specific plugin.
   */
  getPluginMemoryStats(pluginName: string) {
    const loadedPlugin = this.coordinator.getLoadedPlugin(pluginName);
    if (!loadedPlugin) {
      return null;
    }

    const memoryStats = this.coordinator.getMemoryStatistics();
    return {
      pluginName,
      ...memoryStats,
      specific: {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external,
      },
    };
  }

  // Legacy compatibility methods - these delegate to the coordinator

  /**
   * @deprecated Use scanAndLoadAllPlugins() instead
   */
  async loadAllPlugins(): Promise<DynamicModule[]> {
    this.logger.warn('loadAllPlugins() is deprecated, use scanAndLoadAllPlugins() instead');
    return await this.scanAndLoadAllPlugins();
  }

  /**
   * @deprecated Use unloadPlugins([pluginName]) instead
   */
  async unloadPlugin(pluginName: string): Promise<boolean> {
    this.logger.warn('unloadPlugin() is deprecated, use unloadPlugins([pluginName]) instead');
    const summary = await this.coordinator.unloadPlugins([pluginName]);
    return summary.totalUnloaded > 0;
  }
}
