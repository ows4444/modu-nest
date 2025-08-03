import { Injectable, Logger, DynamicModule, Module } from '@nestjs/common';
import 'reflect-metadata';
import path from 'path';
import fs from 'fs';
import {
  PluginManifest,
  LoadedPlugin,
  PluginValidator,
  PluginGuardManager,
  GuardEntry,
  PluginGuardRegistryService,
  LocalGuardEntry,
} from '@modu-nest/plugin-types';
import { CrossPluginServiceManager } from './cross-plugin-service-manager';

@Injectable()
export class PluginLoaderService {
  private readonly logger = new Logger(PluginLoaderService.name);
  private loadedPlugins = new Map<string, LoadedPlugin>();
  private guardManager = new PluginGuardManager();
  private guardRegistry?: PluginGuardRegistryService;
  private loadingState = new Map<string, PluginLoadingState>();
  private discoveredPlugins = new Map<string, PluginDiscovery>();
  private crossPluginServiceManager = new CrossPluginServiceManager();

  // Security: List of unsafe modules that plugins should not use
  private readonly UNSAFE_MODULES = [
    'fs',
    'fs/promises',
    'node:fs',
    'node:fs/promises',
    'child_process',
    'node:child_process',
    'process',
    'node:process',
    'os',
    'node:os',
    'path',
    'node:path',
    'crypto',
    'node:crypto',
    'net',
    'node:net',
    'http',
    'node:http',
    'https',
    'node:https',
    'url',
    'node:url',
    'stream',
    'node:stream',
    'events',
    'node:events',
    'util',
    'node:util',
    'cluster',
    'node:cluster',
    'worker_threads',
    'node:worker_threads',
  ];

  getLoadedPlugins(): Map<string, LoadedPlugin> {
    return this.loadedPlugins;
  }

  async scanAndLoadAllPlugins(): Promise<DynamicModule[]> {
    try {
      this.logger.log('Starting plugin discovery and loading...');

      // Step 1: Discover all plugins and their manifests
      const discoveredPlugins = await this.discoverPlugins();
      this.logger.log(`Discovered ${discoveredPlugins.length} plugins`);

      // Step 2: Create dependency graph and sort topologically
      const loadOrder = this.calculateLoadOrder(discoveredPlugins);
      this.logger.log(`Plugin load order: [${loadOrder.join(', ')}]`);

      // Step 3: Load plugins in dependency order with proper synchronization
      const modules = await this.loadPluginsInOrder(loadOrder);

      this.logger.log(`Successfully loaded ${modules.length} plugins`);

      // Verify guard isolation and security
      const isolationCheck = this.verifyGuardIsolation();
      if (!isolationCheck.isSecure) {
        this.logger.error('Plugin loading completed with guard security violations - review plugin configurations');
      }

      return modules;
    } catch (error) {
      this.logger.error('Failed to load plugins:', error);
      return [];
    }
  }

  private async discoverPlugins(): Promise<PluginDiscovery[]> {
    const pluginsPath = process.env.PLUGINS_DIR || path.resolve(__dirname, 'assets', 'plugins');
    const discoveries: PluginDiscovery[] = [];

    if (!fs.existsSync(pluginsPath)) {
      this.logger.warn(`Plugins directory not found: ${pluginsPath}`);
      return discoveries;
    }

    const pluginDirs = fs
      .readdirSync(pluginsPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const pluginDir of pluginDirs) {
      try {
        const pluginPath = path.join(pluginsPath, pluginDir);
        const manifest = await this.loadManifest(pluginPath);

        const discovery: PluginDiscovery = {
          name: manifest.name,
          path: pluginPath,
          manifest,
          dependencies: manifest.dependencies || [],
          loadOrder: manifest.loadOrder || 0,
        };

        discoveries.push(discovery);
        this.discoveredPlugins.set(manifest.name, discovery);
        this.loadingState.set(manifest.name, PluginLoadingState.DISCOVERED);

        this.logger.debug(`Discovered plugin: ${manifest.name} (dependencies: [${discovery.dependencies.join(', ')}])`);
      } catch (error) {
        this.logger.error(`Failed to discover plugin ${pluginDir}:`, error);
      }
    }

    return discoveries;
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
          inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
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

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Plugin manifest not found: ${manifestPath}`);
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent) as PluginManifest;

    // Basic validation
    if (!manifest.name || !manifest.version || !manifest.module) {
      throw new Error(`Invalid plugin manifest: ${manifestPath}`);
    }

    return manifest;
  }

  private async loadPluginsInOrder(loadOrder: string[]): Promise<DynamicModule[]> {
    const dynamicModules: DynamicModule[] = [];

    for (const pluginName of loadOrder) {
      try {
        this.logger.log(`Loading plugin: ${pluginName}`);
        this.loadingState.set(pluginName, PluginLoadingState.LOADING);

        const plugin = await this.loadSinglePlugin(pluginName);
        if (plugin) {
          dynamicModules.push(plugin.module);
          this.loadedPlugins.set(pluginName, plugin);
          this.loadingState.set(pluginName, PluginLoadingState.LOADED);

          this.logger.log(`✓ Successfully loaded plugin: ${pluginName}`);
        }
      } catch (error) {
        this.loadingState.set(pluginName, PluginLoadingState.FAILED);
        this.logger.error(`Failed to load plugin ${pluginName}:`, error);

        // Decide whether to continue or fail fast
        if (this.isCriticalPlugin(pluginName)) {
          throw error;
        }
      }
    }

    return dynamicModules;
  }

  private async loadSinglePlugin(pluginName: string): Promise<LoadedPlugin | null> {
    const discovery = this.discoveredPlugins.get(pluginName);
    if (!discovery) {
      this.logger.error(`Plugin discovery not found: ${pluginName}`);
      return null;
    }

    // Wait for all dependencies to be loaded
    await this.waitForDependencies(discovery.dependencies);

    // Load and validate the plugin
    const pluginModule = await this.importPluginModule(discovery.path);
    const manifest = discovery.manifest;

    // Process guards synchronously
    await this.processPluginGuards(pluginName, manifest, pluginModule);

    // Create dynamic module using existing logic but with enhanced error handling
    const dynamicModule = await this.createDynamicModuleFromPlugin(manifest, pluginModule);

    if (!dynamicModule) {
      throw new Error(`Failed to create dynamic module for plugin: ${pluginName}`);
    }

    return {
      manifest,
      module: dynamicModule,
      instance: pluginModule,
    };
  }

  private async waitForDependencies(dependencies: string[]): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const pollInterval = 100; // 100ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const allLoaded = dependencies.every((dep) => this.loadingState.get(dep) === PluginLoadingState.LOADED);

      if (allLoaded) {
        return;
      }

      // Check for failed dependencies
      const failedDeps = dependencies.filter((dep) => this.loadingState.get(dep) === PluginLoadingState.FAILED);

      if (failedDeps.length > 0) {
        throw new Error(`Dependencies failed to load: ${failedDeps.join(', ')}`);
      }

      await this.sleep(pollInterval);
    }

    const pendingDeps = dependencies.filter((dep) => this.loadingState.get(dep) !== PluginLoadingState.LOADED);

    throw new Error(`Timeout waiting for dependencies: ${pendingDeps.join(', ')}`);
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
      // Clear require cache to ensure fresh import
      delete require.cache[require.resolve(mainPath)];

      const pluginModule = await import(mainPath);
      return pluginModule;
    } catch (error) {
      throw new Error(`Failed to import plugin module: ${error}`);
    }
  }

  private isCriticalPlugin(pluginName: string): boolean {
    const discovery = this.discoveredPlugins.get(pluginName);
    return discovery?.manifest.critical === true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * First pass: Load and validate all plugins, storing their guards centrally
   * This ensures all guards are available before any dynamic module creation
   */
  private async loadAndValidatePluginGuards(
    pluginsPath: string,
    pluginDirs: string[]
  ): Promise<Array<{ manifest: PluginManifest; pluginModule: Record<string, unknown> }>> {
    const validatedPlugins: Array<{ manifest: PluginManifest; pluginModule: Record<string, unknown> }> = [];

    for (const pluginDir of pluginDirs) {
      try {
        const pluginPath = path.join(pluginsPath, pluginDir);
        const manifestPath = path.join(pluginPath, 'plugin.manifest.json');
        const indexPath = path.join(pluginPath, 'index.js');

        // Check for required files
        if (!fs.existsSync(manifestPath)) {
          this.logger.warn(`Skipping ${pluginDir}: missing manifest file`);
          continue;
        }

        if (!fs.existsSync(indexPath)) {
          this.logger.warn(`Skipping ${pluginDir}: missing index.js file`);
          continue;
        }

        // Load and validate manifest
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PluginManifest;

        if (!manifest.name) {
          this.logger.warn(`Skipping ${pluginDir}: invalid manifest - missing name`);
          continue;
        }

        // Deep validation of manifest including guards
        const validationResult = PluginValidator.validateManifest(manifest);
        if (!validationResult.isValid) {
          this.logger.error(`Skipping ${pluginDir}: manifest validation failed:`);
          validationResult.errors.forEach((error) => this.logger.error(`  - ${error}`));
          continue;
        }

        if (validationResult.warnings.length > 0) {
          this.logger.warn(`Warnings for ${pluginDir}:`);
          validationResult.warnings.forEach((warning) => this.logger.warn(`  - ${warning}`));
        }

        this.logger.debug(`Validating plugin: ${manifest.name}`);

        // Security validation: scan for unsafe imports
        const unsafeImportResults = this.scanDirectoryForUnsafeImports(pluginPath);
        if (unsafeImportResults.length > 0) {
          this.logger.error(`Security validation failed for plugin ${manifest.name} - unsafe imports detected:`);
          for (const result of unsafeImportResults) {
            this.logger.error(`   ${result.file}: ${result.imports.join(', ')}`);
          }
          this.logger.error('   Plugins are not allowed to use Node.js system modules for security reasons.');
          continue;
        }

        // Import plugin module
        const pluginModule = await import(/* webpackIgnore: true */ indexPath);

        // Store guards in centralized manager (no global registration)
        if (manifest.module.guards && manifest.module.guards.length > 0) {
          this.logger.debug(`Storing ${manifest.module.guards.length} guards for plugin: ${manifest.name}`);
          this.guardManager.storePluginGuards(manifest.name, manifest.module.guards, pluginModule);
          this.registerPluginGuards(manifest.name, manifest.module.guards, pluginModule);
        }

        // Add to validated plugins for second pass
        validatedPlugins.push({ manifest, pluginModule });
        this.logger.debug(`✓ Validated and stored guards for plugin: ${manifest.name}`);
      } catch (error) {
        this.logger.error(`Failed to validate plugin ${pluginDir}:`, error);
      }
    }

    this.logger.log(`Phase 1 complete: Validated ${validatedPlugins.length} plugins and stored their guards`);

    // Log guard system statistics after all guards are loaded
    const guardStats = this.guardManager.getStatistics();
    this.logger.log(
      `Guard system initialized: ${guardStats.totalGuards} total guards ` + `across ${guardStats.totalPlugins} plugins`
    );

    return validatedPlugins;
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
      const crossPluginProviders = this.crossPluginServiceManager.createCrossPluginProviders(
        manifest.name,
        manifest,
        pluginModule
      );
      providers.push(...crossPluginProviders);

      // Make exported services globally available
      if (manifest.module.exports) {
        const globalProviders = this.crossPluginServiceManager.createGlobalServiceProviders(
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
      this.crossPluginServiceManager.removePluginServices(pluginName);
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
  getPluginStats() {
    const plugins = Array.from(this.loadedPlugins.values());
    const guardStats = this.guardManager.getStatistics();
    const serviceStats = this.crossPluginServiceManager.getStatistics();

    return {
      totalLoaded: plugins.length,
      pluginNames: Array.from(this.loadedPlugins.keys()),
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
    };
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
  getPluginGuards(pluginName: string) {
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
   * Unload a specific plugin
   */
  async unloadPlugin(pluginName: string): Promise<void> {
    if (this.loadedPlugins.has(pluginName)) {
      await this.guardManager.removePluginGuards(pluginName);
      this.crossPluginServiceManager.removePluginServices(pluginName);
      this.loadedPlugins.delete(pluginName);
      this.loadingState.set(pluginName, PluginLoadingState.UNLOADED);
      this.discoveredPlugins.delete(pluginName);
      this.logger.log(`Plugin unloaded: ${pluginName}`);
    }
  }

  /**
   * Verifies guard isolation and access control
   * This method ensures guards are properly isolated and cross-plugin access is controlled
   */
  verifyGuardIsolation(): {
    isSecure: boolean;
    violations: string[];
    summary: {
      totalPlugins: number;
      totalGuards: number;
      exportedGuards: number;
      externalReferences: number;
    };
  } {
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
              const availableGuard = this.guardManager.resolveGuardsForPlugin(pluginName, [dep]);
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

  private scanForUnsafeImports(filePath: string): string[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const unsafeImports: string[] = [];

    // Check for import statements and require calls
    const importRegex = /(?:import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const moduleName = match[1] || match[2];
      if (this.UNSAFE_MODULES.includes(moduleName)) {
        unsafeImports.push(moduleName);
      }
    }

    return [...new Set(unsafeImports)]; // Remove duplicates
  }

  private scanDirectoryForUnsafeImports(dirPath: string): { file: string; imports: string[] }[] {
    const results: { file: string; imports: string[] }[] = [];

    const scanRecursive = (currentPath: string) => {
      if (!fs.existsSync(currentPath)) {
        return;
      }

      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          scanRecursive(itemPath);
        } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.js'))) {
          const unsafeImports = this.scanForUnsafeImports(itemPath);
          if (unsafeImports.length > 0) {
            results.push({
              file: path.relative(dirPath, itemPath),
              imports: unsafeImports,
            });
          }
        }
      }
    };

    scanRecursive(dirPath);
    return results;
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
