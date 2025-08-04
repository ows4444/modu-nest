import { Injectable, Logger, DynamicModule, Module } from '@nestjs/common';
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
  PluginLifecycleHook,
  PluginCircuitBreaker,
  PluginCircuitOpenError,
  CircuitBreakerState,
  PluginCacheService,
  PluginCacheKeyBuilder,
} from '@modu-nest/plugin-types';
import { CrossPluginServiceManager } from './cross-plugin-service-manager';
import { PluginMetricsService } from './plugin-metrics.service';

@Injectable()
export class PluginLoaderService {
  private readonly logger = new Logger(PluginLoaderService.name);
  private loadedPlugins = new Map<string, LoadedPlugin>();
  private guardManager = new PluginGuardManager();
  private guardRegistry?: PluginGuardRegistryService;
  private loadingState = new Map<string, PluginLoadingState>();
  private discoveredPlugins = new Map<string, PluginDiscovery>();
  private crossPluginServiceManager = new CrossPluginServiceManager();
  private circuitBreaker = new PluginCircuitBreaker();
  private metricsService?: PluginMetricsService;
  private cacheService = new PluginCacheService();

  // Memory management for plugin cleanup
  private readonly pluginWeakRefs = new Map<string, WeakRef<any>>();
  private readonly pluginTimers = new Map<string, NodeJS.Timeout[]>();
  private readonly pluginEventListeners = new Map<string, Array<{ target: any; event: string; listener: Function }>>();
  private readonly pluginInstances = new Map<string, Set<any>>();

  // FinalizationRegistry to track garbage collection
  private readonly cleanupRegistry = new FinalizationRegistry((pluginName: string) => {
    this.logger.debug(`Plugin instance garbage collected: ${pluginName}`);
    this.pluginWeakRefs.delete(pluginName);
  });

  getLoadedPlugins(): Map<string, LoadedPlugin> {
    return this.loadedPlugins;
  }

  setMetricsService(metricsService: PluginMetricsService): void {
    this.metricsService = metricsService;
    this.logger.debug('Metrics service configured for plugin loader');
  }

  async scanAndLoadAllPlugins(): Promise<DynamicModule[]> {
    const startTime = Date.now();

    try {
      this.logger.log('Starting plugin discovery and loading...');

      // Step 1: Discover all plugins and their manifests
      const discoveryStartTime = Date.now();
      const discoveredPlugins = await this.discoverPlugins();
      const discoveryTime = Date.now() - discoveryStartTime;
      this.logger.log(`Discovered ${discoveredPlugins.length} plugins in ${discoveryTime}ms`);

      // Step 2: Create dependency graph and sort topologically
      const dependencyAnalysisStartTime = Date.now();
      const loadOrder = this.calculateLoadOrder(discoveredPlugins);
      const dependencyAnalysisTime = Date.now() - dependencyAnalysisStartTime;
      this.logger.log(`Plugin load order calculated in ${dependencyAnalysisTime}ms: [${loadOrder.join(', ')}]`);

      // Step 3: Load plugins in dependency order with parallel batching
      const loadingStartTime = Date.now();
      const modules = await this.loadPluginsInOrder(loadOrder);
      const loadingTime = Date.now() - loadingStartTime;

      const totalTime = Date.now() - startTime;
      const successCount = modules.length;
      const failureCount = loadOrder.length - successCount;

      this.logger.log(
        `Plugin loading completed in ${totalTime}ms: ` +
          `${successCount} loaded, ${failureCount} failed ` +
          `(discovery: ${discoveryTime}ms, analysis: ${dependencyAnalysisTime}ms, loading: ${loadingTime}ms)`
      );

      // Verify guard isolation and security
      if (successCount > 0) {
        const isolationCheck = await this.verifyGuardIsolation();
        if (!isolationCheck.isSecure) {
          this.logger.error('Plugin loading completed with guard security violations - review plugin configurations');
        }
      }

      return modules;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to load plugins after ${totalTime}ms:`, error);
      return [];
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
      const result = results[i];
      const pluginDir = directories[i];

      if (result.status === 'fulfilled' && result.value) {
        discoveries.push(result.value);
        this.discoveredPlugins.set(result.value.name, result.value);
        this.loadingState.set(result.value.name, PluginLoadingState.DISCOVERED);
        this.logger.debug(
          `Discovered plugin: ${result.value.name} (dependencies: [${result.value.dependencies.join(', ')}])`
        );
      } else {
        this.logger.error(
          `Failed to discover plugin ${pluginDir}:`,
          result.status === 'rejected' ? result.reason : 'Unknown error'
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

    const discovery: PluginDiscovery = {
      name: manifest.name,
      path: pluginPath,
      manifest,
      dependencies: manifest.dependencies || [],
      loadOrder: manifest.loadOrder || 0,
    };

    return discovery;
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
    const queue = new PriorityQueue<PluginDiscovery>((a, b) => a.loadOrder - b.loadOrder);
    const result: string[] = [];

    // Add nodes with no dependencies
    for (const plugin of discoveries) {
      if ((inDegree.get(plugin.name) || 0) === 0) {
        queue.enqueue(plugin);
      }
    }

    while (!queue.isEmpty()) {
      const current = queue.dequeue()!;
      result.push(current.name);

      // Update in-degrees of dependent plugins
      for (const plugin of discoveries) {
        if (plugin.dependencies.includes(current.name)) {
          const newInDegree = (inDegree.get(plugin.name) || 0) - 1;
          inDegree.set(plugin.name, newInDegree);

          if (newInDegree === 0) {
            queue.enqueue(plugin);
          }
        }
      }
    }

    // Check for circular dependencies
    if (result.length !== discoveries.length) {
      const remaining = discoveries.filter((p) => !result.includes(p.name));
      throw new Error(`Circular dependencies detected: ${remaining.map((p) => p.name).join(', ')}`);
    }

    return result;
  }

  private async loadManifest(pluginPath: string): Promise<PluginManifest> {
    const manifestPath = path.join(pluginPath, 'plugin.manifest.json');

    // Check cache first using the manifest path as key
    const cacheKey = PluginCacheKeyBuilder.pluginManifest(manifestPath);
    const cachedManifest = this.cacheService.get<PluginManifest>(cacheKey);
    if (cachedManifest) {
      this.logger.debug(`Using cached manifest: ${manifestPath}`);
      return cachedManifest;
    }

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

    // Cache the manifest for 10 minutes
    this.cacheService.set(cacheKey, manifest, 10 * 60 * 1000);
    this.logger.debug(`Cached manifest: ${manifestPath}`);

    return manifest;
  }

  private async loadPluginsInOrder(loadOrder: string[]): Promise<DynamicModule[]> {
    const dependencyGraph = this.buildDependencyGraph(loadOrder);
    const batches = this.calculateLoadBatches(dependencyGraph);
    const dynamicModules: DynamicModule[] = [];

    this.logger.log(`Loading plugins in ${batches.length} parallel batches`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      this.logger.log(`Loading batch ${batchIndex + 1}/${batches.length}: [${batch.join(', ')}]`);

      // Load plugins in current batch in parallel
      const batchPromises = batch.map((pluginName) => this.loadPluginWithErrorHandling(pluginName));
      const batchResults = await Promise.allSettled(batchPromises);

      // Process results and handle failures
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const pluginName = batch[i];

        if (result.status === 'fulfilled' && result.value) {
          dynamicModules.push(result.value.module as DynamicModule);
          this.loadedPlugins.set(pluginName, result.value);
          this.loadingState.set(pluginName, PluginLoadingState.LOADED);
          this.logger.log(`✓ Successfully loaded plugin: ${pluginName}`);
        } else {
          this.loadingState.set(pluginName, PluginLoadingState.FAILED);
          const error = result.status === 'rejected' ? result.reason : 'Unknown error';
          this.logger.error(`Failed to load plugin ${pluginName}:`, error);

          // Check if any plugins in subsequent batches depend on this failed plugin
          const affectedPlugins = this.getPluginsDependingOn(pluginName, loadOrder);
          if (affectedPlugins.length > 0) {
            this.logger.warn(`Plugin ${pluginName} failure affects: [${affectedPlugins.join(', ')}]`);
            // Mark affected plugins as failed
            affectedPlugins.forEach((affected) => {
              this.loadingState.set(affected, PluginLoadingState.FAILED);
            });
          }

          // Decide whether to continue or fail fast
          if (this.isCriticalPlugin(pluginName)) {
            throw error;
          }
        }
      }

      this.logger.log(
        `Batch ${batchIndex + 1} completed: ${
          batch.filter((name) => this.loadingState.get(name) === PluginLoadingState.LOADED).length
        }/${batch.length} plugins loaded successfully`
      );
    }

    return dynamicModules;
  }

  /**
   * Build dependency graph from plugin load order
   */
  private buildDependencyGraph(loadOrder: string[]): Map<string, string[]> {
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
  private calculateLoadBatches(dependencyGraph: Map<string, string[]>): string[][] {
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
  private async loadPluginWithErrorHandling(pluginName: string): Promise<LoadedPlugin | null> {
    try {
      this.logger.debug(`Loading plugin: ${pluginName}`);
      this.loadingState.set(pluginName, PluginLoadingState.LOADING);

      // Configure circuit breaker for this plugin based on manifest settings
      const discovery = this.discoveredPlugins.get(pluginName);
      if (discovery?.manifest.critical === false) {
        // Non-critical plugins get more lenient circuit breaker settings
        this.circuitBreaker.setPluginConfig(pluginName, {
          maxFailures: 2,
          resetTimeout: 15000, // 15 seconds
          operationTimeout: 10000, // 10 seconds
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
        this.loadingState.set(pluginName, PluginLoadingState.FAILED);
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
  private getPluginsDependingOn(failedPlugin: string, loadOrder: string[]): string[] {
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

    const discovery = this.discoveredPlugins.get(pluginName);
    if (!discovery) {
      this.logger.error(`Plugin discovery not found: ${pluginName}`);
      this.metricsService?.recordPluginLoadError(pluginName, new Error('Plugin discovery not found'));
      return null;
    }

    // Record plugin load start
    this.metricsService?.recordPluginLoadStart(pluginName);

    // Wait for all dependencies to be loaded
    await this.waitForDependencies(discovery.dependencies);

    // Load and validate the plugin
    const pluginModule = await this.importPluginModule(discovery.path);
    const manifest = discovery.manifest;

    // Create loaded plugin object for lifecycle hooks
    const loadedPlugin: LoadedPlugin = {
      manifest,
      module: null as any, // Will be set after creating dynamic module
      instance: pluginModule,
    };

    try {
      // Execute beforeLoad lifecycle hook
      await this.executeLifecycleHook(loadedPlugin, 'beforeLoad');

      // Process guards synchronously
      await this.processPluginGuards(pluginName, manifest, pluginModule);

      // Create dynamic module using existing logic but with enhanced error handling
      const dynamicModule = await this.createDynamicModuleFromPlugin(manifest, pluginModule);

      if (!dynamicModule) {
        throw new Error(`Failed to create dynamic module for plugin: ${pluginName}`);
      }

      // Set the module in the loaded plugin object
      loadedPlugin.module = dynamicModule;

      // Execute afterLoad lifecycle hook
      await this.executeLifecycleHook(loadedPlugin, 'afterLoad');

      // Register plugin for memory tracking
      this.registerPluginForMemoryTracking(manifest.name, pluginModule, loadedPlugin);

      // Record successful plugin load
      const loadTime = Date.now() - loadStartTime;
      this.metricsService?.recordPluginLoad(manifest.name, loadTime, manifest.version);

      return loadedPlugin;
    } catch (error) {
      // Record plugin load error
      this.metricsService?.recordPluginLoadError(pluginName, error as Error);

      // Execute onError lifecycle hook
      await this.executeLifecycleHook(loadedPlugin, 'onError', error);
      throw error;
    }
  }

  private async waitForDependencies(dependencies: string[]): Promise<void> {
    if (dependencies.length === 0) {
      return;
    }

    const maxWaitTime = 30000; // 30 seconds
    const pollInterval = 50; // 50ms (reduced for better responsiveness in parallel loading)
    const startTime = Date.now();

    this.logger.debug(`Waiting for dependencies: [${dependencies.join(', ')}]`);

    while (Date.now() - startTime < maxWaitTime) {
      const dependencyStates = dependencies.map((dep) => ({
        name: dep,
        state: this.loadingState.get(dep),
      }));

      const allLoaded = dependencyStates.every((dep) => dep.state === PluginLoadingState.LOADED);
      if (allLoaded) {
        this.logger.debug(`All dependencies loaded: [${dependencies.join(', ')}]`);
        return;
      }

      // Check for failed dependencies
      const failedDeps = dependencyStates.filter((dep) => dep.state === PluginLoadingState.FAILED);
      if (failedDeps.length > 0) {
        const failedNames = failedDeps.map((dep) => dep.name);
        throw new Error(`Dependencies failed to load: [${failedNames.join(', ')}]`);
      }

      // Log current dependency states for debugging
      const pendingDeps = dependencyStates.filter(
        (dep) => dep.state !== PluginLoadingState.LOADED && dep.state !== PluginLoadingState.FAILED
      );

      if (pendingDeps.length > 0) {
        const stateInfo = pendingDeps.map((dep) => `${dep.name}:${dep.state || 'unknown'}`);
        this.logger.debug(`Still waiting for dependencies: [${stateInfo.join(', ')}]`);
      }

      await this.sleep(pollInterval);
    }

    const pendingDeps = dependencies.filter((dep) => this.loadingState.get(dep) !== PluginLoadingState.LOADED);
    throw new Error(`Timeout waiting for dependencies: [${pendingDeps.join(', ')}]`);
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

  private isCriticalPlugin(pluginName: string): boolean {
    const discovery = this.discoveredPlugins.get(pluginName);
    return discovery?.manifest.critical === true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
      const resolveComponents = (componentRefs: string[] | string | undefined): any[] => {
        if (!componentRefs) return [];

        const refs = Array.isArray(componentRefs) ? componentRefs : [componentRefs];
        const components: any[] = [];

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

          components.push(component);
          this.logger.debug(`Resolved component '${ref}' for plugin '${manifest.name}'`);
        }

        return components;
      };

      // Resolve plugin components from manifest
      const controllers = resolveComponents(manifest.module.controllers);
      const providers = resolveComponents(manifest.module.providers);
      const moduleExports = resolveComponents(manifest.module.exports);
      const imports = resolveComponents(manifest.module.imports);

      // Resolve and inject only the guards specified in the manifest
      const guardProviders = await this.resolveAndCreateGuardProviders(manifest.name, manifest.module.guards || []);

      // Add guard providers to the providers array
      providers.push(...guardProviders);

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
  private async resolveAndCreateGuardProviders(pluginName: string, guardEntries: GuardEntry[]): Promise<any[]> {
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
  getPluginGuards(pluginName: string): any[] {
    return this.guardManager.getPluginGuards(pluginName);
  }

  /**
   * Get plugin loading state (for monitoring)
   */
  getPluginState(pluginName: string): PluginLoadingState | undefined {
    return this.loadingState.get(pluginName);
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
   * Extract lifecycle hooks from plugin metadata using reflection
   * @param plugin - The loaded plugin object
   * @returns Map of lifecycle hook types to their handler functions
   */
  private getPluginLifecycleHooks(plugin: LoadedPlugin): Map<PluginLifecycleHook, Function[]> {
    const hooks = new Map<PluginLifecycleHook, Function[]>();
    const lifecycleHooks: PluginLifecycleHook[] = ['beforeLoad', 'afterLoad', 'beforeUnload', 'afterUnload', 'onError'];

    // Iterate through all exported classes and objects in the plugin
    for (const [exportName, exportValue] of Object.entries(plugin.instance as Record<string, unknown>)) {
      if (!exportValue || (typeof exportValue !== 'object' && typeof exportValue !== 'function')) {
        continue;
      }

      // Check if this export has lifecycle hook methods
      const prototype = typeof exportValue === 'function' ? exportValue.prototype : exportValue;
      if (!prototype) continue;

      // Scan for methods with lifecycle hook metadata
      const methodNames = Object.getOwnPropertyNames(prototype);
      for (const methodName of methodNames) {
        if (methodName === 'constructor') continue;

        const method = prototype[methodName];
        if (typeof method !== 'function') continue;

        // Check each lifecycle hook type
        for (const hookType of lifecycleHooks) {
          const metadataKey = `plugin:hook:${hookType}`;
          const hasHook = Reflect.getMetadata(metadataKey, method);

          if (hasHook) {
            if (!hooks.has(hookType)) {
              hooks.set(hookType, []);
            }

            // Bind the method to the instance if it's a class
            let boundMethod: Function;
            if (typeof exportValue === 'function') {
              // This is a class constructor, we need an instance
              try {
                const ClassConstructor = exportValue as new () => unknown;
                const instance = new ClassConstructor();
                boundMethod = method.bind(instance);
              } catch (error) {
                this.logger.warn(
                  `Failed to instantiate class '${exportName}' for lifecycle hook '${hookType}':`,
                  error
                );
                continue;
              }
            } else {
              // This is already an instance/object
              boundMethod = method.bind(exportValue);
            }

            const hookHandlers = hooks.get(hookType);
            if (hookHandlers) {
              hookHandlers.push(boundMethod);
            }
            this.logger.debug(
              `Found lifecycle hook '${hookType}' in method '${exportName}.${methodName}' for plugin: ${plugin.manifest.name}`
            );
          }
        }
      }
    }

    const totalHooks = Array.from(hooks.values()).reduce((sum, handlers) => sum + handlers.length, 0);
    if (totalHooks > 0) {
      this.logger.debug(`Discovered ${totalHooks} lifecycle hooks for plugin: ${plugin.manifest.name}`);
    }

    return hooks;
  }

  /**
   * Register plugin for comprehensive memory tracking
   * @private
   */
  private registerPluginForMemoryTracking(pluginName: string, pluginModule: any, loadedPlugin: LoadedPlugin): void {
    try {
      // Create WeakRef for the main plugin instance
      if (pluginModule) {
        const weakRef = new WeakRef(pluginModule);
        this.pluginWeakRefs.set(pluginName, weakRef);
        this.cleanupRegistry.register(pluginModule, pluginName);
      }

      // Track all instances created by the plugin
      const instances = new Set<any>();
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
  private trackPluginInstances(pluginName: string, obj: any, instances: Set<any>): void {
    if (!obj) return;

    try {
      // Add the object itself to tracking
      instances.add(obj);

      // Track exported classes and their prototypes
      Object.values(obj).forEach((value) => {
        if (value && typeof value === 'function') {
          // This is likely a class constructor
          instances.add(value);
          if (value.prototype) {
            instances.add(value.prototype);
          }
        } else if (value && typeof value === 'object') {
          // Track object instances
          instances.add(value);
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
  registerPluginEventListener(pluginName: string, target: any, event: string, listener: Function): void {
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
          if (target && typeof target.removeEventListener === 'function') {
            target.removeEventListener(event, listener);
          } else if (target && typeof target.off === 'function') {
            target.off(event, listener);
          } else if (target && typeof target.removeListener === 'function') {
            target.removeListener(event, listener);
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
                if (instance[key] && typeof instance[key] === 'object') {
                  instance[key] = null;
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
    const pluginMemoryDetails: Record<string, any> = {};

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
  async unloadPlugin(pluginName: string): Promise<void> {
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
      this.loadingState.set(pluginName, PluginLoadingState.UNLOADED);

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

      this.logger.log(`Plugin unloaded successfully: ${pluginName}`);
    } catch (error) {
      this.logger.error(`Failed to unload plugin ${pluginName}:`, error);
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
          const localEntry = guardEntry as any;
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
          const externalEntry = guardEntry as any;

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
            if (!referencedGuard || !(referencedGuard as any).exported) {
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
  private addPluginMetadataToControllers(controllers: any[], pluginName: string): void {
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
   * Reset circuit breaker for a specific plugin
   */
  resetPluginCircuitBreaker(pluginName: string): void {
    this.circuitBreaker.resetPlugin(pluginName);
    this.logger.log(`Circuit breaker reset for plugin: ${pluginName}`);
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
   * Cleanup circuit breaker resources (called on service shutdown)
   */
  private destroyCircuitBreaker(): void {
    this.circuitBreaker.destroy();
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

// Supporting types and enums for enhanced plugin loading
enum PluginLoadingState {
  DISCOVERED = 'discovered',
  LOADING = 'loading',
  LOADED = 'loaded',
  FAILED = 'failed',
  UNLOADED = 'unloaded',
}

interface PluginDiscovery {
  name: string;
  path: string;
  manifest: PluginManifest;
  dependencies: string[];
  loadOrder: number;
}

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
