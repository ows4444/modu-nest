import { Injectable, Logger, DynamicModule, Type } from '@nestjs/common';
import { createRequire } from 'module';
import path from 'path';
import { PluginManifest, LoadedPlugin } from '@plugin/core';
import { PluginDiscovery } from './plugin-discovery.service';
import { PluginEventEmitter } from '@plugin/services';

export enum PluginState {
  INITIALIZING = 'initializing',
  LOADING = 'loading',
  LOADED = 'loaded',
  FAILED = 'failed',
  UNLOADED = 'unloaded',
}

// Simple state machine for plugin states
class PluginStateMachine {
  private states = new Map<string, PluginState>();

  transition(pluginName: string, newState: PluginState): void {
    const oldState = this.states.get(pluginName);
    this.states.set(pluginName, newState);
    console.log(`Plugin ${pluginName} transitioned from ${oldState} to ${newState}`);
  }

  getState(pluginName: string): PluginState | null {
    return this.states.get(pluginName) || null;
  }
}

export interface PluginInstantiationError {
  pluginName: string;
  error: Error;
  timestamp: Date;
  phase: 'MODULE_LOADING' | 'MODULE_CREATION' | 'DEPENDENCY_INJECTION' | 'INITIALIZATION';
  details?: {
    stackTrace?: string;
    modulePath?: string;
    missingDependencies?: string[];
  };
}

export interface PluginInstantiationResult {
  successful: DynamicModule[];
  failed: PluginInstantiationError[];
  totalAttempted: number;
  instantiationTime: number;
}

@Injectable()
export class PluginInstantiationService {
  private readonly logger = new Logger(PluginInstantiationService.name);
  private readonly loadedPlugins = new Map<string, LoadedPlugin>();
  private readonly stateMachine = new PluginStateMachine();
  private readonly eventEmitter: PluginEventEmitter;

  constructor(eventEmitter: PluginEventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  /**
   * Instantiates plugins from discovered plugin data in the specified load order
   */
  async instantiatePlugins(discoveries: PluginDiscovery[], loadOrder: string[]): Promise<PluginInstantiationResult> {
    const startTime = Date.now();
    this.logger.log(`Starting plugin instantiation for ${loadOrder.length} plugins`);

    const successful: DynamicModule[] = [];
    const failed: PluginInstantiationError[] = [];
    const discoveryMap = new Map(discoveries.map((d) => [d.name, d]));

    for (const pluginName of loadOrder) {
      const discovery = discoveryMap.get(pluginName);
      if (!discovery) {
        this.logger.warn(`Plugin ${pluginName} not found in discoveries, skipping`);
        continue;
      }

      try {
        this.logger.debug(`Instantiating plugin: ${pluginName}`);
        this.stateMachine.transition(pluginName, PluginState.LOADING);

        const dynamicModule = await this.instantiateSinglePlugin(discovery);
        successful.push(dynamicModule);

        this.stateMachine.transition(pluginName, PluginState.LOADED);
        this.logger.log(`Successfully instantiated plugin: ${pluginName}`);
      } catch (error) {
        const instantiationError = this.createInstantiationError(pluginName, error as Error, 'MODULE_LOADING');
        failed.push(instantiationError);

        this.stateMachine.transition(pluginName, PluginState.FAILED);
        this.logger.error(`Failed to instantiate plugin: ${pluginName}`, error);
      }
    }

    const result: PluginInstantiationResult = {
      successful,
      failed,
      totalAttempted: loadOrder.length,
      instantiationTime: Date.now() - startTime,
    };

    this.logger.log(`Plugin instantiation completed: ${successful.length} successful, ${failed.length} failed`);

    return result;
  }

  /**
   * Instantiates a single plugin and creates its dynamic module
   */
  private async instantiateSinglePlugin(discovery: PluginDiscovery): Promise<DynamicModule> {
    const { name, path: pluginPath, manifest } = discovery;

    try {
      // Load the plugin module
      const pluginModule = await this.loadPluginModule(pluginPath, manifest);

      // Create the dynamic module
      const dynamicModule = await this.createDynamicModule(pluginModule, manifest, name);

      // Store the loaded plugin
      const loadedPlugin: LoadedPlugin = {
        manifest,
        module: pluginModule,
        instance: dynamicModule,
      };

      this.loadedPlugins.set(name, loadedPlugin);

      // Emit plugin loaded event
      if (this.eventEmitter.emitPluginLoaded) {
        this.eventEmitter.emitPluginLoaded(name, manifest.version);
      }

      return dynamicModule;
    } catch (error) {
      this.logger.error(`Failed to instantiate plugin ${name}`, error);
      throw error;
    }
  }

  /**
   * Loads the plugin module from the file system
   */
  private async loadPluginModule(pluginPath: string, manifest: PluginManifest): Promise<Type<any>> {
    const require = createRequire(__filename);
    const pluginMainPath = path.resolve(pluginPath, (manifest as any).main || 'index.js');

    try {
      // Clear require cache to allow hot reloading
      delete require.cache[require.resolve(pluginMainPath)];

      const pluginExports = require(pluginMainPath);

      // Get the main module class
      const ModuleClass = pluginExports[(manifest as any).moduleClass || 'default'] || pluginExports.default;

      if (!ModuleClass) {
        throw new Error(
          `Module class not found in ${pluginMainPath}. Expected: ${(manifest as any).moduleClass || 'default'}`
        );
      }

      if (typeof ModuleClass !== 'function') {
        throw new Error(`Module class must be a constructor function, got ${typeof ModuleClass}`);
      }

      return ModuleClass;
    } catch (error) {
      throw new Error(`Failed to load plugin module from ${pluginMainPath}: ${(error as Error).message}`);
    }
  }

  /**
   * Creates a NestJS dynamic module from the plugin module class
   */
  private async createDynamicModule(
    ModuleClass: Type<any>,
    manifest: PluginManifest,
    pluginName: string
  ): Promise<DynamicModule> {
    try {
      // Check if the module has a forRoot or register method for dynamic configuration
      if (typeof (ModuleClass as any).forRoot === 'function') {
        const moduleConfig = (manifest as any).config || {};
        return (ModuleClass as any).forRoot(moduleConfig);
      }

      if (typeof (ModuleClass as any).register === 'function') {
        const moduleConfig = (manifest as any).config || {};
        return (ModuleClass as any).register(moduleConfig);
      }

      // Create a basic dynamic module
      const dynamicModule: DynamicModule = {
        module: ModuleClass,
        global: (manifest as any).global || false,
      };

      // Add providers if specified in manifest
      if ((manifest as any).providers && (manifest as any).providers.length > 0) {
        dynamicModule.providers = (manifest as any).providers;
      }

      // Add exports if specified in manifest
      if ((manifest as any).exports && (manifest as any).exports.length > 0) {
        dynamicModule.exports = (manifest as any).exports;
      }

      // Add controllers if specified in manifest
      if ((manifest as any).controllers && (manifest as any).controllers.length > 0) {
        dynamicModule.controllers = (manifest as any).controllers;
      }

      return dynamicModule;
    } catch (error) {
      throw new Error(`Failed to create dynamic module for plugin ${pluginName}: ${(error as Error).message}`);
    }
  }

  /**
   * Gets a loaded plugin by name
   */
  getLoadedPlugin(name: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(name);
  }

  /**
   * Gets all loaded plugins
   */
  getAllLoadedPlugins(): Map<string, LoadedPlugin> {
    return new Map(this.loadedPlugins);
  }

  /**
   * Checks if a plugin is loaded
   */
  isPluginLoaded(name: string): boolean {
    return this.loadedPlugins.has(name);
  }

  /**
   * Unloads a specific plugin
   */
  async unloadPlugin(name: string): Promise<boolean> {
    const loadedPlugin = this.loadedPlugins.get(name);
    if (!loadedPlugin) {
      this.logger.warn(`Plugin ${name} is not loaded, cannot unload`);
      return false;
    }

    try {
      // Emit plugin unloading event
      if (this.eventEmitter.emitPluginUnloaded) {
        this.eventEmitter.emitPluginUnloaded(name);
      }

      // Remove from loaded plugins
      this.loadedPlugins.delete(name);

      // Transition to unloaded state
      this.stateMachine.transition(name, PluginState.UNLOADED);

      this.logger.log(`Successfully unloaded plugin: ${name}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to unload plugin ${name}`, error);
      this.stateMachine.transition(name, PluginState.FAILED);
      return false;
    }
  }

  /**
   * Creates an instantiation error with detailed information
   */
  private createInstantiationError(
    pluginName: string,
    error: Error,
    phase: PluginInstantiationError['phase']
  ): PluginInstantiationError {
    const details: PluginInstantiationError['details'] = {
      stackTrace: error.stack,
    };

    // Extract additional details based on error message
    if (error.message.includes('Cannot find module')) {
      phase = 'MODULE_LOADING';
      const match = error.message.match(/'([^']+)'/);
      if (match) {
        details.modulePath = match[1];
      }
    } else if (error.message.includes('Module class not found')) {
      phase = 'MODULE_CREATION';
    } else if (error.message.includes('dependency')) {
      phase = 'DEPENDENCY_INJECTION';
      // Try to extract missing dependencies from error message
      const depMatches = error.message.match(/dependency\s+([A-Z_][A-Z0-9_]*)/gi);
      if (depMatches) {
        details.missingDependencies = depMatches;
      }
    }

    return {
      pluginName,
      error,
      timestamp: new Date(),
      phase,
      details,
    };
  }

  /**
   * Gets plugin state for a specific plugin
   */
  getPluginState(name: string): PluginState | null {
    return this.stateMachine.getState(name);
  }

  /**
   * Gets statistics about loaded plugins
   */
  getLoadingStatistics(): {
    totalLoaded: number;
    pluginsByState: Map<PluginState, string[]>;
    averageLoadTime?: number;
  } {
    const pluginsByState = new Map<PluginState, string[]>();

    for (const [name] of this.loadedPlugins) {
      const state = this.getPluginState(name) || PluginState.LOADED;
      const existing = pluginsByState.get(state) || [];
      existing.push(name);
      pluginsByState.set(state, existing);
    }

    return {
      totalLoaded: this.loadedPlugins.size,
      pluginsByState,
    };
  }
}
