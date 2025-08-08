import { Injectable, Logger } from '@nestjs/common';
import 'reflect-metadata';
import { LoadedPlugin, PluginLifecycleHook, PluginManifest } from '@modu-nest/plugin-types';

export interface LifecycleHookMetadata {
  hookType: PluginLifecycleHook;
  methodName: string;
  exportName: string;
  isAsync: boolean;
  timeout?: number;
  priority?: number;
}

export interface PluginHookRegistry {
  pluginName: string;
  hooks: Map<PluginLifecycleHook, BoundLifecycleHook[]>;
  metadata: LifecycleHookMetadata[];
  cacheTime: Date;
}

export interface BoundLifecycleHook {
  handler: Function;
  metadata: LifecycleHookMetadata;
  boundInstance?: unknown;
}

@Injectable()
export class PluginLifecycleHookDiscoveryService {
  private readonly logger = new Logger(PluginLifecycleHookDiscoveryService.name);

  // Cache discovered hooks to avoid repeated reflection
  private readonly hookCache = new Map<string, PluginHookRegistry>();

  // Supported lifecycle hook types
  private readonly supportedHooks: PluginLifecycleHook[] = [
    'beforeLoad',
    'afterLoad',
    'beforeUnload',
    'afterUnload',
    'onError',
  ];

  /**
   * Discover and cache lifecycle hooks for a plugin
   */
  discoverHooks(plugin: LoadedPlugin): Map<PluginLifecycleHook, BoundLifecycleHook[]> {
    const pluginName = plugin.manifest.name;

    // Check cache first
    const cached = this.hookCache.get(pluginName);
    if (cached && this.isCacheValid(cached, plugin.manifest)) {
      this.logger.debug(`Using cached lifecycle hooks for plugin: ${pluginName}`);
      return cached.hooks;
    }

    // Discover hooks using optimized approach
    const discoveredHooks = this.performHookDiscovery(plugin);

    // Cache the discovered hooks
    this.cacheHooks(pluginName, discoveredHooks, plugin.manifest);

    return discoveredHooks;
  }

  /**
   * Pre-process lifecycle hooks from manifest metadata (if available)
   */
  processManifestHooks(plugin: LoadedPlugin): Map<PluginLifecycleHook, BoundLifecycleHook[]> {
    const pluginName = plugin.manifest.name;

    // Check if manifest contains pre-processed hook metadata
    if (plugin.manifest.events?.lifecycle) {
      return this.loadHooksFromManifest(plugin);
    }

    // Fall back to reflection-based discovery
    return this.discoverHooks(plugin);
  }

  /**
   * Load hooks from manifest metadata (future enhancement)
   */
  private loadHooksFromManifest(plugin: LoadedPlugin): Map<PluginLifecycleHook, BoundLifecycleHook[]> {
    const hooks = new Map<PluginLifecycleHook, BoundLifecycleHook[]>();
    const manifest = plugin.manifest;

    // This would be populated during build phase
    const lifecycleConfig = manifest.events?.lifecycle;
    if (!lifecycleConfig) {
      return this.performHookDiscovery(plugin);
    }

    // For now, fall back to discovery since build-time preprocessing isn't implemented yet
    // Future: Parse pre-built hook metadata from manifest
    this.logger.debug(`Manifest-based hook loading not yet implemented for: ${plugin.manifest.name}`);
    return this.performHookDiscovery(plugin);
  }

  /**
   * Perform optimized lifecycle hook discovery using reflection
   */
  private performHookDiscovery(plugin: LoadedPlugin): Map<PluginLifecycleHook, BoundLifecycleHook[]> {
    const hooks = new Map<PluginLifecycleHook, BoundLifecycleHook[]>();
    const metadata: LifecycleHookMetadata[] = [];

    if (!plugin.instance || typeof plugin.instance !== 'object') {
      this.logger.warn(`Plugin ${plugin.manifest.name} has no valid instance for hook discovery`);
      return hooks;
    }

    const instance = plugin.instance as Record<string, unknown>;

    // Optimized discovery: focus on likely hook locations
    const exportEntries = Object.entries(instance);

    for (const [exportName, exportValue] of exportEntries) {
      if (this.shouldSkipExport(exportValue)) {
        continue;
      }

      const discoveredHooks = this.scanExportForHooks(exportName, exportValue);
      this.bindAndRegisterHooks(discoveredHooks, hooks, metadata, plugin.manifest.name);
    }

    this.logDiscoveryResults(plugin.manifest.name, hooks, metadata);
    return hooks;
  }

  /**
   * Check if export should be skipped during hook discovery
   */
  private shouldSkipExport(exportValue: unknown): boolean {
    if (!exportValue) return true;
    if (typeof exportValue !== 'object' && typeof exportValue !== 'function') return true;

    // Skip common non-hook exports
    if (typeof exportValue === 'string' || typeof exportValue === 'number' || typeof exportValue === 'boolean') {
      return true;
    }

    return false;
  }

  /**
   * Scan a specific export for lifecycle hooks
   */
  private scanExportForHooks(exportName: string, exportValue: unknown): LifecycleHookMetadata[] {
    const discoveredHooks: LifecycleHookMetadata[] = [];

    // Get the prototype or object to scan
    const target = typeof exportValue === 'function' ? exportValue.prototype : exportValue;
    if (!target || typeof target !== 'object') {
      return discoveredHooks;
    }

    // Get all method names efficiently
    const methodNames = this.getAllMethodNames(target);

    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;

      try {
        const method = (target as any)[methodName];
        if (typeof method !== 'function') continue;

        // Check for lifecycle hook metadata
        const hookMetadata = this.extractHookMetadata(method, methodName, exportName);
        if (hookMetadata) {
          discoveredHooks.push(hookMetadata);
        }
      } catch (error) {
        this.logger.warn(`Error scanning method ${exportName}.${methodName}:`, error);
      }
    }

    return discoveredHooks;
  }

  /**
   * Get all method names from an object/prototype efficiently
   */
  private getAllMethodNames(obj: object): string[] {
    const names = new Set<string>();

    // Get own property names
    Object.getOwnPropertyNames(obj).forEach((name) => names.add(name));

    // Walk the prototype chain (but limit depth to avoid going too deep)
    let current = Object.getPrototypeOf(obj);
    let depth = 0;
    while (current && depth < 3) {
      // Limit depth to 3 levels
      Object.getOwnPropertyNames(current).forEach((name) => names.add(name));
      current = Object.getPrototypeOf(current);
      depth++;
    }

    return Array.from(names);
  }

  /**
   * Extract hook metadata from a method
   */
  private extractHookMetadata(method: Function, methodName: string, exportName: string): LifecycleHookMetadata | null {
    for (const hookType of this.supportedHooks) {
      const metadataKey = `plugin:hook:${hookType}`;
      const hasHook = Reflect.getMetadata(metadataKey, method);

      if (hasHook) {
        return {
          hookType,
          methodName,
          exportName,
          isAsync: this.isAsyncFunction(method),
          timeout: this.getHookTimeout(method, hookType),
          priority: this.getHookPriority(method),
        };
      }
    }

    return null;
  }

  /**
   * Check if a function is async
   */
  private isAsyncFunction(fn: Function): boolean {
    return fn.constructor.name === 'AsyncFunction' || fn.toString().startsWith('async ');
  }

  /**
   * Get hook timeout from metadata
   */
  private getHookTimeout(method: Function, hookType: PluginLifecycleHook): number | undefined {
    const timeoutKey = `plugin:hook:${hookType}:timeout`;
    return Reflect.getMetadata(timeoutKey, method);
  }

  /**
   * Get hook priority from metadata
   */
  private getHookPriority(method: Function): number | undefined {
    const priorityKey = `plugin:hook:priority`;
    return Reflect.getMetadata(priorityKey, method) || 0;
  }

  /**
   * Bind discovered hooks to their instances and register them
   */
  private bindAndRegisterHooks(
    discoveredHooks: LifecycleHookMetadata[],
    hooks: Map<PluginLifecycleHook, BoundLifecycleHook[]>,
    metadata: LifecycleHookMetadata[],
    pluginName: string
  ): void {
    for (const hookMeta of discoveredHooks) {
      try {
        const boundHook = this.createBoundHook(hookMeta, pluginName);
        if (boundHook) {
          this.registerBoundHook(hooks, boundHook);
          metadata.push(hookMeta);
        }
      } catch (error) {
        this.logger.warn(`Failed to bind hook ${hookMeta.exportName}.${hookMeta.methodName}:`, error);
      }
    }
  }

  /**
   * Create a bound hook from metadata
   */
  private createBoundHook(hookMeta: LifecycleHookMetadata, pluginName: string): BoundLifecycleHook | null {
    // This is a simplified version - in practice you'd need access to the actual instances
    // For now, we'll store the metadata and bind during execution
    return {
      handler: () => {
        throw new Error('Hook binding not implemented - use reflection fallback');
      },
      metadata: hookMeta,
      boundInstance: null,
    };
  }

  /**
   * Register a bound hook in the hooks map
   */
  private registerBoundHook(
    hooks: Map<PluginLifecycleHook, BoundLifecycleHook[]>,
    boundHook: BoundLifecycleHook
  ): void {
    const hookType = boundHook.metadata.hookType;

    if (!hooks.has(hookType)) {
      hooks.set(hookType, []);
    }

    const hookList = hooks.get(hookType)!;
    hookList.push(boundHook);

    // Sort by priority if specified
    hookList.sort((a, b) => (b.metadata.priority || 0) - (a.metadata.priority || 0));
  }

  /**
   * Cache discovered hooks
   */
  private cacheHooks(
    pluginName: string,
    hooks: Map<PluginLifecycleHook, BoundLifecycleHook[]>,
    manifest: PluginManifest
  ): void {
    const metadata = this.extractMetadataFromHooks(hooks);

    this.hookCache.set(pluginName, {
      pluginName,
      hooks,
      metadata,
      cacheTime: new Date(),
    });

    this.logger.debug(`Cached lifecycle hooks for plugin: ${pluginName}`);
  }

  /**
   * Extract metadata from bound hooks
   */
  private extractMetadataFromHooks(hooks: Map<PluginLifecycleHook, BoundLifecycleHook[]>): LifecycleHookMetadata[] {
    const metadata: LifecycleHookMetadata[] = [];

    for (const [_, boundHooks] of hooks) {
      for (const boundHook of boundHooks) {
        metadata.push(boundHook.metadata);
      }
    }

    return metadata;
  }

  /**
   * Check if cached hooks are still valid
   */
  private isCacheValid(cached: PluginHookRegistry, manifest: PluginManifest): boolean {
    // Cache for 30 minutes by default
    const cacheAge = Date.now() - cached.cacheTime.getTime();
    const maxCacheAge = 30 * 60 * 1000;

    if (cacheAge > maxCacheAge) {
      return false;
    }

    // Additional validation could check manifest version, file modification time, etc.
    return true;
  }

  /**
   * Log discovery results
   */
  private logDiscoveryResults(
    pluginName: string,
    hooks: Map<PluginLifecycleHook, BoundLifecycleHook[]>,
    metadata: LifecycleHookMetadata[]
  ): void {
    const totalHooks = Array.from(hooks.values()).reduce((sum, handlers) => sum + handlers.length, 0);

    if (totalHooks > 0) {
      this.logger.debug(
        `Discovered ${totalHooks} lifecycle hook(s) for plugin '${pluginName}': ${Array.from(hooks.keys()).join(', ')}`
      );
    }
  }

  /**
   * Get cached hooks for a plugin
   */
  getCachedHooks(pluginName: string): PluginHookRegistry | null {
    return this.hookCache.get(pluginName) || null;
  }

  /**
   * Clear hook cache for a plugin
   */
  clearHookCache(pluginName: string): void {
    this.hookCache.delete(pluginName);
    this.logger.debug(`Cleared hook cache for plugin: ${pluginName}`);
  }

  /**
   * Clear all hook caches
   */
  clearAllHookCaches(): void {
    this.hookCache.clear();
    this.logger.debug('Cleared all hook caches');
  }

  /**
   * Get hook discovery statistics
   */
  getDiscoveryStats(): {
    cachedPlugins: number;
    totalHooks: number;
    hooksByType: Record<PluginLifecycleHook, number>;
  } {
    const stats = {
      cachedPlugins: this.hookCache.size,
      totalHooks: 0,
      hooksByType: {} as Record<PluginLifecycleHook, number>,
    };

    // Initialize hook type counters
    for (const hookType of this.supportedHooks) {
      stats.hooksByType[hookType] = 0;
    }

    // Count hooks
    for (const registry of this.hookCache.values()) {
      for (const [hookType, boundHooks] of registry.hooks) {
        const count = boundHooks.length;
        stats.totalHooks += count;
        stats.hooksByType[hookType] += count;
      }
    }

    return stats;
  }
}
