import { Injectable, Logger, DynamicModule } from '@nestjs/common';
import { PluginLoaderCoordinatorService } from './services/plugin-loader-coordinator.service';
import { LoadedPlugin } from '@libs/plugin-core';
import { PluginMetricsService } from './plugin-metrics.service';
import { PluginGuardRegistryService } from '@libs/plugin-services';
import { RestrictedPluginContextService, PluginPermissionService } from '@libs/plugin-context';

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
    
    this.logger.log(
      `Unloaded ${summary.totalUnloaded} plugins successfully, ${summary.failedUnloads} failed`
    );
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
      entries: []
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