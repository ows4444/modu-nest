import { Injectable, Logger } from '@nestjs/common';

export interface PluginCleanupConfig {
  trackingMode: 'minimal' | 'selective' | 'comprehensive';
  maxDepth: number;
  trackControllers: boolean;
  trackProviders: boolean;
  trackExports: boolean;
  trackImports: boolean;
  enableLazyLoading: boolean;
  trackingHints?: {
    includePatterns?: RegExp[];
    excludePatterns?: RegExp[];
    criticalExports?: string[];
  };
}

export interface PluginMemoryStats {
  lastCleanup: number;
  totalCleanupsPerformed: number;
  memoryFreedEstimate: number;
  peakMemoryUsage: number;
  pluginCount: number;
  totalInstances: number;
}

export interface PluginCleanupResult {
  pluginName: string;
  cleaned: boolean;
  error?: Error;
  resourcesFreed: {
    timers: number;
    listeners: number;
    instances: number;
    weakRefs: number;
  };
  cleanupTime: number;
}

@Injectable()
export class PluginCleanupService {
  private readonly logger = new Logger(PluginCleanupService.name);

  // Memory management tracking
  private readonly pluginWeakRefs = new Map<string, WeakRef<Record<string, unknown>>>();
  private readonly pluginTimers = new Map<string, NodeJS.Timeout[]>();
  private readonly pluginEventListeners = new Map<
    string,
    Array<{ target: EventTarget | NodeJS.EventEmitter; event: string; listener: Function }>
  >();
  private readonly pluginInstances = new Map<string, Set<object>>();

  // Configuration and optimization
  private readonly pluginTrackingConfig = new Map<string, PluginCleanupConfig>();
  private readonly lazyInstanceRefs = new Map<string, Map<string, () => object | null>>();

  // Memory optimization settings
  private readonly MEMORY_CLEANUP_CHUNK_SIZE = 10;
  private readonly MEMORY_CLEANUP_INTERVAL_MS = 30000; // 30 seconds
  private memoryCleanupTimer?: NodeJS.Timeout;
  private memoryPressureThreshold = 0.85; // 85% of heap limit

  // Memory statistics
  private memoryStats: PluginMemoryStats = {
    lastCleanup: Date.now(),
    totalCleanupsPerformed: 0,
    memoryFreedEstimate: 0,
    peakMemoryUsage: 0,
    pluginCount: 0,
    totalInstances: 0,
  };

  // Enhanced FinalizationRegistry with memory pressure tracking
  private readonly cleanupRegistry = new FinalizationRegistry((pluginName: string) => {
    this.logger.debug(`Plugin instance garbage collected: ${pluginName}`);
    this.onPluginGarbageCollected(pluginName);
  });

  constructor() {
    this.initializeMemoryCleanupTimer();
  }

  /**
   * Initializes periodic memory cleanup timer
   */
  private initializeMemoryCleanupTimer(): void {
    this.memoryCleanupTimer = setInterval(() => {
      this.performPeriodicMemoryCleanup().catch((error) => {
        this.logger.error('Periodic memory cleanup failed', error);
      });
    }, this.MEMORY_CLEANUP_INTERVAL_MS);

    this.logger.debug(`Memory cleanup timer initialized with ${this.MEMORY_CLEANUP_INTERVAL_MS}ms interval`);
  }

  /**
   * Performs cleanup for a specific plugin
   */
  async cleanupPlugin(pluginName: string): Promise<PluginCleanupResult> {
    const startTime = Date.now();
    this.logger.debug(`Starting cleanup for plugin: ${pluginName}`);

    const result: PluginCleanupResult = {
      pluginName,
      cleaned: false,
      resourcesFreed: {
        timers: 0,
        listeners: 0,
        instances: 0,
        weakRefs: 0,
      },
      cleanupTime: 0,
    };

    try {
      // Clean up timers
      result.resourcesFreed.timers = await this.cleanupPluginTimers(pluginName);

      // Clean up event listeners
      result.resourcesFreed.listeners = await this.cleanupPluginEventListeners(pluginName);

      // Clean up instances
      result.resourcesFreed.instances = await this.cleanupPluginInstances(pluginName);

      // Clean up weak references
      result.resourcesFreed.weakRefs = await this.cleanupPluginWeakRefs(pluginName);

      // Remove tracking configuration
      this.pluginTrackingConfig.delete(pluginName);
      this.lazyInstanceRefs.delete(pluginName);

      result.cleaned = true;
      result.cleanupTime = Date.now() - startTime;

      this.memoryStats.totalCleanupsPerformed++;
      this.memoryStats.lastCleanup = Date.now();

      this.logger.log(
        `Plugin cleanup completed for ${pluginName}: ${result.resourcesFreed.timers} timers, ` +
          `${result.resourcesFreed.listeners} listeners, ${result.resourcesFreed.instances} instances, ` +
          `${result.resourcesFreed.weakRefs} weak refs freed in ${result.cleanupTime}ms`
      );
    } catch (error) {
      result.error = error as Error;
      result.cleanupTime = Date.now() - startTime;
      this.logger.error(`Plugin cleanup failed for ${pluginName}`, error);
    }

    return result;
  }

  /**
   * Performs cleanup for multiple plugins in chunks
   */
  async cleanupMultiplePlugins(pluginNames: string[]): Promise<PluginCleanupResult[]> {
    this.logger.log(`Starting cleanup for ${pluginNames.length} plugins`);
    const results: PluginCleanupResult[] = [];

    // Process plugins in chunks to avoid overwhelming the system
    for (let i = 0; i < pluginNames.length; i += this.MEMORY_CLEANUP_CHUNK_SIZE) {
      const chunk = pluginNames.slice(i, i + this.MEMORY_CLEANUP_CHUNK_SIZE);

      const chunkPromises = chunk.map((pluginName) => this.cleanupPlugin(pluginName));
      const chunkResults = await Promise.allSettled(chunkPromises);

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          this.logger.error('Plugin cleanup promise rejected', result.reason);
        }
      }

      // Small delay between chunks to prevent blocking
      if (i + this.MEMORY_CLEANUP_CHUNK_SIZE < pluginNames.length) {
        await this.sleep(100);
      }
    }

    return results;
  }

  /**
   * Tracks a plugin instance for cleanup
   */
  trackPluginInstance(pluginName: string, instance: object, config?: PluginCleanupConfig): void {
    // Set tracking configuration
    if (config) {
      this.pluginTrackingConfig.set(pluginName, config);
    }

    // Track the instance
    if (!this.pluginInstances.has(pluginName)) {
      this.pluginInstances.set(pluginName, new Set());
    }

    const pluginInstanceSet = this.pluginInstances.get(pluginName);
    if (pluginInstanceSet) {
      pluginInstanceSet.add(instance);
    }

    // Register for garbage collection tracking
    this.cleanupRegistry.register(instance, pluginName);

    // Update statistics
    this.memoryStats.totalInstances++;

    this.logger.debug(`Tracking instance for plugin: ${pluginName}`);
  }

  /**
   * Tracks a timer for a plugin
   */
  trackPluginTimer(pluginName: string, timer: NodeJS.Timeout): void {
    if (!this.pluginTimers.has(pluginName)) {
      this.pluginTimers.set(pluginName, []);
    }

    const pluginTimerArray = this.pluginTimers.get(pluginName);
    if (pluginTimerArray) {
      pluginTimerArray.push(timer);
    }
    this.logger.debug(`Tracking timer for plugin: ${pluginName}`);
  }

  /**
   * Tracks an event listener for a plugin
   */
  trackPluginEventListener(
    pluginName: string,
    target: EventTarget | NodeJS.EventEmitter,
    event: string,
    listener: Function
  ): void {
    if (!this.pluginEventListeners.has(pluginName)) {
      this.pluginEventListeners.set(pluginName, []);
    }

    const pluginListenerArray = this.pluginEventListeners.get(pluginName);
    if (pluginListenerArray) {
      pluginListenerArray.push({ target, event, listener });
    }
    this.logger.debug(`Tracking event listener for plugin: ${pluginName}, event: ${event}`);
  }

  /**
   * Gets memory statistics
   */
  getMemoryStats(): PluginMemoryStats {
    return {
      ...this.memoryStats,
      pluginCount: this.pluginInstances.size,
    };
  }

  /**
   * Checks if memory pressure is high
   */
  isMemoryPressureHigh(): boolean {
    const used = process.memoryUsage();
    const heapUsedRatio = used.heapUsed / used.heapTotal;
    return heapUsedRatio > this.memoryPressureThreshold;
  }

  /**
   * Forces immediate memory cleanup
   */
  async forceMemoryCleanup(): Promise<void> {
    this.logger.log('Forcing immediate memory cleanup');
    await this.performPeriodicMemoryCleanup();
  }

  /**
   * Shuts down the cleanup service
   */
  async shutdown(): Promise<void> {
    this.logger.log('Shutting down plugin cleanup service');

    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer);
      this.memoryCleanupTimer = undefined;
    }

    // Clean up all remaining plugins
    const pluginNames = Array.from(this.pluginInstances.keys());
    if (pluginNames.length > 0) {
      await this.cleanupMultiplePlugins(pluginNames);
    }
  }

  // Private cleanup methods

  private async cleanupPluginTimers(pluginName: string): Promise<number> {
    const timers = this.pluginTimers.get(pluginName);
    if (!timers || timers.length === 0) return 0;

    let clearedCount = 0;
    for (const timer of timers) {
      try {
        clearTimeout(timer);
        clearInterval(timer);
        clearedCount++;
      } catch (error) {
        this.logger.warn(`Failed to clear timer for plugin ${pluginName}`, error);
      }
    }

    this.pluginTimers.delete(pluginName);
    return clearedCount;
  }

  private async cleanupPluginEventListeners(pluginName: string): Promise<number> {
    const listeners = this.pluginEventListeners.get(pluginName);
    if (!listeners || listeners.length === 0) return 0;

    let removedCount = 0;
    for (const { target, event, listener } of listeners) {
      try {
        if ('removeEventListener' in target) {
          (target as EventTarget).removeEventListener(event, listener as (event: Event) => void);
        } else if ('removeListener' in target) {
          (target as NodeJS.EventEmitter).removeListener(event, listener as (...args: unknown[]) => void);
        } else if ('off' in target && typeof (target as Record<string, unknown>).off === 'function') {
          ((target as Record<string, unknown>).off as Function)(event, listener);
        }
        removedCount++;
      } catch (error) {
        this.logger.warn(`Failed to remove event listener for plugin ${pluginName}`, error);
      }
    }

    this.pluginEventListeners.delete(pluginName);
    return removedCount;
  }

  private async cleanupPluginInstances(pluginName: string): Promise<number> {
    const instances = this.pluginInstances.get(pluginName);
    if (!instances || instances.size === 0) return 0;

    const instanceCount = instances.size;

    // Clear the set to release references
    instances.clear();
    this.pluginInstances.delete(pluginName);

    this.memoryStats.totalInstances = Math.max(0, this.memoryStats.totalInstances - instanceCount);

    return instanceCount;
  }

  private async cleanupPluginWeakRefs(pluginName: string): Promise<number> {
    const weakRef = this.pluginWeakRefs.get(pluginName);
    if (!weakRef) return 0;

    this.pluginWeakRefs.delete(pluginName);
    return 1;
  }

  private async performPeriodicMemoryCleanup(): Promise<void> {
    try {
      // Check for dead weak references and clean them up
      let cleanedWeakRefs = 0;
      for (const [pluginName, weakRef] of this.pluginWeakRefs) {
        if (weakRef.deref() === undefined) {
          this.pluginWeakRefs.delete(pluginName);
          cleanedWeakRefs++;
        }
      }

      if (cleanedWeakRefs > 0) {
        this.logger.debug(`Cleaned up ${cleanedWeakRefs} dead weak references`);
      }

      // Force garbage collection if memory pressure is high
      if (this.isMemoryPressureHigh() && global.gc) {
        this.logger.debug('High memory pressure detected, forcing garbage collection');
        global.gc();
      }

      this.memoryStats.lastCleanup = Date.now();
    } catch (error) {
      this.logger.error('Periodic memory cleanup error', error);
    }
  }

  private onPluginGarbageCollected(pluginName: string): void {
    // Clean up any remaining references when plugin is garbage collected
    this.pluginTimers.delete(pluginName);
    this.pluginEventListeners.delete(pluginName);
    this.pluginInstances.delete(pluginName);
    this.pluginWeakRefs.delete(pluginName);

    this.logger.debug(`Cleaned up references for garbage collected plugin: ${pluginName}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
