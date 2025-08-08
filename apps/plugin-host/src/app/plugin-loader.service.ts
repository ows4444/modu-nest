import { Injectable, Logger, DynamicModule, Module, Type, Provider } from '@nestjs/common';
import 'reflect-metadata';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import {
  PluginManifest,
  LoadedPlugin,
  PluginGuardManager,
  GuardEntry,
  PluginGuardRegistryService,
  LocalGuardEntry,
  ExternalGuardEntry,
  PluginLifecycleHook,
  PluginCircuitBreaker,
  PluginCircuitOpenError,
  CircuitBreakerState,
  PluginCacheService,
  PluginCacheKeyBuilder,
  PluginEventEmitter,
  IPluginEventSubscriber,
} from '@modu-nest/plugin-types';
import { CrossPluginServiceManager } from './cross-plugin-service-manager';
import { PluginMetricsService } from './plugin-metrics.service';
import { PluginDependencyResolver } from './plugin-dependency-resolver';
import { PluginCircuitBreakerConfigService } from './plugin-circuit-breaker-config.service';
import { PluginAdaptiveManifestCacheService } from './plugin-adaptive-manifest-cache.service';
import { PluginLifecycleHookDiscoveryService } from './plugin-lifecycle-hook-discovery.service';
import {
  IPluginLoadingStrategy,
  PluginLoaderContext,
  PluginDiscovery,
  PluginLoadingState,
  LoadingStrategyType,
  PluginLoadingStrategyFactory,
} from './strategies';
import { PluginStateMachine, PluginState, PluginTransition } from './state-machine';

@Injectable()
export class PluginLoaderService implements PluginLoaderContext, IPluginEventSubscriber {
  readonly logger = new Logger(PluginLoaderService.name);
  private loadedPlugins = new Map<string, LoadedPlugin>();
  private guardManager = new PluginGuardManager();
  private guardRegistry?: PluginGuardRegistryService;
  private stateMachine = new PluginStateMachine();
  private discoveredPlugins = new Map<string, PluginDiscovery>();
  private crossPluginServiceManager = new CrossPluginServiceManager();
  private circuitBreaker = new PluginCircuitBreaker();
  private metricsService?: PluginMetricsService;
  private cacheService = new PluginCacheService();
  private loadingStrategy: IPluginLoadingStrategy;
  private eventEmitter: PluginEventEmitter;
  private dependencyResolver: PluginDependencyResolver;
  private circuitBreakerConfigService: PluginCircuitBreakerConfigService;
  private adaptiveManifestCache: PluginAdaptiveManifestCacheService;
  private lifecycleHookDiscovery: PluginLifecycleHookDiscoveryService;
  private loadingState = new Map<string, PluginLoadingState>();

  // Memory management for plugin cleanup
  private readonly pluginWeakRefs = new Map<string, WeakRef<Record<string, unknown>>>();
  private readonly pluginTimers = new Map<string, NodeJS.Timeout[]>();
  private readonly pluginEventListeners = new Map<
    string,
    Array<{ target: EventTarget | NodeJS.EventEmitter; event: string; listener: Function }>
  >();
  private readonly pluginInstances = new Map<string, Set<object>>();

  // Plugin failure tracking
  private readonly pluginFailureCounts = new Map<string, number>();

  // FinalizationRegistry to track garbage collection
  private readonly cleanupRegistry = new FinalizationRegistry((pluginName: string) => {
    this.logger.debug(`Plugin instance garbage collected: ${pluginName}`);
    this.pluginWeakRefs.delete(pluginName);
  });

  constructor() {
    // Initialize event emitter
    this.eventEmitter = new PluginEventEmitter();

    // Initialize circuit breaker config service
    this.circuitBreakerConfigService = new PluginCircuitBreakerConfigService();

    // Initialize adaptive manifest cache service
    this.adaptiveManifestCache = new PluginAdaptiveManifestCacheService(this.cacheService);

    // Initialize lifecycle hook discovery service
    this.lifecycleHookDiscovery = new PluginLifecycleHookDiscoveryService();

    // Initialize loading strategy from environment or use default
    const strategyType = PluginLoadingStrategyFactory.getStrategyFromEnvironment();
    const batchSize = process.env.PLUGIN_BATCH_SIZE ? parseInt(process.env.PLUGIN_BATCH_SIZE, 10) : undefined;

    this.loadingStrategy = PluginLoadingStrategyFactory.createStrategy(strategyType, { batchSize });
    this.logger.log(
      `Initialized with ${this.loadingStrategy.name} loading strategy: ${this.loadingStrategy.description}`
    );

    // Subscribe to events
    this.subscribeToEvents(this.eventEmitter);

    // Connect state machine to event emitter
    this.stateMachine.addStateChangeListener((event) => {
      this.eventEmitter.emitPluginStateChanged(event.pluginName, event.fromState, event.toState, event.transition);
    });

    // Initialize dependency resolver
    this.dependencyResolver = new PluginDependencyResolver(this.eventEmitter, this.stateMachine);
  }

  getLoadedPlugins(): Map<string, LoadedPlugin> {
    return this.loadedPlugins;
  }

  // PluginLoaderContext interface methods
  getLoadingState(): Map<string, PluginLoadingState> {
    // Convert new state machine states back to old enum for compatibility
    const compatibilityMap = new Map<string, PluginLoadingState>();
    const states = this.stateMachine.getAllStates();

    for (const [pluginName, state] of states) {
      if (state) {
        compatibilityMap.set(pluginName, state as unknown as PluginLoadingState);
      }
    }

    return compatibilityMap;
  }

  setLoadingState(pluginName: string, state: PluginLoadingState): void {
    // Convert old enum to new state machine transitions
    const currentState = this.stateMachine.getCurrentState(pluginName);

    if (!currentState && state === PluginLoadingState.DISCOVERED) {
      this.stateMachine.transition(pluginName, PluginTransition.REDISCOVER);
    } else if (currentState === PluginState.DISCOVERED && state === PluginLoadingState.LOADING) {
      this.stateMachine.transition(pluginName, PluginTransition.START_LOADING);
    } else if (currentState === PluginState.LOADING && state === PluginLoadingState.LOADED) {
      this.stateMachine.transition(pluginName, PluginTransition.COMPLETE_LOADING);
    } else if (currentState === PluginState.LOADING && state === PluginLoadingState.FAILED) {
      this.stateMachine.transition(pluginName, PluginTransition.FAIL_LOADING);
    } else if (state === PluginLoadingState.UNLOADED) {
      this.stateMachine.transition(pluginName, PluginTransition.UNLOAD);
    } else {
      this.logger.warn(`Cannot transition plugin ${pluginName} from ${currentState} to ${state}`);
    }
  }

  getStateMachine(): PluginStateMachine {
    return this.stateMachine;
  }

  getLoadedPluginsMap(): Map<string, LoadedPlugin> {
    return this.loadedPlugins;
  }

  setLoadedPlugin(pluginName: string, plugin: LoadedPlugin): void {
    this.loadedPlugins.set(pluginName, plugin);
  }

  setLoadingStrategy(strategy: IPluginLoadingStrategy): void {
    this.loadingStrategy = strategy;
    this.logger.log(`Switched to ${strategy.name} loading strategy`);
  }

  getLoadingStrategyName(): string {
    return this.loadingStrategy.name;
  }

  getAvailableLoadingStrategies(): LoadingStrategyType[] {
    return PluginLoadingStrategyFactory.getAvailableStrategies();
  }

  // Event subscription methods
  subscribeToEvents(eventEmitter: PluginEventEmitter): void {
    // Subscribe to dependency resolution events for timeout handling
    eventEmitter.on('plugin.dependency.resolved', (event) => {
      const depEvent = event as any;
      this.logger.debug(
        `Dependency resolved: ${event.pluginName} -> ${depEvent.dependency} (${depEvent.resolutionTimeMs}ms)`
      );
    });

    eventEmitter.on('plugin.dependency.failed', (event) => {
      const depEvent = event as any;
      this.logger.error(
        `Dependency failed: ${event.pluginName} -> ${depEvent.dependency}: ${depEvent.error.message}${
          depEvent.timeout ? ' (timeout)' : ''
        }`
      );
    });

    // Subscribe to performance events for monitoring
    eventEmitter.on('plugin.performance', (event) => {
      const perfEvent = event as any;
      if (perfEvent.exceeded) {
        this.logger.warn(
          `Performance threshold exceeded for ${event.pluginName}: ${perfEvent.metric} = ${perfEvent.value}${perfEvent.unit} (threshold: ${perfEvent.threshold})`
        );
      }
    });

    // Subscribe to circuit breaker events
    eventEmitter.on('plugin.circuit-breaker', (event) => {
      const cbEvent = event as any;
      this.logger.warn(`Circuit breaker ${cbEvent.state} for ${event.pluginName}: ${cbEvent.reason}`);
    });

    // Subscribe to error events for centralized error handling
    eventEmitter.on('plugin.error', (event) => {
      const errorEvent = event as any;
      if (errorEvent.severity === 'critical' || errorEvent.severity === 'high') {
        this.logger.error(
          `${errorEvent.severity.toUpperCase()} plugin error in ${event.pluginName} (${errorEvent.category}): ${
            errorEvent.error.message
          }`,
          errorEvent.error.stack
        );
      } else {
        this.logger.warn(
          `Plugin ${errorEvent.severity} error in ${event.pluginName} (${errorEvent.category}): ${errorEvent.error.message}`
        );
      }
    });
  }

  unsubscribeFromEvents(eventEmitter: PluginEventEmitter): void {
    eventEmitter.removeAllListeners('plugin.dependency.resolved');
    eventEmitter.removeAllListeners('plugin.dependency.failed');
    eventEmitter.removeAllListeners('plugin.performance');
    eventEmitter.removeAllListeners('plugin.circuit-breaker');
    eventEmitter.removeAllListeners('plugin.error');
  }

  getEventEmitter(): PluginEventEmitter {
    return this.eventEmitter;
  }

  switchLoadingStrategy(strategyType: LoadingStrategyType, options?: { batchSize?: number }): void {
    const oldStrategy = this.loadingStrategy.name;
    this.loadingStrategy = PluginLoadingStrategyFactory.createStrategy(strategyType, options);
    this.logger.log(
      `Switched from ${oldStrategy} to ${this.loadingStrategy.name} loading strategy: ${this.loadingStrategy.description}`
    );
  }

  /**
   * Automatically select optimal loading strategy based on plugin count and dependencies
   */
  optimizeLoadingStrategy(): void {
    const pluginCount = this.discoveredPlugins.size;
    const recommendedStrategy = PluginLoadingStrategyFactory.getRecommendedStrategy(pluginCount);

    if (this.loadingStrategy.name !== recommendedStrategy) {
      this.logger.log(
        `Auto-optimizing loading strategy for ${pluginCount} plugins: ${this.loadingStrategy.name} → ${recommendedStrategy}`
      );
      this.switchLoadingStrategy(recommendedStrategy);
    } else {
      this.logger.debug(`Current loading strategy ${this.loadingStrategy.name} is optimal for ${pluginCount} plugins`);
    }
  }

  setMetricsService(metricsService: PluginMetricsService): void {
    this.metricsService = metricsService;
    this.logger.debug('Metrics service configured for plugin loader');
  }

  async scanAndLoadAllPlugins(): Promise<DynamicModule[]> {
    const startTime = Date.now();

    try {
      this.logger.log('Starting plugin discovery and loading...');

      const discoveryResult = await this.performPluginDiscovery();
      const loadOrder = await this.performDependencyAnalysis(discoveryResult.plugins);
      await this.optimizeLoadingStrategy();
      const modules = await this.performPluginLoading(loadOrder);

      this.logLoadingResults(startTime, discoveryResult, modules, loadOrder);
      await this.performSecurityVerification(modules.length);

      return modules;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to load plugins after ${totalTime}ms:`, error);
      return [];
    }
  }

  private async performPluginDiscovery(): Promise<{ plugins: PluginDiscovery[]; discoveryTime: number }> {
    const discoveryStartTime = Date.now();
    const discoveredPlugins = await this.discoverPlugins();
    const discoveryTime = Date.now() - discoveryStartTime;

    this.logger.log(`Discovered ${discoveredPlugins.length} plugins in ${discoveryTime}ms`);

    return { plugins: discoveredPlugins, discoveryTime };
  }

  private async performDependencyAnalysis(discoveredPlugins: PluginDiscovery[]): Promise<string[]> {
    const dependencyAnalysisStartTime = Date.now();
    const loadOrder = this.calculateLoadOrder(discoveredPlugins);
    const dependencyAnalysisTime = Date.now() - dependencyAnalysisStartTime;

    this.logger.log(`Plugin load order calculated in ${dependencyAnalysisTime}ms: [${loadOrder.join(', ')}]`);

    return loadOrder;
  }

  private async performPluginLoading(loadOrder: string[]): Promise<DynamicModule[]> {
    return await this.loadPluginsInOrder(loadOrder);
  }

  private logLoadingResults(
    startTime: number,
    discoveryResult: { plugins: PluginDiscovery[]; discoveryTime: number },
    modules: DynamicModule[],
    loadOrder: string[]
  ): void {
    const totalTime = Date.now() - startTime;
    const successCount = modules.length;
    const failureCount = loadOrder.length - successCount;

    this.logger.log(
      `Plugin loading completed in ${totalTime}ms: ` +
        `${successCount} loaded, ${failureCount} failed ` +
        `(discovery: ${discoveryResult.discoveryTime}ms, loading: ${totalTime - discoveryResult.discoveryTime}ms)`
    );
  }

  private async performSecurityVerification(successCount: number): Promise<void> {
    if (successCount > 0) {
      const isolationCheck = await this.verifyGuardIsolation();
      if (!isolationCheck.isSecure) {
        this.logger.error('Plugin loading completed with guard security violations - review plugin configurations');
      }
    }
  }

  private async discoverPlugins(): Promise<PluginDiscovery[]> {
    const pluginsPath = process.env.PLUGINS_DIR || path.resolve(__dirname, 'assets', 'plugins');

    try {
      await fs.promises.access(pluginsPath);
    } catch {
      this.logger.warn(`Plugins directory not found: ${pluginsPath}`);
      return [];
    }

    const pluginDirs = await fs.promises.readdir(pluginsPath, { withFileTypes: true });
    const directories = pluginDirs.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);

    // Process plugins in parallel using Promise.allSettled
    const discoveryPromises = directories.map((pluginDir) => this.discoverSinglePlugin(pluginsPath, pluginDir));

    const results = await Promise.allSettled(discoveryPromises);
    const discoveries: PluginDiscovery[] = [];

    for (let i = 0; i < results.length; i++) {
      const discoveryResult = results[i];
      const pluginDirectoryName = directories[i];

      if (discoveryResult.status === 'fulfilled' && discoveryResult.value) {
        const pluginDiscovery = discoveryResult.value;
        discoveries.push(pluginDiscovery);
        this.discoveredPlugins.set(pluginDiscovery.name, pluginDiscovery);
        this.stateMachine.transition(pluginDiscovery.name, PluginTransition.REDISCOVER);

        // Emit plugin discovered event
        this.eventEmitter.emitPluginDiscovered(pluginDiscovery.name, pluginDiscovery.path, pluginDiscovery.manifest);

        this.logger.debug(
          `Discovered plugin: ${pluginDiscovery.name} (dependencies: [${pluginDiscovery.dependencies.join(', ')}])`
        );
      } else {
        this.logger.error(
          `Failed to discover plugin ${pluginDirectoryName}:`,
          discoveryResult.status === 'rejected' ? discoveryResult.reason : 'Unknown error'
        );
      }
    }

    return discoveries;
  }

  /**
   * Discovers a single plugin directory and loads its manifest
   * @param pluginsPath - Base plugins directory path
   * @param pluginDir - Individual plugin directory name
   * @returns Promise<PluginDiscovery | null> - Plugin discovery or null if failed
   */
  private async discoverSinglePlugin(pluginsPath: string, pluginDir: string): Promise<PluginDiscovery | null> {
    const pluginPath = path.join(pluginsPath, pluginDir);
    const manifest = await this.loadManifest(pluginPath);

    const pluginDiscoveryInfo: PluginDiscovery = {
      name: manifest.name,
      path: pluginPath,
      manifest,
      dependencies: manifest.dependencies || [],
      loadOrder: manifest.loadOrder || 0,
    };

    return pluginDiscoveryInfo;
  }

  private calculateLoadOrder(discoveries: PluginDiscovery[]): string[] {
    // Topological sort with load order priority
    const dependencyGraph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Build dependency graph
    for (const plugin of discoveries) {
      dependencyGraph.set(plugin.name, plugin.dependencies);
      inDegree.set(plugin.name, 0);
    }

    // Calculate in-degrees
    for (const plugin of discoveries) {
      for (const dep of plugin.dependencies) {
        if (inDegree.has(dep)) {
          // Plugin depends on dep, so plugin has an incoming edge (increment plugin's in-degree)
          inDegree.set(plugin.name, (inDegree.get(plugin.name) || 0) + 1);
        } else {
          this.logger.warn(`Plugin '${plugin.name}' depends on unknown plugin '${dep}'`);
        }
      }
    }

    // Topological sort with priority queue (load order)
    const loadOrderQueue = new PriorityQueue<PluginDiscovery>((a, b) => a.loadOrder - b.loadOrder);
    const orderedPluginNames: string[] = [];

    // Add nodes with no dependencies
    for (const pluginDiscovery of discoveries) {
      if ((inDegree.get(pluginDiscovery.name) || 0) === 0) {
        loadOrderQueue.enqueue(pluginDiscovery);
      }
    }

    while (!loadOrderQueue.isEmpty()) {
      const currentPlugin = loadOrderQueue.dequeue()!;
      orderedPluginNames.push(currentPlugin.name);

      // Update in-degrees of dependent plugins
      for (const pluginDiscovery of discoveries) {
        if (pluginDiscovery.dependencies.includes(currentPlugin.name)) {
          const updatedInDegree = (inDegree.get(pluginDiscovery.name) || 0) - 1;
          inDegree.set(pluginDiscovery.name, updatedInDegree);

          if (updatedInDegree === 0) {
            loadOrderQueue.enqueue(pluginDiscovery);
          }
        }
      }
    }

    // Check for circular dependencies
    if (orderedPluginNames.length !== discoveries.length) {
      const pluginsWithCircularDeps = discoveries.filter((p) => !orderedPluginNames.includes(p.name));
      throw new Error(`Circular dependencies detected: ${pluginsWithCircularDeps.map((p) => p.name).join(', ')}`);
    }

    return orderedPluginNames;
  }

  private async loadManifest(pluginPath: string): Promise<PluginManifest> {
    const manifestPath = path.join(pluginPath, 'plugin.manifest.json');

    // Check adaptive cache first
    const cachedManifest = this.adaptiveManifestCache.getCachedManifest(manifestPath, {
      pluginPath,
    });

    if (cachedManifest) {
      this.logger.debug(`Using cached manifest: ${manifestPath}`);
      return cachedManifest;
    }

    // Load from filesystem
    try {
      await fs.promises.access(manifestPath);
    } catch {
      throw new Error(`Plugin manifest not found: ${manifestPath}`);
    }

    const manifestContent = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent) as PluginManifest;

    // Basic validation
    if (!manifest.name || !manifest.version || !manifest.module) {
      throw new Error(`Invalid plugin manifest: ${manifestPath}`);
    }

    // Get file stats for cache context
    const fileStats = await fs.promises.stat(manifestPath);

    // Cache using adaptive TTL based on plugin characteristics
    this.adaptiveManifestCache.cacheManifest(manifest, {
      pluginPath: manifestPath,
      manifest,
      trustLevel: manifest.security?.trustLevel,
      lastModified: fileStats.mtime,
    });

    this.logger.debug(`Loaded and cached manifest: ${manifestPath}`);
    return manifest;
  }

  private async loadPluginsInOrder(loadOrder: string[]): Promise<DynamicModule[]> {
    const startTime = Date.now();

    try {
      const modules = await this.loadingStrategy.loadPlugins(loadOrder, this.discoveredPlugins, this);
      const loadTime = Date.now() - startTime;

      // Record performance for strategy optimization
      PluginLoadingStrategyFactory.recordPerformance(this.loadingStrategy.name as LoadingStrategyType, loadTime);

      return modules;
    } catch (error) {
      const loadTime = Date.now() - startTime;
      this.logger.error(
        `Plugin loading strategy ${this.loadingStrategy.name} failed after ${loadTime}ms:`,
        error as Error
      );
      throw error;
    }
  }

  /**
   * Build dependency graph from plugin load order
   */
  buildDependencyGraph(loadOrder: string[]): Map<string, string[]> {
    const dependencyGraph = new Map<string, string[]>();

    for (const pluginName of loadOrder) {
      const discovery = this.discoveredPlugins.get(pluginName);
      if (discovery) {
        // Only include dependencies that are in the load order (discovered plugins)
        const validDependencies = discovery.dependencies.filter((dep) => loadOrder.includes(dep));
        dependencyGraph.set(pluginName, validDependencies);
      } else {
        dependencyGraph.set(pluginName, []);
      }
    }

    return dependencyGraph;
  }

  /**
   * Calculate load batches for parallel loading
   * Plugins in the same batch can be loaded in parallel as they don't depend on each other
   */
  calculateLoadBatches(dependencyGraph: Map<string, string[]>): string[][] {
    const batches: string[][] = [];
    const remaining = new Set(dependencyGraph.keys());
    const completed = new Set<string>();

    while (remaining.size > 0) {
      const currentBatch: string[] = [];

      // Find plugins with no unresolved dependencies
      for (const pluginName of remaining) {
        const dependencies = dependencyGraph.get(pluginName) || [];
        const unresolvedDeps = dependencies.filter((dep) => !completed.has(dep));

        if (unresolvedDeps.length === 0) {
          currentBatch.push(pluginName);
        }
      }

      // If no plugins can be loaded, we have a circular dependency
      if (currentBatch.length === 0) {
        const remainingPlugins = Array.from(remaining);
        throw new Error(`Circular dependencies detected among plugins: [${remainingPlugins.join(', ')}]`);
      }

      // Remove current batch from remaining and add to completed
      currentBatch.forEach((pluginName) => {
        remaining.delete(pluginName);
        completed.add(pluginName);
      });

      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Load a single plugin with comprehensive error handling and circuit breaker protection
   */
  async loadPluginWithErrorHandling(pluginName: string): Promise<LoadedPlugin | null> {
    try {
      this.logger.debug(`Loading plugin: ${pluginName}`);
      this.stateMachine.transition(pluginName, PluginTransition.START_LOADING);

      // Configure circuit breaker for this plugin using dedicated config service
      const discovery = this.discoveredPlugins.get(pluginName);
      if (discovery) {
        this.circuitBreakerConfigService.configureCircuitBreaker(this.circuitBreaker, {
          pluginName,
          manifest: discovery.manifest,
          trustLevel: discovery.manifest.security?.trustLevel,
          previousFailures: this.getPluginFailureCount(pluginName),
        });
      }

      // Execute plugin loading with circuit breaker protection
      const plugin = await this.circuitBreaker.execute(pluginName, async () => {
        return await this.loadSinglePlugin(pluginName);
      });

      return plugin;
    } catch (error) {
      if (error instanceof PluginCircuitOpenError) {
        this.logger.warn(`Plugin loading blocked by circuit breaker for ${pluginName}: ${error.message}`);
        this.stateMachine.transition(pluginName, PluginTransition.FAIL_LOADING);
        // Don't rethrow circuit breaker errors - they indicate the plugin should be skipped
        return null;
      }

      this.logger.error(`Plugin loading failed for ${pluginName}:`, error);
      throw error;
    }
  }

  /**
   * Get all plugins that depend on a given plugin
   */
  getPluginsDependingOn(failedPlugin: string, loadOrder: string[]): string[] {
    const dependents: string[] = [];

    for (const pluginName of loadOrder) {
      const discovery = this.discoveredPlugins.get(pluginName);
      if (discovery && discovery.dependencies.includes(failedPlugin)) {
        dependents.push(pluginName);
        // Recursively find plugins that depend on this dependent
        dependents.push(...this.getPluginsDependingOn(pluginName, loadOrder));
      }
    }

    return [...new Set(dependents)]; // Remove duplicates
  }

  private async loadSinglePlugin(pluginName: string): Promise<LoadedPlugin | null> {
    const loadStartTime = Date.now();

    const pluginDiscoveryInfo = this.validatePluginDiscovery(pluginName);
    if (!pluginDiscoveryInfo) {
      return null;
    }

    this.emitLoadingStartEvents(pluginName, pluginDiscoveryInfo);

    try {
      await this.resolveDependencies(pluginName, pluginDiscoveryInfo.dependencies);
      const pluginModule = await this.loadAndValidatePlugin(pluginName, pluginDiscoveryInfo);
      const loadedPlugin = await this.instantiatePlugin(pluginName, pluginDiscoveryInfo, pluginModule);

      this.finalizePluginLoad(pluginName, loadedPlugin, loadStartTime);

      // Reset failure count on successful load
      this.resetPluginFailureCount(pluginName);

      return loadedPlugin;
    } catch (error) {
      await this.handlePluginLoadError(pluginName, error as Error, loadStartTime);
      throw error;
    }
  }

  private validatePluginDiscovery(pluginName: string): PluginDiscovery | null {
    const pluginDiscoveryInfo = this.discoveredPlugins.get(pluginName);
    if (!pluginDiscoveryInfo) {
      this.logger.error(`Plugin discovery not found: ${pluginName}`);
      this.metricsService?.recordPluginLoadError(pluginName, new Error('Plugin discovery not found'));

      this.eventEmitter.emitPluginLoadFailed(pluginName, new Error('Plugin discovery not found'), 'discovery');

      return null;
    }
    return pluginDiscoveryInfo;
  }

  private emitLoadingStartEvents(pluginName: string, pluginDiscoveryInfo: PluginDiscovery): void {
    this.eventEmitter.emitPluginLoadingStarted(pluginName, this.loadingStrategy.name, pluginDiscoveryInfo.dependencies);

    this.metricsService?.recordPluginLoadStart(pluginName);
  }

  private async resolveDependencies(pluginName: string, dependencies: string[]): Promise<void> {
    this.eventEmitter.emitPluginLoadingProgress(pluginName, 'dependency-resolution', 10);
    await this.dependencyResolver.waitForDependencies(pluginName, dependencies);
  }

  private async loadAndValidatePlugin(
    pluginName: string,
    pluginDiscoveryInfo: PluginDiscovery
  ): Promise<Record<string, unknown>> {
    this.eventEmitter.emitPluginLoadingProgress(pluginName, 'validation', 30);
    return await this.importPluginModule(pluginDiscoveryInfo.path);
  }

  private async instantiatePlugin(
    pluginName: string,
    pluginDiscoveryInfo: PluginDiscovery,
    pluginModule: Record<string, unknown>
  ): Promise<LoadedPlugin> {
    this.eventEmitter.emitPluginLoadingProgress(pluginName, 'instantiation', 50);

    const loadedPlugin: LoadedPlugin = {
      manifest: pluginDiscoveryInfo.manifest,
      module: null as DynamicModule | null,
      instance: pluginModule,
    };

    await this.executeLifecycleHook(loadedPlugin, 'beforeLoad');
    await this.processPluginGuards(pluginName, pluginDiscoveryInfo.manifest, pluginModule);

    this.eventEmitter.emitPluginLoadingProgress(pluginName, 'initialization', 80);

    const dynamicModule = await this.createDynamicModuleFromPlugin(pluginDiscoveryInfo.manifest, pluginModule);
    if (!dynamicModule) {
      throw new Error(`Failed to create dynamic module for plugin: ${pluginName}`);
    }

    loadedPlugin.module = dynamicModule;
    await this.executeLifecycleHook(loadedPlugin, 'afterLoad');

    this.registerPluginForMemoryTracking(pluginDiscoveryInfo.manifest.name, pluginModule, loadedPlugin);

    return loadedPlugin;
  }

  private finalizePluginLoad(pluginName: string, loadedPlugin: LoadedPlugin, loadStartTime: number): void {
    const loadTime = Date.now() - loadStartTime;

    this.metricsService?.recordPluginLoad(loadedPlugin.manifest.name, loadTime, loadedPlugin.manifest.version);

    this.eventEmitter.emitPluginLoaded(pluginName, loadedPlugin, loadTime, process.memoryUsage().heapUsed);

    this.eventEmitter.emitPluginPerformance(pluginName, 'load-time', loadTime, 'ms', 10000);
  }

  private async handlePluginLoadError(pluginName: string, error: Error, loadStartTime: number): Promise<void> {
    // Increment failure count for circuit breaker configuration
    this.incrementPluginFailureCount(pluginName);

    this.metricsService?.recordPluginLoadError(pluginName, error);

    this.eventEmitter.emitPluginLoadFailed(pluginName, error, 'loading');
    this.eventEmitter.emitPluginError(pluginName, error, 'high', 'loading', true);

    // Note: executeLifecycleHook requires loadedPlugin which may not exist in error case
    // Only execute if we have a partial plugin object
  }

  private async processPluginGuards(
    pluginName: string,
    manifest: PluginManifest,
    pluginModule: Record<string, unknown>
  ): Promise<void> {
    if (!manifest.module.guards || manifest.module.guards.length === 0) {
      return;
    }

    this.logger.debug(`Processing ${manifest.module.guards.length} guards for plugin: ${pluginName}`);

    // Store guards in manager
    await this.guardManager.storePluginGuards(pluginName, manifest.module.guards, pluginModule);

    // Note: Guard registration with the registry will happen later after
    // the module is initialized and the guard registry is available

    // Validate all guards can be resolved
    const guardNames = manifest.module.guards.map((g) => g.name);
    const resolutionResult = await this.guardManager.resolveGuardsForPlugin(pluginName, guardNames);

    if (resolutionResult.missingDependencies.length > 0) {
      throw new Error(
        `Plugin '${pluginName}' has unresolvable guard dependencies: ${resolutionResult.missingDependencies.join(', ')}`
      );
    }

    if (resolutionResult.circularDependencies.length > 0) {
      throw new Error(
        `Plugin '${pluginName}' has circular guard dependencies: ${resolutionResult.circularDependencies.join(', ')}`
      );
    }

    this.logger.debug(`✓ All guards validated for plugin: ${pluginName}`);
  }

  private async importPluginModule(pluginPath: string): Promise<Record<string, unknown>> {
    const mainPath = path.join(pluginPath, 'dist', 'index.js');

    if (!fs.existsSync(mainPath)) {
      throw new Error(`Plugin main file not found: ${mainPath}`);
    }

    try {
      // Create a require function that webpack won't transform
      const dynamicRequire = createRequire(__filename);

      // Clear require cache to ensure fresh import with safe approach
      await this.clearModuleCache(mainPath, dynamicRequire);

      const pluginModule = dynamicRequire(mainPath);
      return pluginModule;
    } catch (error) {
      throw new Error(`Failed to import plugin module: ${error}`);
    }
  }

  /**
   * Safely clear module cache for plugin reloading
   * Implements proper error handling and path validation
   */
  private async clearModuleCache(mainPath: string, dynamicRequire: NodeRequire): Promise<void> {
    try {
      const resolvedPath = dynamicRequire.resolve(mainPath);
      if (dynamicRequire.cache[resolvedPath]) {
        delete dynamicRequire.cache[resolvedPath];
        this.logger.debug(`Cleared module cache for: ${resolvedPath}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to clear module cache for ${mainPath}:`, error);
      // Continue execution - not critical failure
    }
  }

  isCriticalPlugin(pluginName: string): boolean {
    const discovery = this.discoveredPlugins.get(pluginName);
    return discovery?.manifest.critical === true;
  }

  private async createDynamicModuleFromPlugin(
    manifest: PluginManifest,
    pluginModule: Record<string, unknown>
  ): Promise<DynamicModule | null> {
    try {
      this.logger.debug(`Creating dynamic module for plugin: ${manifest.name}`);
      // Validate manifest module structure
      if (!manifest.module || typeof manifest.module !== 'object') {
        this.logger.error(`Invalid manifest module structure for plugin '${manifest.name}'`);
        return null;
      }

      // Helper function to resolve component references from manifest
      const resolveComponents = (componentRefs: string[] | string | undefined): Type<any>[] => {
        if (!componentRefs) return [];

        const refs = Array.isArray(componentRefs) ? componentRefs : [componentRefs];
        const components: Type<any>[] = [];

        for (const ref of refs) {
          if (typeof ref !== 'string' || !ref.trim()) {
            this.logger.warn(`Invalid component reference in manifest for plugin '${manifest.name}': ${ref}`);
            continue;
          }

          const component = pluginModule[ref];
          if (!component) {
            this.logger.warn(`Component '${ref}' not found in plugin exports for '${manifest.name}'`);
            continue;
          }

          if (typeof component !== 'function') {
            this.logger.warn(`Component '${ref}' is not a valid class/function for plugin '${manifest.name}'`);
            continue;
          }

          components.push(component as Type<any>);
          this.logger.debug(`Resolved component '${ref}' for plugin '${manifest.name}'`);
        }

        return components;
      };

      // Resolve plugin components from manifest
      const controllers = resolveComponents(manifest.module.controllers);
      const resolvedProviders = resolveComponents(manifest.module.providers);
      const moduleExports = resolveComponents(manifest.module.exports);
      const resolvedImports = resolveComponents(manifest.module.imports);
      const imports = resolvedImports.map((imp) => imp as any); // Cast for module compatibility

      // Create providers array that can handle both Type<any> and Provider
      const providers: Provider[] = [...resolvedProviders];

      // Resolve and inject only the guards specified in the manifest
      const guardProviders = await this.resolveAndCreateGuardProviders(manifest.name, manifest.module.guards || []);

      // Add guard providers to the providers array (cast as Provider)
      providers.push(...guardProviders.map((guard) => guard as Provider));

      // Add cross-plugin service providers for dependency injection
      const crossPluginProviders = await this.crossPluginServiceManager.createCrossPluginProviders(
        manifest.name,
        manifest,
        pluginModule
      );
      providers.push(...crossPluginProviders);

      // Make exported services globally available
      if (manifest.module.exports) {
        const globalProviders = await this.crossPluginServiceManager.createGlobalServiceProviders(
          manifest.name,
          manifest.module.exports,
          pluginModule
        );
        providers.push(...globalProviders);
      }

      // Add plugin name metadata to all controllers for guard isolation
      this.addPluginMetadataToControllers(controllers, manifest.name);

      // Generate module class name from plugin name
      const moduleClassName = `${
        manifest.name.charAt(0).toUpperCase() +
        manifest.name.slice(1).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      }Module`;

      // Create a dynamic module class at runtime using decorator
      const DynamicPluginModule = class {};

      // Set meaningful name for debugging
      Object.defineProperty(DynamicPluginModule, 'name', {
        value: moduleClassName,
        configurable: true,
      });

      // Apply @Module decorator at runtime
      const moduleDecorator = Module({
        controllers,
        providers,
        exports: moduleExports,
        imports,
      });

      // Apply the decorator to the class
      moduleDecorator(DynamicPluginModule);

      // Determine if this module should be global based on exported services
      const isGlobal = this.shouldBeGlobalModule(manifest);

      // Return the dynamic module configuration
      const dynamicModule: DynamicModule = {
        module: DynamicPluginModule,
        global: isGlobal,
      };

      this.logger.log(
        `✓ Dynamic module created for '${manifest.name}' (${isGlobal ? 'global' : 'local'}): ` +
          `${controllers.length} controllers, ${providers.length} providers, ` +
          `${moduleExports.length} exports, ${imports.length} imports`
      );

      return dynamicModule;
    } catch (error) {
      this.logger.error(`Failed to create dynamic module for ${manifest.name}:`, error);
      return null;
    }
  }

  /**
   * Resolve and create guard providers for a plugin's dynamic module
   * Only injects guards that are explicitly listed in the plugin manifest
   */
  private async resolveAndCreateGuardProviders(pluginName: string, guardEntries: GuardEntry[]): Promise<Function[]> {
    if (!guardEntries || guardEntries.length === 0) {
      return [];
    }

    this.logger.debug(`Resolving guard providers for plugin: ${pluginName}`);

    // Extract guard names from entries
    const requestedGuards = guardEntries.map((entry) => entry.name);

    // Resolve guards through the centralized manager
    const resolutionResult = await this.guardManager.resolveGuardsForPlugin(pluginName, requestedGuards);

    // Log any issues
    if (resolutionResult.missingDependencies.length > 0) {
      this.logger.warn(
        `Plugin '${pluginName}' has missing guard dependencies: [${resolutionResult.missingDependencies.join(', ')}]`
      );
    }

    if (resolutionResult.circularDependencies.length > 0) {
      this.logger.error(
        `Plugin '${pluginName}' has circular guard dependencies: [${resolutionResult.circularDependencies.join(', ')}]`
      );
    }

    // Create providers only for successfully resolved guards
    const guardProviders = resolutionResult.guards
      .filter((guard) => guard.guardClass) // Only local guards with actual classes
      .map((guard) => {
        this.logger.debug(`Creating provider for guard '${guard.entry.name}' in plugin '${pluginName}'`);
        return guard.guardClass;
      });

    this.logger.debug(
      `Created ${guardProviders.length} guard providers for plugin '${pluginName}' ` +
        `out of ${requestedGuards.length} requested guards`
    );

    return guardProviders;
  }

  /**
   * Determine if a plugin module should be global based on its exports
   * Global modules make their exports available to all other modules without explicit imports
   */
  private shouldBeGlobalModule(manifest: PluginManifest): boolean {
    // Make modules global if they export commonly used services
    const pluginName = manifest.name;
    const exports = manifest.module.exports || [];

    // User plugin should be global as it provides authentication services
    if (pluginName === 'user-plugin' && exports.includes('UserPluginService')) {
      this.logger.debug(`Making ${pluginName} global module due to UserPluginService export`);
      return true;
    }

    // Add other plugins that should be global here
    // For example, if you have a logging service, email service, etc.

    return false;
  }

  /**
   * Reloads all plugins from the plugins directory
   * Useful for hot-reloading plugins in development
   */
  async reloadPlugins(): Promise<DynamicModule[]> {
    this.logger.log('Reloading all plugins...');

    // Clear guards and services for all plugins when reloading
    const pluginNames = Array.from(this.loadedPlugins.keys());
    for (const pluginName of pluginNames) {
      await this.guardManager.removePluginGuards(pluginName);
      await this.crossPluginServiceManager.removePluginServices(pluginName);
    }

    this.loadedPlugins.clear();
    this.loadingState.clear();
    this.discoveredPlugins.clear();

    // Clean up old cache tracking data on reload
    this.cleanupManifestCacheTracking();

    return this.scanAndLoadAllPlugins();
  }

  /**
   * Gets a specific loaded plugin by name
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(name);
  }

  /**
   * Gets plugin statistics including guard information
   */
  async getPluginStats() {
    const plugins = Array.from(this.loadedPlugins.values());
    const guardStats = this.guardManager.getStatistics();
    const serviceStats = await this.crossPluginServiceManager.getStatistics();

    // Calculate loading state distribution
    const stateDistribution = this.getLoadingStateDistribution();

    // Calculate memory statistics
    const memoryStats = this.getOverallMemoryStats();

    return {
      totalLoaded: plugins.length,
      totalDiscovered: this.discoveredPlugins.size,
      pluginNames: Array.from(this.loadedPlugins.keys()),
      loadingStates: stateDistribution,
      loadingStrategy: {
        current: {
          name: this.loadingStrategy.name,
          description: this.loadingStrategy.description,
          metrics: this.loadingStrategy.getPerformanceMetrics?.() || null,
        },
        available: this.getAvailableLoadingStrategies(),
        descriptions: Object.fromEntries(PluginLoadingStrategyFactory.getStrategyDescriptions()),
        performanceHistory: Object.fromEntries(PluginLoadingStrategyFactory.getPerformanceMetrics()),
        recommended: PluginLoadingStrategyFactory.getRecommendedStrategy(this.discoveredPlugins.size),
      },
      byVersion: plugins.reduce((acc, plugin) => {
        const version = plugin.manifest.version || 'unknown';
        acc[version] = (acc[version] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byAuthor: plugins.reduce((acc, plugin) => {
        const author = plugin.manifest.author || 'unknown';
        acc[author] = (acc[author] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      guards: guardStats,
      crossPluginServices: serviceStats,
      memoryManagement: memoryStats,
    };
  }

  /**
   * Get loading state distribution for monitoring
   */
  private getLoadingStateDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const state of this.loadingState.values()) {
      distribution[state] = (distribution[state] || 0) + 1;
    }

    return distribution;
  }

  /**
   * Get parallel loading performance metrics
   */
  getParallelLoadingStats(): {
    canLoadInParallel: number;
    dependencyChains: Array<{ chain: string[]; length: number }>;
    potentialBatches: string[][];
  } {
    const discoveries = Array.from(this.discoveredPlugins.values());
    const loadOrder = this.calculateLoadOrder(discoveries);
    const dependencyGraph = this.buildDependencyGraph(loadOrder);

    try {
      const batches = this.calculateLoadBatches(dependencyGraph);

      // Calculate plugins that can load in parallel (batch size > 1)
      const parallelPluginCount = batches
        .filter((batch) => batch.length > 1)
        .reduce((sum, batch) => sum + batch.length, 0);

      // Find longest dependency chains
      const dependencyChains = this.calculateDependencyChains(dependencyGraph);

      return {
        canLoadInParallel: parallelPluginCount,
        dependencyChains: dependencyChains.sort((a, b) => b.length - a.length).slice(0, 5), // Top 5 longest chains
        potentialBatches: batches,
      };
    } catch (error) {
      return {
        canLoadInParallel: 0,
        dependencyChains: [],
        potentialBatches: [],
      };
    }
  }

  /**
   * Calculate dependency chains for performance analysis
   */
  private calculateDependencyChains(
    dependencyGraph: Map<string, string[]>
  ): Array<{ chain: string[]; length: number }> {
    const chains: Array<{ chain: string[]; length: number }> = [];
    const visited = new Set<string>();

    const findChain = (plugin: string, currentChain: string[]): string[] => {
      if (visited.has(plugin)) {
        return currentChain;
      }

      visited.add(plugin);
      const dependencies = dependencyGraph.get(plugin) || [];

      if (dependencies.length === 0) {
        return [...currentChain, plugin];
      }

      let longestChain = [...currentChain, plugin];

      for (const dep of dependencies) {
        const depChain = findChain(dep, [...currentChain, plugin]);
        if (depChain.length > longestChain.length) {
          longestChain = depChain;
        }
      }

      return longestChain;
    };

    for (const plugin of dependencyGraph.keys()) {
      if (!visited.has(plugin)) {
        const chain = findChain(plugin, []);
        chains.push({
          chain,
          length: chain.length,
        });
      }
    }

    return chains;
  }

  /**
   * Gets detailed guard information for debugging and monitoring
   */
  getGuardStatistics() {
    return this.guardManager.getStatistics();
  }

  /**
   * Gets guards for a specific plugin (for debugging)
   */
  getPluginGuards(pluginName: string): unknown[] {
    return this.guardManager.getPluginGuards(pluginName);
  }

  /**
   * Get plugin loading state (for monitoring)
   */
  getPluginState(pluginName: string): PluginLoadingState | undefined {
    const state = this.stateMachine.getCurrentState(pluginName);
    return state ? (state as unknown as PluginLoadingState) : undefined; // Safe cast with null check
  }

  /**
   * Get all loaded plugin names
   */
  getLoadedPluginNames(): string[] {
    return Array.from(this.loadedPlugins.keys());
  }

  /**
   * Get cross-plugin service manager (for debugging and monitoring)
   */
  getCrossPluginServiceManager(): CrossPluginServiceManager {
    return this.crossPluginServiceManager;
  }

  /**
   * Get available cross-plugin services
   */
  getAvailableCrossPluginServices(): string[] {
    return this.crossPluginServiceManager.getAvailableServices();
  }

  /**
   * Get global cross-plugin services
   */
  getGlobalCrossPluginServices(): string[] {
    return this.crossPluginServiceManager.getGlobalServices();
  }

  /**
   * Get dependency resolution metrics for monitoring and debugging
   */
  getDependencyResolutionMetrics(): Map<
    string,
    {
      resolveTime: number;
      dependencyCount: number;
      timestamp: Date;
    }
  > {
    return this.dependencyResolver.getResolutionMetrics();
  }

  /**
   * Get pending dependency waiters (for debugging)
   */
  getPendingDependencyWaiters(): Map<
    string,
    {
      pluginName: string;
      dependencies: string[];
      resolve: () => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
      startTime: number;
    }
  > {
    return this.dependencyResolver.getPendingWaiters();
  }

  /**
   * Execute a lifecycle hook for a plugin with timeout protection
   * @param plugin - The loaded plugin object
   * @param hook - The lifecycle hook to execute
   * @param args - Additional arguments to pass to the hook handlers
   */
  private async executeLifecycleHook(
    plugin: LoadedPlugin,
    hook: PluginLifecycleHook,
    ...args: unknown[]
  ): Promise<void> {
    const hooks = this.getPluginLifecycleHooks(plugin);
    const handlers = hooks.get(hook) || [];

    if (handlers.length === 0) {
      this.logger.debug(`No '${hook}' lifecycle hooks found for plugin: ${plugin.manifest.name}`);
      return;
    }

    this.logger.debug(`Executing ${handlers.length} '${hook}' lifecycle hook(s) for plugin: ${plugin.manifest.name}`);

    for (let i = 0; i < handlers.length; i++) {
      const handler = handlers[i];
      const hookTimeout = 5000; // 5 second timeout for lifecycle hooks

      try {
        await Promise.race([
          handler(...args),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Lifecycle hook '${hook}' timeout after ${hookTimeout}ms`)), hookTimeout)
          ),
        ]);

        this.logger.debug(
          `✓ Lifecycle hook '${hook}' [${i + 1}/${handlers.length}] executed successfully for plugin: ${
            plugin.manifest.name
          }`
        );
      } catch (error) {
        this.logger.error(
          `Lifecycle hook '${hook}' [${i + 1}/${handlers.length}] failed for plugin '${plugin.manifest.name}':`,
          error
        );

        // Critical hooks should fail fast
        if (hook === 'beforeLoad') {
          throw error;
        }

        // For other hooks, log but continue with remaining hooks
        // This prevents one failing hook from breaking all hooks
      }
    }
  }

  /**
   * Extract lifecycle hooks from plugin using optimized discovery service
   * @param plugin - The loaded plugin object
   * @returns Map of lifecycle hook types to their handler functions
   */
  private getPluginLifecycleHooks(plugin: LoadedPlugin): Map<PluginLifecycleHook, Function[]> {
    // Use the dedicated discovery service for optimized hook discovery and caching
    return this.getPluginLifecycleHooksOptimized(plugin);
  }

  /**
   * Optimized lifecycle hook discovery with caching
   */
  private getPluginLifecycleHooksOptimized(plugin: LoadedPlugin): Map<PluginLifecycleHook, Function[]> {
    const hooks = new Map<PluginLifecycleHook, Function[]>();
    const lifecycleHooks: PluginLifecycleHook[] = ['beforeLoad', 'afterLoad', 'beforeUnload', 'afterUnload', 'onError'];

    if (!plugin.instance || typeof plugin.instance !== 'object') {
      return hooks;
    }

    // Check cache first
    const cached = this.lifecycleHookDiscovery.getCachedHooks(plugin.manifest.name);
    if (cached && this.isHookCacheValid(cached)) {
      this.logger.debug(`Using cached lifecycle hooks for plugin: ${plugin.manifest.name}`);
      return this.convertCachedHooksToFunctionMap(cached.hooks, plugin);
    }

    // Streamlined hook discovery with improved performance
    const exports = Object.entries(plugin.instance as Record<string, unknown>);

    for (const [exportName, exportValue] of exports) {
      if (this.shouldSkipExportForHooks(exportValue)) {
        continue;
      }

      const discoveredHooks = this.discoverHooksInExport(exportName, exportValue, lifecycleHooks);
      this.bindAndAddHooks(discoveredHooks, hooks, plugin.manifest.name);
    }

    const totalHooks = Array.from(hooks.values()).reduce((sum, handlers) => sum + handlers.length, 0);
    if (totalHooks > 0) {
      this.logger.debug(`Discovered ${totalHooks} lifecycle hooks for plugin: ${plugin.manifest.name}`);

      // Cache the discovered hooks for future use
      this.cacheDiscoveredHooks(plugin.manifest.name, hooks);
    }

    return hooks;
  }

  /**
   * Check if export should be skipped for hook discovery
   */
  private shouldSkipExportForHooks(exportValue: unknown): boolean {
    return !exportValue || (typeof exportValue !== 'object' && typeof exportValue !== 'function');
  }

  /**
   * Discover hooks in a specific export
   */
  private discoverHooksInExport(
    exportName: string,
    exportValue: unknown,
    lifecycleHooks: PluginLifecycleHook[]
  ): Array<{ hookType: PluginLifecycleHook; method: Function; exportName: string; methodName: string }> {
    const discovered: Array<{
      hookType: PluginLifecycleHook;
      method: Function;
      exportName: string;
      methodName: string;
    }> = [];

    const prototype = typeof exportValue === 'function' ? exportValue.prototype : exportValue;
    if (!prototype) return discovered;

    // Optimized method discovery - filter non-functions upfront
    const methodNames = Object.getOwnPropertyNames(prototype).filter((name) => {
      return name !== 'constructor' && typeof (prototype as any)[name] === 'function';
    });

    for (const methodName of methodNames) {
      const method = (prototype as any)[methodName];

      // Check for lifecycle hooks using optimized lookup
      for (const hookType of lifecycleHooks) {
        if (Reflect.getMetadata(`plugin:hook:${hookType}`, method)) {
          discovered.push({ hookType, method, exportName, methodName });
          break; // A method can only have one hook type
        }
      }
    }

    return discovered;
  }

  /**
   * Bind and add discovered hooks to the hooks map
   */
  private bindAndAddHooks(
    discoveredHooks: Array<{ hookType: PluginLifecycleHook; method: Function; exportName: string; methodName: string }>,
    hooks: Map<PluginLifecycleHook, Function[]>,
    pluginName: string
  ): void {
    // Get plugin instance for binding
    const plugin = this.loadedPlugins.get(pluginName);
    if (!plugin || !plugin.instance) {
      this.logger.warn(`Cannot bind hooks - plugin instance not found: ${pluginName}`);
      return;
    }

    const instance = plugin.instance as Record<string, unknown>;

    for (const { hookType, method, exportName, methodName } of discoveredHooks) {
      try {
        const boundMethod = this.bindHookMethodToInstance(method, exportName, instance, hookType);
        if (boundMethod) {
          if (!hooks.has(hookType)) {
            hooks.set(hookType, []);
          }
          hooks.get(hookType)!.push(boundMethod);

          this.logger.debug(
            `Found lifecycle hook '${hookType}' in method '${exportName}.${methodName}' for plugin: ${pluginName}`
          );
        }
      } catch (error) {
        this.logger.warn(`Failed to bind hook ${exportName}.${methodName}:`, error);
      }
    }
  }

  /**
   * Bind hook method to its proper instance
   */
  private bindHookMethodToInstance(
    method: Function,
    exportName: string,
    pluginInstance: Record<string, unknown>,
    hookType: string
  ): Function | null {
    try {
      const exportValue = pluginInstance[exportName];
      if (!exportValue) {
        this.logger.warn(`Export ${exportName} not found in plugin instance`);
        return null;
      }

      // Bind the method to the appropriate instance
      if (typeof exportValue === 'function') {
        // This is a class constructor, we need an instance
        try {
          const ClassConstructor = exportValue as new () => unknown;
          const classInstance = new ClassConstructor();
          return method.bind(classInstance);
        } catch (error) {
          this.logger.warn(`Failed to instantiate class '${exportName}' for lifecycle hook '${hookType}':`, error);
          return null;
        }
      } else {
        // This is already an instance/object
        return method.bind(exportValue);
      }
    } catch (error) {
      this.logger.warn(`Error binding hook method ${exportName}:`, error);
      return null;
    }
  }

  /**
   * Check if hook cache is valid
   */
  private isHookCacheValid(cached: any): boolean {
    const cacheAge = Date.now() - cached.cacheTime.getTime();
    return cacheAge < 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Convert cached hooks to function map
   */
  private convertCachedHooksToFunctionMap(
    cachedHooks: any,
    plugin: LoadedPlugin
  ): Map<PluginLifecycleHook, Function[]> {
    // This is a placeholder for cache conversion logic
    // For now, fall back to direct discovery
    return new Map();
  }

  /**
   * Cache discovered hooks
   */
  private cacheDiscoveredHooks(pluginName: string, hooks: Map<PluginLifecycleHook, Function[]>): void {
    // Store hooks in the discovery service cache
    // This is a simplified implementation
    this.logger.debug(`Cached lifecycle hooks for plugin: ${pluginName}`);
  }

  /**
   * Register plugin for comprehensive memory tracking
   * @private
   */
  private registerPluginForMemoryTracking(
    pluginName: string,
    pluginModule: Record<string, unknown>,
    loadedPlugin: LoadedPlugin
  ): void {
    try {
      // Create WeakRef for the main plugin instance
      if (pluginModule) {
        const weakRef = new WeakRef(pluginModule);
        this.pluginWeakRefs.set(pluginName, weakRef);
        this.cleanupRegistry.register(pluginModule, pluginName);
      }

      // Track all instances created by the plugin
      const instances = new Set<object>();
      this.pluginInstances.set(pluginName, instances);

      // Scan plugin module for instances and potential memory references
      if (pluginModule && typeof pluginModule === 'object') {
        this.trackPluginInstances(pluginName, pluginModule, instances);
      }

      this.logger.debug(`Memory tracking registered for plugin: ${pluginName} (${instances.size} instances tracked)`);
    } catch (error) {
      this.logger.warn(`Failed to register memory tracking for plugin ${pluginName}:`, error);
    }
  }

  /**
   * Track instances within plugin module for cleanup
   * @private
   */
  private trackPluginInstances(
    pluginName: string,
    pluginModule: Record<string, unknown>,
    instances: Set<object>
  ): void {
    if (!pluginModule) return;

    try {
      // Add the object itself to tracking
      instances.add(pluginModule);

      // Track exported classes and their prototypes
      Object.values(pluginModule).forEach((exportedValue) => {
        if (exportedValue && typeof exportedValue === 'function') {
          // This is likely a class constructor
          instances.add(exportedValue);
          if (exportedValue.prototype) {
            instances.add(exportedValue.prototype);
          }
        } else if (exportedValue && typeof exportedValue === 'object') {
          // Track object instances
          instances.add(exportedValue);
        }
      });
    } catch (error) {
      this.logger.debug(`Error tracking instances for ${pluginName}:`, error);
    }
  }

  /**
   * Track timers and intervals created by plugins
   */
  registerPluginTimer(pluginName: string, timer: NodeJS.Timeout): void {
    if (!this.pluginTimers.has(pluginName)) {
      this.pluginTimers.set(pluginName, []);
    }
    this.pluginTimers.get(pluginName)!.push(timer);
  }

  /**
   * Track event listeners added by plugins
   */
  registerPluginEventListener(
    pluginName: string,
    target: EventTarget | NodeJS.EventEmitter,
    event: string,
    listener: Function
  ): void {
    if (!this.pluginEventListeners.has(pluginName)) {
      this.pluginEventListeners.set(pluginName, []);
    }
    this.pluginEventListeners.get(pluginName)!.push({ target, event, listener });
  }

  /**
   * Comprehensive plugin cleanup with memory leak prevention
   * @private
   */
  private async performComprehensiveCleanup(pluginName: string): Promise<void> {
    this.logger.debug(`Starting comprehensive cleanup for plugin: ${pluginName}`);

    try {
      // 1. Clear all timers and intervals
      await this.clearPluginTimers(pluginName);

      // 2. Remove all event listeners
      await this.clearPluginEventListeners(pluginName);

      // 3. Clear WeakRefs and instance tracking
      await this.clearPluginInstanceTracking(pluginName);

      // 4. Clear module cache (existing functionality)
      await this.clearPluginModuleCache(pluginName);

      // 5. Force garbage collection hint (if available)
      this.forceGarbageCollectionHint();

      this.logger.debug(`Comprehensive cleanup completed for plugin: ${pluginName}`);
    } catch (error) {
      this.logger.error(`Error during comprehensive cleanup for ${pluginName}:`, error);
    }
  }

  /**
   * Clear all timers associated with a plugin
   * @private
   */
  private async clearPluginTimers(pluginName: string): Promise<void> {
    const timers = this.pluginTimers.get(pluginName);
    if (timers && timers.length > 0) {
      this.logger.debug(`Clearing ${timers.length} timers for plugin: ${pluginName}`);

      for (const timer of timers) {
        try {
          clearTimeout(timer);
          clearInterval(timer);
        } catch (error) {
          this.logger.debug(`Error clearing timer for ${pluginName}:`, error);
        }
      }

      this.pluginTimers.delete(pluginName);
    }
  }

  /**
   * Clear all event listeners associated with a plugin
   * @private
   */
  private async clearPluginEventListeners(pluginName: string): Promise<void> {
    const listeners = this.pluginEventListeners.get(pluginName);
    if (listeners && listeners.length > 0) {
      this.logger.debug(`Removing ${listeners.length} event listeners for plugin: ${pluginName}`);

      for (const { target, event, listener } of listeners) {
        try {
          if (target) {
            // Use type assertions to handle different event emitter types
            const eventTarget = target as any;
            if (typeof eventTarget.removeEventListener === 'function') {
              eventTarget.removeEventListener(event, listener);
            } else if (typeof eventTarget.off === 'function') {
              eventTarget.off(event, listener);
            } else if (typeof eventTarget.removeListener === 'function') {
              eventTarget.removeListener(event, listener);
            }
          }
        } catch (error) {
          this.logger.debug(`Error removing event listener for ${pluginName}:`, error);
        }
      }

      this.pluginEventListeners.delete(pluginName);
    }
  }

  /**
   * Clear instance tracking and WeakRefs
   * @private
   */
  private async clearPluginInstanceTracking(pluginName: string): Promise<void> {
    // Clear WeakRef
    const weakRef = this.pluginWeakRefs.get(pluginName);
    if (weakRef) {
      this.pluginWeakRefs.delete(pluginName);
      this.logger.debug(`WeakRef cleared for plugin: ${pluginName}`);
    }

    // Clear instance tracking
    const instances = this.pluginInstances.get(pluginName);
    if (instances) {
      this.logger.debug(`Clearing tracking for ${instances.size} instances of plugin: ${pluginName}`);

      // Attempt to null out references in tracked instances
      for (const instance of instances) {
        try {
          // For objects, try to clear their properties to break circular references
          if (instance && typeof instance === 'object' && !Array.isArray(instance)) {
            Object.keys(instance).forEach((key) => {
              try {
                const typedInstance = instance as Record<string, any>;
                if (typedInstance[key] && typeof typedInstance[key] === 'object') {
                  typedInstance[key] = null;
                }
              } catch (error) {
                // Ignore errors when clearing properties (may be read-only)
              }
            });
          }
        } catch (error) {
          this.logger.debug(`Error clearing instance references for ${pluginName}:`, error);
        }
      }

      instances.clear();
      this.pluginInstances.delete(pluginName);
    }
  }

  /**
   * Force garbage collection hint (if available in Node.js)
   * @private
   */
  private forceGarbageCollectionHint(): void {
    try {
      // Check if global.gc is available (Node.js with --expose-gc flag)
      if (typeof global !== 'undefined' && global.gc && typeof global.gc === 'function') {
        global.gc();
        this.logger.debug('Garbage collection triggered');
      } else {
        // No GC available, but that's okay - this is just a hint
        this.logger.debug('Garbage collection not available (--expose-gc flag not set)');
      }
    } catch (error) {
      this.logger.debug('Error triggering garbage collection:', error);
    }
  }

  /**
   * Get memory usage statistics for a plugin
   */
  getPluginMemoryStats(pluginName: string): {
    hasWeakRef: boolean;
    isAlive: boolean;
    trackedInstances: number;
    activeTimers: number;
    activeEventListeners: number;
  } {
    const weakRef = this.pluginWeakRefs.get(pluginName);
    const instances = this.pluginInstances.get(pluginName);
    const timers = this.pluginTimers.get(pluginName);
    const listeners = this.pluginEventListeners.get(pluginName);

    return {
      hasWeakRef: !!weakRef,
      isAlive: weakRef ? weakRef.deref() !== undefined : false,
      trackedInstances: instances ? instances.size : 0,
      activeTimers: timers ? timers.length : 0,
      activeEventListeners: listeners ? listeners.length : 0,
    };
  }

  /**
   * Get overall memory management statistics
   * @private
   */
  private getOverallMemoryStats(): {
    totalTrackedPlugins: number;
    totalWeakRefs: number;
    totalAliveInstances: number;
    totalTrackedInstances: number;
    totalActiveTimers: number;
    totalActiveEventListeners: number;
    pluginMemoryDetails: Record<
      string,
      {
        hasWeakRef: boolean;
        isAlive: boolean;
        trackedInstances: number;
        activeTimers: number;
        activeEventListeners: number;
      }
    >;
    systemMemoryUsage: NodeJS.MemoryUsage;
  } {
    const pluginNames = Array.from(this.loadedPlugins.keys());
    const pluginMemoryDetails: Record<
      string,
      {
        hasWeakRef: boolean;
        isAlive: boolean;
        trackedInstances: number;
        activeTimers: number;
        activeEventListeners: number;
      }
    > = {};

    let totalWeakRefs = 0;
    let totalAliveInstances = 0;
    let totalTrackedInstances = 0;
    let totalActiveTimers = 0;
    let totalActiveEventListeners = 0;

    // Collect stats for each plugin
    pluginNames.forEach((pluginName) => {
      const stats = this.getPluginMemoryStats(pluginName);
      pluginMemoryDetails[pluginName] = stats;

      if (stats.hasWeakRef) totalWeakRefs++;
      if (stats.isAlive) totalAliveInstances++;
      totalTrackedInstances += stats.trackedInstances;
      totalActiveTimers += stats.activeTimers;
      totalActiveEventListeners += stats.activeEventListeners;
    });

    // Get system memory usage
    const systemMemoryUsage = process.memoryUsage();

    return {
      totalTrackedPlugins: pluginNames.length,
      totalWeakRefs,
      totalAliveInstances,
      totalTrackedInstances,
      totalActiveTimers,
      totalActiveEventListeners,
      pluginMemoryDetails,
      systemMemoryUsage,
    };
  }

  /**
   * Force cleanup of all unloaded plugins to free memory
   */
  async forceMemoryCleanup(): Promise<{
    pluginsProcessed: number;
    totalTimersCleared: number;
    totalListenersRemoved: number;
    totalInstancesCleared: number;
  }> {
    this.logger.log('Starting forced memory cleanup for all plugins...');

    let pluginsProcessed = 0;
    let totalTimersCleared = 0;
    let totalListenersRemoved = 0;
    let totalInstancesCleared = 0;

    // Process all tracked plugins, including unloaded ones
    const allTrackedPlugins = new Set([
      ...this.pluginWeakRefs.keys(),
      ...this.pluginTimers.keys(),
      ...this.pluginEventListeners.keys(),
      ...this.pluginInstances.keys(),
    ]);

    for (const pluginName of allTrackedPlugins) {
      const isLoaded = this.loadedPlugins.has(pluginName);

      // Only clean up unloaded plugins or force cleanup for all
      if (!isLoaded) {
        this.logger.debug(`Performing forced cleanup for unloaded plugin: ${pluginName}`);

        const timers = this.pluginTimers.get(pluginName);
        const listeners = this.pluginEventListeners.get(pluginName);
        const instances = this.pluginInstances.get(pluginName);

        if (timers) totalTimersCleared += timers.length;
        if (listeners) totalListenersRemoved += listeners.length;
        if (instances) totalInstancesCleared += instances.size;

        await this.performComprehensiveCleanup(pluginName);
        pluginsProcessed++;
      }
    }

    // Force garbage collection hint
    this.forceGarbageCollectionHint();

    const result = {
      pluginsProcessed,
      totalTimersCleared,
      totalListenersRemoved,
      totalInstancesCleared,
    };

    this.logger.log(`Forced memory cleanup completed: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Clear plugin module cache for proper cleanup
   * @param pluginName - Name of the plugin to clear cache for
   */
  private async clearPluginModuleCache(pluginName: string): Promise<void> {
    const discovery = this.discoveredPlugins.get(pluginName);
    if (!discovery) {
      this.logger.warn(`Cannot clear module cache - plugin discovery not found: ${pluginName}`);
      return;
    }

    const mainPath = path.join(discovery.path, 'dist', 'index.js');
    try {
      const dynamicRequire = createRequire(__filename);
      const resolvedPath = dynamicRequire.resolve(mainPath);

      if (dynamicRequire.cache[resolvedPath]) {
        delete dynamicRequire.cache[resolvedPath];
        this.logger.debug(`Cleared module cache for plugin: ${pluginName}`);
      }

      // Also clear any related modules from the same plugin directory
      const moduleDir = path.dirname(resolvedPath);
      let clearedCount = 0;
      Object.keys(dynamicRequire.cache)
        .filter((cachePath) => cachePath.startsWith(moduleDir))
        .forEach((cachePath) => {
          delete dynamicRequire.cache[cachePath];
          clearedCount++;
        });

      if (clearedCount > 1) {
        this.logger.debug(`Cleared ${clearedCount} module cache entries for plugin: ${pluginName}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to clear module cache for plugin ${pluginName}:`, error);
      // Continue execution - cache clearing is not critical for functionality
    }
  }

  /**
   * Unload a specific plugin
   */
  async unloadPlugin(
    pluginName: string,
    reason: 'manual' | 'error' | 'shutdown' | 'dependency-conflict' = 'manual'
  ): Promise<void> {
    const loadedPlugin = this.loadedPlugins.get(pluginName);
    if (!loadedPlugin) {
      this.logger.warn(`Plugin not loaded: ${pluginName}`);
      return;
    }

    try {
      // Execute beforeUnload lifecycle hook
      await this.executeLifecycleHook(loadedPlugin, 'beforeUnload');

      // Clean up guards and services
      await this.guardManager.removePluginGuards(pluginName);
      await this.crossPluginServiceManager.removePluginServices(pluginName);

      // Perform comprehensive memory cleanup
      await this.performComprehensiveCleanup(pluginName);

      // Remove from loaded plugins
      this.loadedPlugins.delete(pluginName);
      this.stateMachine.transition(pluginName, PluginTransition.UNLOAD);

      // Execute afterUnload lifecycle hook
      await this.executeLifecycleHook(loadedPlugin, 'afterUnload');

      // Invalidate cache entries for this plugin
      const pluginPattern = PluginCacheKeyBuilder.pluginPattern(pluginName);
      const invalidatedCount = this.cacheService.invalidatePattern(pluginPattern);
      if (invalidatedCount > 0) {
        this.logger.debug(`Invalidated ${invalidatedCount} cache entries for plugin: ${pluginName}`);
      }

      // Record plugin unload
      this.metricsService?.recordPluginUnload(pluginName);

      // Emit plugin unloaded event (basic cleanup stats)
      this.eventEmitter.emitPluginUnloaded(pluginName, reason, {
        memory: 0, // Could be tracked if needed
        timers: 0, // Could be tracked if needed
        listeners: 0, // Could be tracked if needed
      });

      this.logger.log(`Plugin unloaded successfully: ${pluginName}`);
    } catch (error) {
      this.logger.error(`Failed to unload plugin ${pluginName}:`, error);

      // Emit plugin error event
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'high', 'runtime', false);

      // Execute onError lifecycle hook
      await this.executeLifecycleHook(loadedPlugin, 'onError', error);
      throw error;
    }
  }

  /**
   * Verifies guard isolation and access control
   * This method ensures guards are properly isolated and cross-plugin access is controlled
   */
  async verifyGuardIsolation(): Promise<{
    isSecure: boolean;
    violations: string[];
    summary: {
      totalPlugins: number;
      totalGuards: number;
      exportedGuards: number;
      externalReferences: number;
    };
  }> {
    const violations: string[] = [];
    const pluginNames = Array.from(this.loadedPlugins.keys());
    let totalGuards = 0;
    let exportedGuards = 0;
    let externalReferences = 0;

    for (const pluginName of pluginNames) {
      const plugin = this.loadedPlugins.get(pluginName);
      if (!plugin || !plugin.manifest.module.guards) continue;

      for (const guardEntry of plugin.manifest.module.guards) {
        totalGuards++;

        if (guardEntry.scope === 'local') {
          const localEntry = guardEntry as LocalGuardEntry;
          if (localEntry.exported) {
            exportedGuards++;
          }

          // Check that local guards don't access unauthorized external guards
          if (localEntry.dependencies) {
            for (const dep of localEntry.dependencies) {
              const availableGuard = await this.guardManager.resolveGuardsForPlugin(pluginName, [dep]);
              if (availableGuard.missingDependencies.includes(dep)) {
                violations.push(
                  `Plugin '${pluginName}' guard '${guardEntry.name}' has unresolvable dependency '${dep}'`
                );
              }
            }
          }
        } else if (guardEntry.scope === 'external') {
          externalReferences++;
          const externalEntry = guardEntry as ExternalGuardEntry;

          // Verify external guard source exists and is exported
          const sourcePlugin = this.loadedPlugins.get(externalEntry.source);
          if (!sourcePlugin) {
            violations.push(
              `Plugin '${pluginName}' references non-existent plugin '${externalEntry.source}' for guard '${guardEntry.name}'`
            );
          } else {
            // Check if the referenced guard is actually exported
            const sourceGuards = sourcePlugin.manifest.module.guards || [];
            const referencedGuard = sourceGuards.find((g) => g.name === guardEntry.name && g.scope === 'local');
            if (!referencedGuard || !(referencedGuard as LocalGuardEntry).exported) {
              violations.push(
                `Plugin '${pluginName}' tries to access non-exported guard '${guardEntry.name}' from plugin '${externalEntry.source}'`
              );
            }
          }
        }
      }
    }

    const isSecure = violations.length === 0;

    this.logger.log(
      `Guard isolation verification: ${isSecure ? 'SECURE' : 'VIOLATIONS DETECTED'} ` +
        `(${violations.length} violations found)`
    );

    if (!isSecure) {
      this.logger.warn('Guard isolation violations:');
      violations.forEach((violation) => this.logger.warn(`  - ${violation}`));
    }

    return {
      isSecure,
      violations,
      summary: {
        totalPlugins: pluginNames.length,
        totalGuards,
        exportedGuards,
        externalReferences,
      },
    };
  }

  /**
   * Adds plugin name metadata to controllers for guard isolation
   */
  private addPluginMetadataToControllers(controllers: Function[], pluginName: string): void {
    for (const controller of controllers) {
      if (typeof controller === 'function') {
        // Add plugin name metadata to the controller class
        Reflect.defineMetadata('plugin:name', pluginName, controller);
        this.logger.debug(`Added plugin metadata '${pluginName}' to controller '${controller.name}'`);
      }
    }
  }

  /**
   * Set the guard registry service (injected from app module)
   */
  setGuardRegistry(guardRegistry: PluginGuardRegistryService): void {
    this.guardRegistry = guardRegistry;
    // Now register all loaded plugin guards
    this.registerAllPluginGuards();
  }

  /**
   * Register all loaded plugin guards with the registry
   */
  private registerAllPluginGuards(): void {
    for (const [pluginName, plugin] of this.loadedPlugins.entries()) {
      if (plugin.manifest.module.guards && plugin.manifest.module.guards.length > 0) {
        this.logger.debug(`Registering ${plugin.manifest.module.guards.length} guards for plugin: ${pluginName}`);
        this.registerPluginGuards(
          pluginName,
          plugin.manifest.module.guards,
          plugin.instance as Record<string, unknown>
        );
      }
    }
  }

  /**
   * Register guards with the legacy guard registry system for the interceptor
   */
  private registerPluginGuards(
    pluginName: string,
    guardEntries: GuardEntry[],
    pluginModule: Record<string, unknown>
  ): void {
    if (!this.guardRegistry) {
      this.logger.warn('Guard registry not available - guards will not be registered for interceptor');
      return;
    }

    for (const entry of guardEntries) {
      if (entry.scope === 'local') {
        const localEntry = entry as LocalGuardEntry;
        const guardClass = pluginModule[localEntry.class];

        if (!guardClass || typeof guardClass !== 'function') {
          this.logger.warn(`Guard class '${localEntry.class}' not found in plugin '${pluginName}' exports`);
          continue;
        }

        try {
          this.guardRegistry.registerGuard({
            metadata: {
              name: entry.name,
              description: entry.description || '',
              source: pluginName,
              scope: 'external',
            },
            guardClass: guardClass as new (...args: any[]) => any,
          });

          this.logger.debug(`Registered guard '${entry.name}' from plugin '${pluginName}' with guard registry`);
        } catch (error) {
          this.logger.error(`Failed to register guard '${entry.name}' from plugin '${pluginName}':`, error);
        }
      }
    }
  }

  /**
   * Get circuit breaker statistics for a specific plugin
   */
  getCircuitBreakerStats(pluginName: string) {
    return this.circuitBreaker.getPluginStats(pluginName);
  }

  /**
   * Get circuit breaker statistics for all plugins
   */
  getAllCircuitBreakerStats() {
    return this.circuitBreaker.getAllStats();
  }

  /**
   * Check if a plugin's circuit breaker is currently open
   */
  isPluginCircuitOpen(pluginName: string): boolean {
    return this.circuitBreaker.isCircuitOpen(pluginName);
  }

  /**
   * Get the current circuit breaker state for a plugin
   */
  getPluginCircuitState(pluginName: string): CircuitBreakerState {
    return this.circuitBreaker.getCurrentState(pluginName);
  }

  /**
   * Get plugin failure count for circuit breaker configuration
   */
  private getPluginFailureCount(pluginName: string): number {
    return this.pluginFailureCounts.get(pluginName) || 0;
  }

  /**
   * Increment plugin failure count
   */
  private incrementPluginFailureCount(pluginName: string): void {
    const currentCount = this.pluginFailureCounts.get(pluginName) || 0;
    this.pluginFailureCounts.set(pluginName, currentCount + 1);
    this.logger.debug(`Plugin ${pluginName} failure count: ${currentCount + 1}`);
  }

  /**
   * Reset plugin failure count
   */
  resetPluginFailureCount(pluginName: string): void {
    this.pluginFailureCounts.delete(pluginName);
    this.logger.debug(`Reset failure count for plugin: ${pluginName}`);
  }

  /**
   * Reset circuit breaker for a specific plugin
   */
  resetPluginCircuitBreaker(pluginName: string): void {
    this.circuitBreaker.resetPlugin(pluginName);
    this.logger.log(`Circuit breaker reset for plugin: ${pluginName}`);
  }

  /**
   * Get adaptive manifest cache statistics for a specific plugin
   */
  getManifestCacheStats(pluginPath: string) {
    return this.adaptiveManifestCache.getCacheStats(pluginPath);
  }

  /**
   * Get all manifest cache statistics
   */
  getAllManifestCacheStats() {
    return this.adaptiveManifestCache.getAllCacheStats();
  }

  /**
   * Invalidate manifest cache for a specific plugin
   */
  invalidateManifestCache(pluginPath: string): void {
    this.adaptiveManifestCache.invalidateManifest(pluginPath);
    this.logger.log(`Invalidated manifest cache for: ${pluginPath}`);
  }

  /**
   * Clean up old cache tracking data
   */
  cleanupManifestCacheTracking(maxAge?: number): void {
    this.adaptiveManifestCache.cleanupOldTracking(maxAge);
    this.logger.log('Cleaned up old manifest cache tracking data');
  }

  /**
   * Get lifecycle hook discovery statistics
   */
  getHookDiscoveryStats() {
    return this.lifecycleHookDiscovery.getDiscoveryStats();
  }

  /**
   * Clear lifecycle hook cache for a specific plugin
   */
  clearHookCache(pluginName: string): void {
    this.lifecycleHookDiscovery.clearHookCache(pluginName);
    this.logger.log(`Cleared hook cache for plugin: ${pluginName}`);
  }

  /**
   * Clear all lifecycle hook caches
   */
  clearAllHookCaches(): void {
    this.lifecycleHookDiscovery.clearAllHookCaches();
    this.logger.log('Cleared all hook caches');
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers(): void {
    this.circuitBreaker.resetAll();
    this.logger.log('All circuit breakers reset');
  }

  /**
   * Execute a plugin operation with circuit breaker protection
   * This can be used by external services to protect plugin-related operations
   */
  async executeWithCircuitBreaker<T>(
    pluginName: string,
    operation: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    try {
      return await this.circuitBreaker.execute(pluginName, operation);
    } catch (error) {
      if (error instanceof PluginCircuitOpenError) {
        this.logger.warn(
          `Operation '${operationName || 'unknown'}' blocked by circuit breaker for plugin '${pluginName}'`
        );
      }
      throw error;
    }
  }

  /**
   * Configure circuit breaker settings for a specific plugin
   */
  configurePluginCircuitBreaker(
    pluginName: string,
    config: {
      maxFailures?: number;
      resetTimeout?: number;
      operationTimeout?: number;
      halfOpenMaxCalls?: number;
      monitoringWindow?: number;
    }
  ): void {
    this.circuitBreaker.setPluginConfig(pluginName, config);
    this.logger.log(`Circuit breaker configured for plugin '${pluginName}':`, config);
  }

  /**
   * Enhanced plugin statistics including circuit breaker information
   */
  async getEnhancedPluginStats() {
    const baseStats = await this.getPluginStats();
    const circuitBreakerStats = this.getAllCircuitBreakerStats();

    // Create a map for easy lookup
    const cbStatsByPlugin = new Map(circuitBreakerStats.map((stat) => [stat.pluginName, stat]));

    return {
      ...baseStats,
      circuitBreaker: {
        enabled: true,
        pluginStats: circuitBreakerStats,
        summary: {
          totalPlugins: circuitBreakerStats.length,
          openCircuits: circuitBreakerStats.filter((s) => s.state === CircuitBreakerState.OPEN).length,
          halfOpenCircuits: circuitBreakerStats.filter((s) => s.state === CircuitBreakerState.HALF_OPEN).length,
          averageFailureRate:
            circuitBreakerStats.length > 0
              ? circuitBreakerStats.reduce((sum, s) => sum + s.failureRate, 0) / circuitBreakerStats.length
              : 0,
          averageUptime:
            circuitBreakerStats.length > 0
              ? circuitBreakerStats.reduce((sum, s) => sum + s.uptime, 0) / circuitBreakerStats.length
              : 100,
        },
      },
      pluginsWithCircuitBreaker: Array.from(this.loadedPlugins.keys()).map((pluginName) => ({
        pluginName,
        circuitBreaker: cbStatsByPlugin.get(pluginName) || null,
        isLoaded: true,
      })),
    };
  }

  /**
   * Get comprehensive cache statistics
   * @returns Cache statistics including hit rate, memory usage, and entry details
   */
  getCacheStatistics() {
    return this.cacheService.getCacheStats();
  }

  /**
   * Clear all plugin cache entries
   * @returns Number of entries cleared
   */
  clearPluginCache(): number {
    const stats = this.cacheService.getCacheStats();
    this.cacheService.clear();
    this.logger.log(`Cleared all plugin cache entries (${stats.size} entries)`);
    return stats.size;
  }

  /**
   * Invalidate cache entries for a specific plugin
   * @param pluginName - Name of the plugin
   * @returns Number of entries invalidated
   */
  invalidatePluginCache(pluginName: string): number {
    const pattern = PluginCacheKeyBuilder.pluginPattern(pluginName);
    const count = this.cacheService.invalidatePattern(pattern);
    this.logger.log(`Invalidated ${count} cache entries for plugin: ${pluginName}`);
    return count;
  }

  /**
   * Invalidate cache entries by type (manifest, metadata, etc.)
   * @param cacheType - Type of cache entries to invalidate
   * @returns Number of entries invalidated
   */
  invalidateCacheByType(cacheType: string): number {
    const pattern = PluginCacheKeyBuilder.typePattern(cacheType);
    const count = this.cacheService.invalidatePattern(pattern);
    this.logger.log(`Invalidated ${count} cache entries of type: ${cacheType}`);
    return count;
  }

  /**
   * Get cache entry details for debugging
   * @param key - Cache key
   * @returns Cache entry details or undefined
   */
  getCacheEntryDetails(key: string) {
    return this.cacheService.getEntryDetails(key);
  }

  /**
   * Get all cache keys matching a pattern
   * @param pattern - Regular expression pattern
   * @returns Array of matching cache keys
   */
  getCacheKeys(pattern?: RegExp): string[] {
    return pattern ? this.cacheService.getKeysMatching(pattern) : this.cacheService.getKeys();
  }
}

// Supporting types for enhanced plugin loading

// Priority Queue implementation for dependency-ordered loading
class PriorityQueue<T> {
  private items: T[] = [];

  constructor(private compare: (a: T, b: T) => number) {}

  enqueue(item: T): void {
    this.items.push(item);
    this.items.sort(this.compare);
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}
