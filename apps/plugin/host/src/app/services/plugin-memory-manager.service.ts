import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

export interface MemoryManagerConfig {
  cleanupIntervalMs: number;
  memoryPressureThreshold: number;
  chunkSize: number;
  enableAggressive: boolean;
}

export interface PluginMemoryStats {
  totalWeakRefs: number;
  totalTimers: number;
  totalEventListeners: number;
  totalInstances: number;
  memoryPressure: number;
  lastCleanup: Date;
}

export interface MemoryCleanupResult {
  clearedWeakRefs: number;
  clearedTimers: number;
  clearedEventListeners: number;
  clearedInstances: number;
  memoryFreed: number;
  duration: number;
}

/**
 * Manages plugin memory lifecycle, cleanup, and monitoring
 * Extracted from the massive legacy PluginLoaderService
 */
@Injectable()
export class PluginMemoryManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(PluginMemoryManagerService.name);

  // Memory management for plugin cleanup - optimized with chunking and lazy cleanup
  private readonly pluginWeakRefs = new Map<string, WeakRef<Record<string, unknown>>>();
  private readonly pluginTimers = new Map<string, NodeJS.Timeout[]>();
  private readonly pluginEventListeners = new Map<
    string,
    Array<{
      target: EventTarget | NodeJS.EventEmitter;
      event: string;
      listener: Function;
    }>
  >();
  private readonly pluginInstances = new Map<string, Set<object>>();

  private config: MemoryManagerConfig = {
    cleanupIntervalMs: 30000, // 30 seconds
    memoryPressureThreshold: 0.85, // 85% of heap limit
    chunkSize: 10,
    enableAggressive: false,
  };

  private memoryCleanupTimer?: NodeJS.Timeout;
  private lastMemoryStats: PluginMemoryStats;

  constructor() {
    this.lastMemoryStats = this.getCurrentMemoryStats();
    this.startMemoryCleanupTimer();
  }

  onModuleDestroy(): void {
    this.stopMemoryCleanupTimer();
    this.cleanupAllPluginMemory().catch((error) =>
      this.logger.error('Error during module destruction cleanup:', error)
    );
  }

  /**
   * Register weak reference for memory tracking
   */
  registerWeakRef(pluginName: string, obj: Record<string, unknown>): void {
    this.pluginWeakRefs.set(pluginName, new WeakRef(obj));
    this.logger.debug(`Registered weak reference for plugin: ${pluginName}`);
  }

  /**
   * Register timer for cleanup tracking
   */
  registerTimer(pluginName: string, timer: NodeJS.Timeout): void {
    let timers = this.pluginTimers.get(pluginName);
    if (!timers) {
      timers = [];
      this.pluginTimers.set(pluginName, timers);
    }
    timers.push(timer);
    this.logger.debug(`Registered timer for plugin: ${pluginName}`);
  }

  /**
   * Register event listener for cleanup tracking
   */
  registerEventListener(
    pluginName: string,
    target: EventTarget | NodeJS.EventEmitter,
    event: string,
    listener: Function
  ): void {
    let listeners = this.pluginEventListeners.get(pluginName);
    if (!listeners) {
      listeners = [];
      this.pluginEventListeners.set(pluginName, listeners);
    }

    listeners.push({ target, event, listener });
    this.logger.debug(`Registered event listener for plugin: ${pluginName}, event: ${event}`);
  }

  /**
   * Register instance for memory tracking
   */
  registerInstance(pluginName: string, instance: object): void {
    let instances = this.pluginInstances.get(pluginName);
    if (!instances) {
      instances = new Set();
      this.pluginInstances.set(pluginName, instances);
    }
    instances.add(instance);
    this.logger.debug(`Registered instance for plugin: ${pluginName}`);
  }

  /**
   * Clean up all memory resources for a specific plugin
   */
  async cleanupPluginMemory(pluginName: string): Promise<MemoryCleanupResult> {
    const startTime = Date.now();
    let clearedWeakRefs = 0;
    let clearedTimers = 0;
    let clearedEventListeners = 0;
    let clearedInstances = 0;

    try {
      // Clear weak references
      if (this.pluginWeakRefs.has(pluginName)) {
        this.pluginWeakRefs.delete(pluginName);
        clearedWeakRefs = 1;
      }

      // Clear timers
      const timers = this.pluginTimers.get(pluginName);
      if (timers) {
        for (const timer of timers) {
          clearTimeout(timer);
          clearInterval(timer);
          clearedTimers++;
        }
        this.pluginTimers.delete(pluginName);
      }

      // Clear event listeners
      const listeners = this.pluginEventListeners.get(pluginName);
      if (listeners) {
        for (const { target, event, listener } of listeners) {
          try {
            if ('removeEventListener' in target) {
              (target as EventTarget).removeEventListener(event, listener as any);
            } else if ('removeListener' in target) {
              (target as NodeJS.EventEmitter).removeListener(event, listener as (...args: any[]) => void);
            }
            clearedEventListeners++;
          } catch (error) {
            this.logger.warn(`Failed to remove event listener for ${pluginName}:`, error);
          }
        }
        this.pluginEventListeners.delete(pluginName);
      }

      // Clear instances
      const instances = this.pluginInstances.get(pluginName);
      if (instances) {
        clearedInstances = instances.size;
        instances.clear();
        this.pluginInstances.delete(pluginName);
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Cleaned up memory for plugin ${pluginName}: ` +
          `${clearedWeakRefs} refs, ${clearedTimers} timers, ` +
          `${clearedEventListeners} listeners, ${clearedInstances} instances in ${duration}ms`
      );

      return {
        clearedWeakRefs,
        clearedTimers,
        clearedEventListeners,
        clearedInstances,
        memoryFreed: 0, // Actual memory freed calculation would require process.memoryUsage()
        duration,
      };
    } catch (error) {
      this.logger.error(`Error cleaning up memory for plugin ${pluginName}:`, error);
      throw error;
    }
  }

  /**
   * Clean up all plugin memory resources
   */
  async cleanupAllPluginMemory(): Promise<MemoryCleanupResult> {
    const startTime = Date.now();
    const totalCleared = {
      clearedWeakRefs: 0,
      clearedTimers: 0,
      clearedEventListeners: 0,
      clearedInstances: 0,
    };

    const pluginNames = new Set([
      ...this.pluginWeakRefs.keys(),
      ...this.pluginTimers.keys(),
      ...this.pluginEventListeners.keys(),
      ...this.pluginInstances.keys(),
    ]);

    for (const pluginName of pluginNames) {
      try {
        const result = await this.cleanupPluginMemory(pluginName);
        totalCleared.clearedWeakRefs += result.clearedWeakRefs;
        totalCleared.clearedTimers += result.clearedTimers;
        totalCleared.clearedEventListeners += result.clearedEventListeners;
        totalCleared.clearedInstances += result.clearedInstances;
      } catch (error) {
        this.logger.error(`Failed to cleanup memory for plugin ${pluginName}:`, error);
      }
    }

    const duration = Date.now() - startTime;

    this.logger.log(`Completed full memory cleanup in ${duration}ms`, totalCleared);

    return {
      ...totalCleared,
      memoryFreed: 0,
      duration,
    };
  }

  /**
   * Get current memory statistics
   */
  getCurrentMemoryStats(): PluginMemoryStats {
    const memoryUsage = process.memoryUsage();
    const memoryPressure = memoryUsage.heapUsed / memoryUsage.heapTotal;

    return {
      totalWeakRefs: this.pluginWeakRefs.size,
      totalTimers: Array.from(this.pluginTimers.values()).reduce((sum, timers) => sum + timers.length, 0),
      totalEventListeners: Array.from(this.pluginEventListeners.values()).reduce(
        (sum, listeners) => sum + listeners.length,
        0
      ),
      totalInstances: Array.from(this.pluginInstances.values()).reduce((sum, instances) => sum + instances.size, 0),
      memoryPressure,
      lastCleanup: this.lastMemoryStats?.lastCleanup || new Date(),
    };
  }

  /**
   * Check if memory cleanup is needed
   */
  isMemoryCleanupNeeded(): boolean {
    const stats = this.getCurrentMemoryStats();
    return stats.memoryPressure > this.config.memoryPressureThreshold;
  }

  /**
   * Force immediate memory cleanup
   */
  async forceCleanup(): Promise<MemoryCleanupResult> {
    this.logger.log('Forcing immediate memory cleanup');
    const result = await this.performChunkedCleanup();
    this.lastMemoryStats = this.getCurrentMemoryStats();
    this.lastMemoryStats.lastCleanup = new Date();
    return result;
  }

  /**
   * Configure memory manager behavior
   */
  configure(config: Partial<MemoryManagerConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart timer with new interval if changed
    if (config.cleanupIntervalMs !== undefined) {
      this.stopMemoryCleanupTimer();
      this.startMemoryCleanupTimer();
    }

    this.logger.debug('Memory manager configuration updated', this.config);
  }

  private startMemoryCleanupTimer(): void {
    this.memoryCleanupTimer = setInterval(() => this.performScheduledCleanup(), this.config.cleanupIntervalMs);
    this.logger.debug(`Started memory cleanup timer with ${this.config.cleanupIntervalMs}ms interval`);
  }

  private stopMemoryCleanupTimer(): void {
    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer);
      this.memoryCleanupTimer = undefined;
      this.logger.debug('Stopped memory cleanup timer');
    }
  }

  private async performScheduledCleanup(): Promise<void> {
    try {
      if (this.isMemoryCleanupNeeded() || this.config.enableAggressive) {
        await this.performChunkedCleanup();
        this.lastMemoryStats = this.getCurrentMemoryStats();
        this.lastMemoryStats.lastCleanup = new Date();
      }
    } catch (error) {
      this.logger.error('Error during scheduled memory cleanup:', error);
    }
  }

  private async performChunkedCleanup(): Promise<MemoryCleanupResult> {
    // Clean up stale weak references first
    const staleRefs: string[] = [];
    for (const [pluginName, weakRef] of this.pluginWeakRefs) {
      if (weakRef.deref() === undefined) {
        staleRefs.push(pluginName);
      }
    }

    const totalResult = {
      clearedWeakRefs: 0,
      clearedTimers: 0,
      clearedEventListeners: 0,
      clearedInstances: 0,
      memoryFreed: 0,
      duration: 0,
    };

    // Process stale references in chunks
    for (let i = 0; i < staleRefs.length; i += this.config.chunkSize) {
      const chunk = staleRefs.slice(i, i + this.config.chunkSize);

      for (const pluginName of chunk) {
        try {
          const result = await this.cleanupPluginMemory(pluginName);
          totalResult.clearedWeakRefs += result.clearedWeakRefs;
          totalResult.clearedTimers += result.clearedTimers;
          totalResult.clearedEventListeners += result.clearedEventListeners;
          totalResult.clearedInstances += result.clearedInstances;
          totalResult.duration += result.duration;
        } catch (error) {
          this.logger.warn(`Failed to cleanup plugin ${pluginName} during chunked cleanup:`, error);
        }
      }

      // Small delay between chunks to prevent blocking
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    if (staleRefs.length > 0) {
      this.logger.log(`Chunked cleanup completed: processed ${staleRefs.length} stale plugins`);
    }

    return totalResult;
  }
}
