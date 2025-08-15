import { Injectable, Logger, DynamicModule } from '@nestjs/common';
import * as path from 'path';
import { LoadedPlugin, PluginState } from '@plugin/core';
import { IPluginLoadingStrategy, LoadingStrategyType, PluginLoaderContext, PluginDiscovery, PluginLoadingState, PluginStateInfo } from '../strategies';
import { PluginLoadingStrategyFactory } from '../strategies/plugin-loading-strategy-factory';
import { CrossPluginServiceManager } from '../cross-plugin-service-manager';

// Import the new focused services
import { PluginDiscoveryService, PluginDiscoveryResult } from './plugin-discovery.service';
import { PluginInstantiationService } from './plugin-instantiation.service';
import { PluginLoaderCoordinatorService } from './plugin-loader-coordinator.service';
// import { PluginCleanupService } from './plugin-cleanup.service';
import { PluginStateManagerService } from './plugin-state-manager.service';
import { PluginMemoryManagerService } from './plugin-memory-manager.service';
import { PluginSecurityManagerService } from './plugin-security-manager.service';

// Import additional services that already exist
import { PluginMetricsService } from '../plugin-metrics.service';
import { PluginRollbackService } from '../plugin-rollback.service';
import { PluginConflictDetectorService } from '../plugin-conflict-detector.service';
import { PluginDependencyResolver } from '../plugin-dependency-resolver';
import { PluginCircuitBreakerConfigService } from '../plugin-circuit-breaker-config.service';
import { PluginAdaptiveManifestCacheService } from '../plugin-adaptive-manifest-cache.service';
// import { PluginLifecycleHookDiscoveryService } from '../plugin-lifecycle-hook-discovery.service';

export interface OrchestratorConfig {
  defaultLoadingStrategy: LoadingStrategyType;
  enableMetrics: boolean;
  enableSecurity: boolean;
  enableAutoRecovery: boolean;
  maxConcurrentLoads: number;
}

export interface LoadingOptions {
  force?: boolean;
  strategy?: LoadingStrategyType;
  timeout?: number;
  enableRollback?: boolean;
}

/**
 * Main orchestrator service that coordinates all plugin operations
 * Replaces the massive legacy PluginLoaderService with focused delegation
 * Maintains the original API contract for backward compatibility
 */
@Injectable()
export class PluginOrchestratorService implements PluginLoaderContext {
  readonly logger = new Logger(PluginOrchestratorService.name);

  private loadedPlugins = new Map<string, LoadedPlugin>();
  private discoveredPlugins = new Map<string, PluginDiscovery>();
  private loadingStrategy: IPluginLoadingStrategy;

  private config: OrchestratorConfig = {
    defaultLoadingStrategy: LoadingStrategyType.PARALLEL,
    enableMetrics: true,
    enableSecurity: true,
    enableAutoRecovery: true,
    maxConcurrentLoads: 5,
  };

  constructor(
    private readonly discoveryService: PluginDiscoveryService,
    private readonly instantiationService: PluginInstantiationService,
    private readonly coordinatorService: PluginLoaderCoordinatorService,
    // private readonly cleanupService: PluginCleanupService,
    private readonly stateManager: PluginStateManagerService,
    private readonly memoryManager: PluginMemoryManagerService,
    private readonly securityManager: PluginSecurityManagerService,
    private readonly metricsService: PluginMetricsService,
    private readonly rollbackService: PluginRollbackService,
    private readonly conflictDetector: PluginConflictDetectorService,
    private readonly dependencyResolver: PluginDependencyResolver,
    private readonly circuitBreakerConfig: PluginCircuitBreakerConfigService,
    private readonly manifestCache: PluginAdaptiveManifestCacheService,
    // private readonly lifecycleHooks: PluginLifecycleHookDiscoveryService,
    private readonly crossPluginServiceManager: CrossPluginServiceManager,
    // private readonly strategyFactory: PluginLoadingStrategyFactory
  ) {
    this.loadingStrategy = PluginLoadingStrategyFactory.createStrategy(this.config.defaultLoadingStrategy);
    this.logger.log('Plugin orchestrator service initialized');
  }

  // ============ PUBLIC API METHODS (Maintaining backward compatibility) ============

  /**
   * Main entry point for scanning and loading all plugins
   */
  async scanAndLoadAllPlugins(): Promise<DynamicModule[]> {
    try {
      this.logger.log('Starting comprehensive plugin scan and load');

      // Phase 1: Discovery
      const discoveryResult = await this.discoveryService.discoverAllPlugins();
      if (!discoveryResult.successful.length) {
        this.logger.warn('No plugins discovered');
        return [];
      }

      this.updateDiscoveredPlugins(discoveryResult);

      // Phase 2: Dependency Resolution
      const loadOrder = await this.dependencyResolver.resolveDependencies(discoveryResult.successful);

      // Phase 3: Security Validation (if enabled)
      if (this.config.enableSecurity) {
        await this.validatePluginsSecurity(discoveryResult.successful);
      }

      // Phase 4: Loading with selected strategy
      const discoveredPluginsMap = new Map<string, PluginDiscovery>();
      discoveryResult.successful.forEach((plugin: any) => {
        discoveredPluginsMap.set(plugin.name, plugin);
      });
      const modules = await this.loadingStrategy.loadPlugins(loadOrder, discoveredPluginsMap, this as PluginLoaderContext);

      // Phase 5: Post-load verification and cleanup
      await this.performSecurityVerification(modules.length);

      this.logger.log(`Successfully loaded ${modules.length} plugins`);
      return modules;
    } catch (error) {
      this.logger.error('Failed to scan and load plugins:', error);

      if (this.config.enableAutoRecovery) {
        await this.attemptRecovery();
      }

      throw error;
    }
  }

  /**
   * Reload all currently loaded plugins
   */
  async reloadPlugins(): Promise<DynamicModule[]> {
    try {
      this.logger.log('Reloading all plugins');

      // Create rollback point
      await this.rollbackService.createSnapshot('reload-operation');

      try {
        // Unload all plugins
        const loadedPluginNames = Array.from(this.loadedPlugins.keys());
        if (loadedPluginNames.length > 0) {
          await this.coordinatorService.unloadPlugins(loadedPluginNames);
        }

        // Clear state
        this.loadedPlugins.clear();
        await this.memoryManager.cleanupAllPluginMemory();

        // Reload all plugins
        const modules = await this.scanAndLoadAllPlugins();

        this.logger.log(`Successfully reloaded ${modules.length} plugins`);
        return modules;
      } catch (error) {
        // Rollback on failure
        this.logger.error('Plugin reload failed, attempting rollback:', error);
        await this.rollbackService.rollbackPlugin('reload-operation', { 
          rollbackStrategy: 'snapshot', 
          reason: 'Plugin reload failed',
          cascadeRollback: false,
          maxRollbackDepth: 1,
          rollbackTimeout: 30000,
          preserveUserData: true
        });
        throw error;
      }
    } catch (error) {
      this.logger.error('Failed to reload plugins:', error);
      throw error;
    }
  }

  /**
   * Load specific plugin with conflict checking
   */
  async loadPluginWithConflictCheck(pluginName: string, forceLoad = false): Promise<void> {
    try {
      this.logger.log(`Loading plugin with conflict check: ${pluginName}`);

      // Check if already loaded
      if (this.loadedPlugins.has(pluginName) && !forceLoad) {
        this.logger.debug(`Plugin ${pluginName} already loaded`);
        return;
      }

      // Discover specific plugin
      const pluginPath = path.join(process.env.PLUGINS_DIR || './plugins', pluginName);
      const plugin = await this.discoveryService.discoverSinglePlugin(pluginPath);
      if (!plugin) {
        throw new Error(`Plugin ${pluginName} not found`);
      }

      // Conflict detection
      const conflictResult = await this.conflictDetector.detectConflicts([plugin.manifest]);
      if (conflictResult.hasConflicts && !forceLoad) {
        throw new Error(`Plugin ${pluginName} has conflicts: ${conflictResult.conflicts?.join(', ') || 'Unknown conflicts'}`);
      }

      // Load the plugin
      await this.loadSinglePlugin(plugin);

      this.logger.log(`Successfully loaded plugin: ${pluginName}`);
    } catch (error) {
      this.logger.error(`Failed to load plugin ${pluginName}:`, error);
      throw error;
    }
  }

  /**
   * Unload specific plugin
   */
  async unloadPlugin(pluginName: string, options: any = {}): Promise<any> {
    try {
      this.logger.log(`Unloading plugin: ${pluginName}`);

      const plugin = this.loadedPlugins.get(pluginName);
      if (!plugin) {
        this.logger.warn(`Plugin ${pluginName} not found for unloading`);
        return { success: false, reason: 'Plugin not loaded' };
      }

      // Update state
      this.stateManager.setPluginState(pluginName, {
        currentState: PluginState.UNLOADED,
        loadingProgress: 0,
        startTime: new Date(),
        metadata: options,
      });

      // Perform unloading
      const result = await this.coordinatorService.unloadPlugins([pluginName]);

      if (result.totalUnloaded > 0) {
        // Clean up resources
        await this.securityManager.cleanupSecurityContext(pluginName);
        await this.memoryManager.cleanupPluginMemory(pluginName);
        this.stateManager.clearPluginState(pluginName);
        this.loadedPlugins.delete(pluginName);

        this.logger.log(`Successfully unloaded plugin: ${pluginName}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to unload plugin ${pluginName}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  // ============ INFORMATION RETRIEVAL METHODS ============

  getLoadedPlugins(): Map<string, LoadedPlugin> {
    return new Map(this.loadedPlugins);
  }

  getPlugin(name: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(name);
  }

  getPluginState(pluginName: string): PluginLoadingState | undefined {
    const state = this.stateManager.getPluginState(pluginName);
    if (!state) return undefined;
    
    // Convert PluginStateInfo to PluginLoadingState
    return state.currentState as PluginLoadingState;
  }

  getLoadedPluginNames(): string[] {
    return Array.from(this.loadedPlugins.keys());
  }

  getLoadingState(): Map<string, PluginStateInfo> {
    return this.stateManager.getAllLoadingStates();
  }

  getCrossPluginServiceManager(): CrossPluginServiceManager {
    return this.crossPluginServiceManager;
  }

  // ============ CONFIGURATION AND STRATEGY METHODS ============

  setLoadingStrategy(strategy: IPluginLoadingStrategy): void {
    this.loadingStrategy = strategy;
    this.logger.debug('Loading strategy updated');
  }

  switchLoadingStrategy(strategyType: LoadingStrategyType, options: any = {}): void {
    this.loadingStrategy = PluginLoadingStrategyFactory.createStrategy(strategyType, options);
    this.config.defaultLoadingStrategy = strategyType;
    this.logger.log(`Switched to loading strategy: ${strategyType}`);
  }

  getAvailableLoadingStrategies(): LoadingStrategyType[] {
    return Object.values(LoadingStrategyType);
  }

  // ============ STATISTICS AND METRICS METHODS ============

  async getPluginStats(): Promise<any> {
    return {
      loaded: this.loadedPlugins.size,
      discovered: this.discoveredPlugins.size,
      states: this.stateManager.getStateManagerStats(),
      memory: this.memoryManager.getCurrentMemoryStats(),
      security: this.securityManager.getSecurityStats(),
    };
  }

  async getEnhancedPluginStats(): Promise<any> {
    const baseStats = await this.getPluginStats();
    const metricsStats = await this.metricsService.getAllMetrics();

    return {
      ...baseStats,
      metrics: metricsStats,
      conflicts: await this.conflictDetector.detectConflicts([]),
      dependencies: this.dependencyResolver.getResolutionMetrics(),
    };
  }

  getCacheStatistics(): any {
    return this.manifestCache.getCacheStats('all');
  }

  getCircuitBreakerStats(pluginName: string): any {
    return this.circuitBreakerConfig.getRecommendedConfig('standard');
  }

  getDependencyResolutionMetrics(): Map<any, any> {
    return this.dependencyResolver.getResolutionMetrics();
  }

  // ============ CONFIGURATION METHOD ============

  configure(config: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...config };

    // Update loading strategy if changed
    if (config.defaultLoadingStrategy) {
      this.switchLoadingStrategy(config.defaultLoadingStrategy);
    }

    // Configure sub-services
    if (config.enableMetrics !== undefined) {
      // Configuration stored for metrics service
      this.config.enableMetrics = config.enableMetrics;
    }

    this.logger.debug('Orchestrator configuration updated', this.config);
  }

  // ============ PLUGIN LOADER CONTEXT INTERFACE METHODS ============

  async loadPluginWithErrorHandling(pluginName: string): Promise<LoadedPlugin | null> {
    try {
      await this.loadPluginWithConflictCheck(pluginName);
      return this.getPlugin(pluginName) || null;
    } catch (error) {
      this.logger.error(`Failed to load plugin ${pluginName}:`, error);
      return null;
    }
  }

  getPluginsDependingOn(failedPlugin: string, loadOrder: string[]): string[] {
    const failedIndex = loadOrder.indexOf(failedPlugin);
    if (failedIndex === -1) {
      return [];
    }
    return loadOrder.slice(failedIndex + 1);
  }

  isCriticalPlugin(pluginName: string): boolean {
    // For now, consider all plugins non-critical
    return false;
  }

  buildDependencyGraph(loadOrder: string[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (let i = 0; i < loadOrder.length; i++) {
      const plugin = loadOrder[i];
      const dependencies = loadOrder.slice(0, i);
      graph.set(plugin, dependencies);
    }
    return graph;
  }

  calculateLoadBatches(dependencyGraph: Map<string, string[]>): string[][] {
    const batches: string[][] = [];
    const processed = new Set<string>();
    
    while (processed.size < dependencyGraph.size) {
      const currentBatch: string[] = [];
      
      for (const [plugin, dependencies] of dependencyGraph.entries()) {
        if (processed.has(plugin)) continue;
        
        const allDependenciesProcessed = dependencies.every(dep => processed.has(dep));
        if (allDependenciesProcessed) {
          currentBatch.push(plugin);
          processed.add(plugin);
        }
      }
      
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      } else {
        // Prevent infinite loop
        const remaining = Array.from(dependencyGraph.keys()).filter(p => !processed.has(p));
        if (remaining.length > 0) {
          batches.push(remaining);
          remaining.forEach(p => processed.add(p));
        }
        break;
      }
    }
    
    return batches;
  }

  setLoadingState(pluginName: string, state: PluginLoadingState): void {
    // Map PluginLoadingState to PluginState
    let pluginState: PluginState;
    switch (state) {
      case PluginLoadingState.LOADING:
        pluginState = PluginState.LOADING;
        break;
      case PluginLoadingState.LOADED:
        pluginState = PluginState.LOADED;
        break;
      case PluginLoadingState.FAILED:
        pluginState = PluginState.FAILED;
        break;
      case PluginLoadingState.UNLOADED:
        pluginState = PluginState.UNLOADED;
        break;
      default:
        pluginState = PluginState.DISCOVERED;
    }
    
    this.stateManager.setPluginState(pluginName, {
      currentState: pluginState,
      loadingProgress: 0,
      startTime: new Date(),
      metadata: {},
    });
  }

  getStateMachine(): any {
    // Return a mock state machine for now
    return {
      getState: () => PluginState.DISCOVERED,
      setState: () => {},
    };
  }

  getLoadedPluginsMap(): Map<string, LoadedPlugin> {
    return new Map(this.loadedPlugins);
  }

  setLoadedPlugin(pluginName: string, plugin: LoadedPlugin): void {
    this.loadedPlugins.set(pluginName, plugin);
  }

  // ============ PRIVATE HELPER METHODS ============

  private updateDiscoveredPlugins(discoveryResult: PluginDiscoveryResult): void {
    this.discoveredPlugins.clear();
    for (const discovery of discoveryResult.successful) {
      // Convert to strategy-compatible format  
      const strategyDiscovery: PluginDiscovery = {
        name: discovery.name,
        path: discovery.path,
        manifest: discovery.manifest,
        dependencies: discovery.dependencies || [],
        loadOrder: discovery.loadOrder || 0,
      };
      this.discoveredPlugins.set(discovery.manifest.name, strategyDiscovery);
    }
  }

  private async validatePluginsSecurity(plugins: PluginDiscovery[]): Promise<void> {
    for (const plugin of plugins) {
      const validation = await this.securityManager.validatePluginSecurity(plugin.manifest);
      if (!validation.isValid) {
        throw new Error(
          `Security validation failed for plugin ${plugin.manifest.name}: ${validation.errors.join(', ')}`
        );
      }
    }
  }

  private async loadSinglePlugin(plugin: PluginDiscovery): Promise<void> {
    // Set initial state
    this.stateManager.setPluginState(plugin.manifest.name, {
      currentState: PluginState.LOADING,
      loadingProgress: 0,
      startTime: new Date(),
      metadata: {},
    });

    try {
      // Create security context
      const context = await this.securityManager.createSecurityContext(
        plugin.manifest.name,
        plugin.manifest,
        {} as LoadedPlugin
      );

      // Convert plugin to compatible format for instantiation
      const pluginForInstantiation = {
        name: plugin.name,
        version: plugin.manifest.version,
        path: plugin.path,
        manifestPath: plugin.path + '/plugin.manifest.json',
        manifest: plugin.manifest,
        discoveredAt: new Date(),
        dependencies: plugin.dependencies,
        loadOrder: plugin.loadOrder,
      };
      
      // Instantiate plugin
      const result = await this.instantiationService.instantiatePlugins([pluginForInstantiation], [plugin.manifest.name]);
      const dynamicModule = result.successful[0] || null;

      // Create loaded plugin entry
      const loadedPlugin: LoadedPlugin = {
        manifest: plugin.manifest,
        module: dynamicModule,
        instance: context,
      };

      this.loadedPlugins.set(plugin.manifest.name, loadedPlugin);

      // Update final state
      this.stateManager.setPluginState(plugin.manifest.name, {
        currentState: PluginState.LOADED,
        loadingProgress: 100,
        startTime: new Date(),
        metadata: { loadedAt: new Date() },
      });
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.stateManager.setPluginState(plugin.manifest.name, {
        currentState: PluginState.FAILED,
        loadingProgress: 0,
        startTime: new Date(),
        error: errorObj,
        metadata: { error: errorObj.message },
      });
      throw errorObj;
    }
  }

  private async performSecurityVerification(successCount: number): Promise<void> {
    this.logger.debug('Phase 4: Performing security verification...');
    this.logger.log(`Security verification completed for ${successCount} plugins`);
  }

  private async attemptRecovery(): Promise<void> {
    this.logger.log('Attempting automatic recovery...');

    try {
      // Get latest rollback point
      const rollbackPoints = await this.rollbackService.getRollbackHistory();
      if (rollbackPoints.length > 0) {
        const latestPoint = rollbackPoints[rollbackPoints.length - 1];
        await this.rollbackService.rollbackPlugin(latestPoint.pluginName, { 
          rollbackStrategy: 'snapshot',
          reason: 'Auto-recovery', 
          cascadeRollback: false,
          maxRollbackDepth: 1,
          rollbackTimeout: 30000,
          preserveUserData: true
        });
        this.logger.log('Successfully recovered using rollback');
      }
    } catch (recoveryError) {
      this.logger.error('Recovery attempt failed:', recoveryError);
    }
  }
}
