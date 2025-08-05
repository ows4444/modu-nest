/**
 * Plugin Event Emitter Implementation
 * 
 * A robust event emitter specifically designed for the plugin system.
 * Provides type-safe event emission and subscription with error handling,
 * middleware support, and performance monitoring.
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import {
  PluginEvent,
  PluginEventListener,
  IPluginEventEmitter,
  IPluginEventBus,
  EventMiddleware,
  IPluginEventMiddleware,
  PluginMetadata,
  PluginManifest,
  LoadedPlugin,
  PluginState,
  PluginTransition,
} from './plugin-events';

@Injectable()
export class PluginEventEmitter extends EventEmitter implements IPluginEventEmitter, IPluginEventBus, IPluginEventMiddleware {
  private readonly logger = new Logger(PluginEventEmitter.name);
  private readonly middlewares: EventMiddleware[] = [];
  private readonly eventStats = new Map<string, { count: number; lastEmitted: Date }>();

  constructor() {
    super();
    this.setMaxListeners(100); // Allow up to 100 listeners per event
    
    // Log event statistics periodically
    setInterval(() => this.logEventStats(), 300000); // Every 5 minutes
  }

  // Core event emitter methods
  emit<T extends PluginEvent>(event: T): boolean {
    try {
      // Process through middleware
      const processedEvent = this.process(event);
      
      // Update statistics
      this.updateEventStats(processedEvent.type);
      
      // Log event emission
      this.logger.debug(`Emitting event: ${processedEvent.type} for plugin: ${processedEvent.pluginName}`);
      
      // Emit the event
      return super.emit(processedEvent.type, processedEvent);
    } catch (error) {
      this.logger.error(`Error emitting event ${event.type}: ${error.message}`, error.stack);
      return false;
    }
  }

  on<T extends PluginEvent>(eventType: T['type'], listener: PluginEventListener<T>): void {
    const wrappedListener = this.wrapListener(eventType, listener);
    super.on(eventType, wrappedListener);
    this.logger.debug(`Added listener for event: ${eventType}`);
  }

  off<T extends PluginEvent>(eventType: T['type'], listener: PluginEventListener<T>): void {
    super.off(eventType, listener);
    this.logger.debug(`Removed listener for event: ${eventType}`);
  }

  once<T extends PluginEvent>(eventType: T['type'], listener: PluginEventListener<T>): void {
    const wrappedListener = this.wrapListener(eventType, listener);
    super.once(eventType, wrappedListener);
    this.logger.debug(`Added one-time listener for event: ${eventType}`);
  }

  removeAllListeners(eventType?: string): void {
    super.removeAllListeners(eventType);
    if (eventType) {
      this.logger.debug(`Removed all listeners for event: ${eventType}`);
    } else {
      this.logger.debug('Removed all event listeners');
    }
  }

  getListenerCount(eventType: string): number {
    return super.listenerCount(eventType);
  }

  // Middleware support
  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
    this.logger.debug('Added event middleware');
  }

  process<T extends PluginEvent>(event: T): T {
    let processedEvent = event;
    
    for (const middleware of this.middlewares) {
      try {
        let nextCalled = false;
        middleware.process(processedEvent, (e) => {
          processedEvent = e;
          nextCalled = true;
        });
        
        if (!nextCalled) {
          this.logger.warn('Middleware did not call next(), event processing stopped');
          break;
        }
      } catch (error) {
        this.logger.error(`Error in event middleware: ${error.message}`, error.stack);
      }
    }
    
    return processedEvent;
  }

  // High-level event emission helpers for Plugin Host
  emitPluginDiscovered(pluginName: string, pluginPath: string, manifest: PluginManifest): void {
    this.emit({
      type: 'plugin.discovered',
      pluginName,
      pluginPath,
      manifest,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  emitPluginLoadingStarted(pluginName: string, strategy: string, dependencies: string[]): void {
    this.emit({
      type: 'plugin.loading.started',
      pluginName,
      loadingStrategy: strategy,
      dependencies,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  emitPluginLoadingProgress(pluginName: string, phase: 'validation' | 'dependency-resolution' | 'instantiation' | 'initialization', progress: number, details?: string): void {
    this.emit({
      type: 'plugin.loading.progress',
      pluginName,
      phase,
      progress,
      details,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  emitPluginLoaded(pluginName: string, plugin: LoadedPlugin, loadTimeMs: number, memoryUsage?: number): void {
    this.emit({
      type: 'plugin.loaded',
      pluginName,
      plugin,
      loadTimeMs,
      memoryUsage,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  emitPluginLoadFailed(pluginName: string, error: Error, phase: string, retryCount?: number): void {
    this.emit({
      type: 'plugin.load.failed',
      pluginName,
      error,
      phase,
      retryCount,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  emitPluginUnloaded(pluginName: string, reason: 'manual' | 'error' | 'shutdown' | 'dependency-conflict', resourcesFreed?: any): void {
    this.emit({
      type: 'plugin.unloaded',
      pluginName,
      reason,
      resourcesFreed,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  emitPluginStateChanged(pluginName: string, fromState: PluginState | undefined, toState: PluginState, transition: PluginTransition): void {
    this.emit({
      type: 'plugin.state.changed',
      pluginName,
      fromState,
      toState,
      transition,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  emitPluginDependencyResolved(pluginName: string, dependency: string, resolutionTimeMs: number): void {
    this.emit({
      type: 'plugin.dependency.resolved',
      pluginName,
      dependency,
      resolutionTimeMs,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  emitPluginDependencyFailed(pluginName: string, dependency: string, error: Error, timeout?: boolean): void {
    this.emit({
      type: 'plugin.dependency.failed',
      pluginName,
      dependency,
      error,
      timeout,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  emitPluginReloaded(pluginName: string, previousVersion?: string, newVersion?: string, hotReload: boolean = false): void {
    this.emit({
      type: 'plugin.reloaded',
      pluginName,
      previousVersion,
      newVersion,
      hotReload,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  // Registry event helpers
  emitPluginUploadStarted(pluginName: string, fileSize: number, checksum: string): void {
    this.emit({
      type: 'plugin.upload.started',
      pluginName,
      fileSize,
      checksum,
      timestamp: new Date(),
      source: 'plugin-registry',
    });
  }

  emitPluginValidationStarted(pluginName: string, validationType: 'manifest' | 'structure' | 'security'): void {
    this.emit({
      type: 'plugin.validation.started',
      pluginName,
      validationType,
      timestamp: new Date(),
      source: 'plugin-registry',
    });
  }

  emitPluginValidationCompleted(pluginName: string, type: 'manifest' | 'structure' | 'security', isValid: boolean, warnings: string[], errors: string[], cacheHit?: boolean): void {
    this.emit({
      type: 'plugin.validation.completed',
      pluginName,
      validationType: type,
      isValid,
      warnings,
      errors,
      cacheHit,
      timestamp: new Date(),
      source: 'plugin-registry',
    });
  }

  emitPluginStored(pluginName: string, metadata: PluginMetadata, location: string): void {
    this.emit({
      type: 'plugin.stored',
      pluginName,
      metadata,
      storageLocation: location,
      timestamp: new Date(),
      source: 'plugin-registry',
    });
  }

  emitPluginDownloaded(pluginName: string, userAgent?: string, ipAddress?: string, fileSize?: number): void {
    this.emit({
      type: 'plugin.downloaded',
      pluginName,
      userAgent,
      ipAddress,
      fileSize: fileSize || 0,
      timestamp: new Date(),
      source: 'plugin-registry',
    });
  }

  emitPluginDeleted(pluginName: string, reason: string): void {
    this.emit({
      type: 'plugin.deleted',
      pluginName,
      reason,
      timestamp: new Date(),
      source: 'plugin-registry',
    });
  }

  // Security event helpers
  emitPluginSecurityScanStarted(pluginName: string, scanType: 'imports' | 'structure' | 'manifest'): void {
    this.emit({
      type: 'plugin.security.scan.started',
      pluginName,
      scanType,
      timestamp: new Date(),
      source: 'plugin-registry',
    });
  }

  emitPluginSecurityScanCompleted(pluginName: string, scanType: 'imports' | 'structure' | 'manifest', threats: string[], riskLevel: 'low' | 'medium' | 'high' | 'critical', cacheHit?: boolean): void {
    this.emit({
      type: 'plugin.security.scan.completed',
      pluginName,
      scanType,
      threats,
      riskLevel,
      cacheHit,
      timestamp: new Date(),
      source: 'plugin-registry',
    });
  }

  emitPluginSecurityViolation(pluginName: string, violationType: string, severity: 'low' | 'medium' | 'high' | 'critical', blocked: boolean): void {
    this.emit({
      type: 'plugin.security.violation',
      pluginName,
      violationType,
      severity,
      blocked,
      timestamp: new Date(),
      source: 'plugin-registry',
    });
  }

  // Performance event helpers
  emitPluginPerformance(pluginName: string, metric: 'load-time' | 'memory-usage' | 'cpu-usage' | 'response-time', value: number, unit: 'ms' | 'bytes' | 'percent', threshold?: number): void {
    this.emit({
      type: 'plugin.performance',
      pluginName,
      metric,
      value,
      unit,
      threshold,
      exceeded: threshold ? value > threshold : false,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  // Circuit breaker event helpers
  emitPluginCircuitBreakerEvent(pluginName: string, state: 'open' | 'half-open' | 'closed', reason: string, errorCount?: number, resetTimeMs?: number): void {
    this.emit({
      type: 'plugin.circuit-breaker',
      pluginName,
      state,
      reason,
      errorCount,
      resetTimeMs,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  // Cache event helpers
  emitPluginCacheEvent(pluginName: string, operation: 'hit' | 'miss' | 'eviction' | 'clear', cacheType: 'validation' | 'security' | 'manifest', key?: string): void {
    this.emit({
      type: 'plugin.cache',
      pluginName,
      operation,
      cacheType,
      key,
      timestamp: new Date(),
      source: 'plugin-system',
    });
  }

  // Error event helpers
  emitPluginError(pluginName: string, error: Error, severity: 'low' | 'medium' | 'high' | 'critical', category: 'validation' | 'loading' | 'runtime' | 'security' | 'network', recoverable: boolean = true): void {
    this.emit({
      type: 'plugin.error',
      pluginName,
      error,
      severity,
      recoverable,
      category,
      timestamp: new Date(),
      source: 'plugin-system',
    });
  }

  // Private helper methods
  private wrapListener<T extends PluginEvent>(eventType: string, listener: PluginEventListener<T>): (event: T) => void {
    return async (event: T) => {
      try {
        await listener(event);
      } catch (error) {
        this.logger.error(`Error in event listener for ${eventType}: ${error.message}`, error.stack);
        
        // Emit error event for listener failures
        this.emitPluginError(
          event.pluginName,
          error as Error,
          'medium',
          'runtime',
          true
        );
      }
    };
  }

  private updateEventStats(eventType: string): void {
    const stats = this.eventStats.get(eventType) || { count: 0, lastEmitted: new Date() };
    stats.count++;
    stats.lastEmitted = new Date();
    this.eventStats.set(eventType, stats);
  }

  private logEventStats(): void {
    if (this.eventStats.size === 0) return;

    this.logger.debug('Plugin Event Statistics:');
    for (const [eventType, stats] of this.eventStats.entries()) {
      this.logger.debug(`  ${eventType}: ${stats.count} events (last: ${stats.lastEmitted.toISOString()})`);
    }
  }

  // Utility methods for monitoring
  getEventStats(): Record<string, { count: number; lastEmitted: Date }> {
    return Object.fromEntries(this.eventStats);
  }

  getActiveListenerCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const eventName of this.eventNames()) {
      counts[eventName.toString()] = this.listenerCount(eventName);
    }
    return counts;
  }

  clearEventStats(): void {
    this.eventStats.clear();
    this.logger.debug('Cleared event statistics');
  }
}