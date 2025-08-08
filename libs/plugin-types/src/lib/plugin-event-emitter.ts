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
import { 
  PluginEventValidator, 
  EventValidationResult,
} from './plugin-event-validators';

/**
 * Event batching configuration
 */
interface EventBatchConfig {
  maxBatchSize: number;
  flushIntervalMs: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  maxEventsPerSecond: number;
  burstLimit: number;
  backpressureThreshold: number;
}

/**
 * Batched event for efficient processing
 */
interface BatchedEvent {
  event: PluginEvent;
  timestamp: Date;
  priority: number;
  retries: number;
}

/**
 * Event priority mapping
 */
const EVENT_PRIORITIES: Record<string, number> = {
  'plugin.error': 100,
  'plugin.security.violation': 95,
  'plugin.circuit-breaker': 90,
  'plugin.load.failed': 85,
  'plugin.state.changed': 80,
  'plugin.loaded': 70,
  'plugin.unloaded': 70,
  'plugin.dependency.failed': 65,
  'plugin.performance': 60,
  'plugin.validation.completed': 50,
  'plugin.cache': 30,
  'plugin.loading.progress': 20,
  'plugin.discovered': 10,
};

@Injectable()
export class PluginEventEmitter
  extends EventEmitter
  implements IPluginEventEmitter, IPluginEventBus, IPluginEventMiddleware
{
  private readonly logger = new Logger(PluginEventEmitter.name);
  private readonly middlewares: EventMiddleware[] = [];
  private readonly eventStats = new Map<string, { count: number; lastEmitted: Date }>();
  
  // Batching and rate limiting properties
  private readonly eventBatches = new Map<string, BatchedEvent[]>();
  private readonly batchTimers = new Map<string, NodeJS.Timeout>();
  private readonly rateLimiters = new Map<string, {
    tokens: number;
    lastRefill: number;
    droppedEvents: number;
  }>();
  
  private readonly batchConfigs: Record<string, EventBatchConfig> = {
    'plugin.loading.progress': { maxBatchSize: 50, flushIntervalMs: 100, priority: 'low' },
    'plugin.cache': { maxBatchSize: 100, flushIntervalMs: 200, priority: 'low' },
    'plugin.performance': { maxBatchSize: 25, flushIntervalMs: 500, priority: 'medium' },
    'plugin.validation.completed': { maxBatchSize: 10, flushIntervalMs: 1000, priority: 'medium' },
    'plugin.discovered': { maxBatchSize: 20, flushIntervalMs: 300, priority: 'medium' },
  };
  
  private readonly rateLimitConfigs: Record<string, RateLimitConfig> = {
    'plugin.loading.progress': { maxEventsPerSecond: 100, burstLimit: 200, backpressureThreshold: 1000 },
    'plugin.cache': { maxEventsPerSecond: 200, burstLimit: 500, backpressureThreshold: 2000 },
    'plugin.performance': { maxEventsPerSecond: 50, burstLimit: 100, backpressureThreshold: 500 },
    'plugin.error': { maxEventsPerSecond: 20, burstLimit: 50, backpressureThreshold: 200 },
    'plugin.security.violation': { maxEventsPerSecond: 10, burstLimit: 20, backpressureThreshold: 100 },
  };

  private backpressureActive = false;
  private totalEventsProcessed = 0;
  private totalEventsDropped = 0;
  
  // Event validation properties
  private readonly eventValidator: PluginEventValidator;
  private validationEnabled = true;
  private schemaValidationOnly = false; // When true, only validates schema, not content
  private validationStats = {
    totalValidated: 0,
    validationErrors: 0,
    schemaErrors: 0,
    validationWarnings: 0,
  };

  constructor() {
    super();
    this.setMaxListeners(100); // Allow up to 100 listeners per event
    
    // Initialize event validator
    this.eventValidator = PluginEventValidator.getInstance();

    // Log event statistics periodically
    setInterval(() => this.logEventStats(), 300000); // Every 5 minutes
    
    // Initialize rate limiters
    this.initializeRateLimiters();
    
    // Cleanup old batches periodically
    setInterval(() => this.cleanupStaleBatches(), 30000); // Every 30 seconds
  }

  // Core event emitter methods (overloaded for compatibility)
  override emit(eventName: string | symbol, ...args: any[]): boolean;
  override emit<T extends PluginEvent>(event: T): boolean;
  override emit<T extends PluginEvent>(eventNameOrEvent: string | symbol | T, ...args: any[]): boolean {
    try {
      // Handle different overload signatures
      if (typeof eventNameOrEvent === 'string' || typeof eventNameOrEvent === 'symbol') {
        // Traditional EventEmitter signature
        return super.emit(eventNameOrEvent, ...args);
      }

      // Plugin event object signature
      const event = eventNameOrEvent;

      // Validate event if validation is enabled
      if (this.validationEnabled) {
        const validationResult = this.validateEventSync(event);
        if (!validationResult.isValid) {
          this.logger.warn(`Event validation failed for ${event.type}:`, validationResult.errors);
          this.validationStats.validationErrors++;
          return false;
        }
        
        // Log validation warnings
        if (validationResult.warnings.length > 0) {
          this.logger.warn(`Event validation warnings for ${event.type}:`, validationResult.warnings);
          this.validationStats.validationWarnings++;
        }
        
        this.validationStats.totalValidated++;
      }

      // Check rate limiting
      if (!this.checkRateLimit(event.type)) {
        this.totalEventsDropped++;
        this.logger.warn(`Event ${event.type} dropped due to rate limiting for plugin: ${event.pluginName}`);
        return false;
      }

      // Process through middleware
      const processedEvent = this.process(event);

      // Update statistics
      this.updateEventStats(processedEvent.type);

      // Check if this event type should be batched
      const batchConfig = this.batchConfigs[processedEvent.type];
      if (batchConfig && !this.isHighPriorityEvent(processedEvent.type)) {
        return this.addToBatch(processedEvent, batchConfig);
      }

      // Emit immediately for high priority events or non-batchable events
      this.totalEventsProcessed++;
      this.logger.debug(`Emitting event: ${processedEvent.type} for plugin: ${processedEvent.pluginName}`);
      return super.emit(processedEvent.type, processedEvent);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      if (typeof eventNameOrEvent === 'object' && eventNameOrEvent && 'type' in eventNameOrEvent) {
        this.logger.error(`Error emitting event ${eventNameOrEvent.type}: ${errorMessage}`, errorStack);
      } else {
        this.logger.error(`Error emitting event ${String(eventNameOrEvent)}: ${errorMessage}`, errorStack);
      }
      return false;
    }
  }

  override on<T extends PluginEvent>(eventType: T['type'], listener: PluginEventListener<T>): this {
    const wrappedListener = this.wrapListener(eventType, listener);
    super.on(eventType, wrappedListener);
    this.logger.debug(`Added listener for event: ${eventType}`);
    return this;
  }

  override off<T extends PluginEvent>(eventType: T['type'], listener: PluginEventListener<T>): this {
    super.off(eventType, listener);
    this.logger.debug(`Removed listener for event: ${eventType}`);
    return this;
  }

  override once<T extends PluginEvent>(eventType: T['type'], listener: PluginEventListener<T>): this {
    const wrappedListener = this.wrapListener(eventType, listener);
    super.once(eventType, wrappedListener);
    this.logger.debug(`Added one-time listener for event: ${eventType}`);
    return this;
  }

  override removeAllListeners(eventType?: string): this {
    super.removeAllListeners(eventType);
    if (eventType) {
      this.logger.debug(`Removed all listeners for event: ${eventType}`);
    } else {
      this.logger.debug('Removed all event listeners');
    }
    return this;
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
        this.logger.error(
          `Error in event middleware: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined
        );
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

  emitPluginLoadingProgress(
    pluginName: string,
    phase: 'validation' | 'dependency-resolution' | 'instantiation' | 'initialization',
    progress: number,
    details?: string
  ): void {
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

  emitPluginUnloaded(
    pluginName: string,
    reason: 'manual' | 'error' | 'shutdown' | 'dependency-conflict',
    resourcesFreed?: any
  ): void {
    this.emit({
      type: 'plugin.unloaded',
      pluginName,
      reason,
      resourcesFreed,
      timestamp: new Date(),
      source: 'plugin-host',
    });
  }

  emitPluginStateChanged(
    pluginName: string,
    fromState: PluginState | undefined,
    toState: PluginState,
    transition: PluginTransition
  ): void {
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

  emitPluginReloaded(pluginName: string, previousVersion?: string, newVersion?: string, hotReload = false): void {
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

  emitPluginValidationCompleted(
    pluginName: string,
    type: 'manifest' | 'structure' | 'security',
    isValid: boolean,
    warnings: string[],
    errors: string[],
    cacheHit?: boolean
  ): void {
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

  emitPluginSecurityScanCompleted(
    pluginName: string,
    scanType: 'imports' | 'structure' | 'manifest',
    threats: string[],
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    cacheHit?: boolean
  ): void {
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

  emitPluginSecurityViolation(
    pluginName: string,
    violationType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    blocked: boolean
  ): void {
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
  emitPluginPerformance(
    pluginName: string,
    metric: 'load-time' | 'memory-usage' | 'cpu-usage' | 'response-time',
    value: number,
    unit: 'ms' | 'bytes' | 'percent',
    threshold?: number
  ): void {
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
  emitPluginCircuitBreakerEvent(
    pluginName: string,
    state: 'open' | 'half-open' | 'closed',
    reason: string,
    errorCount?: number,
    resetTimeMs?: number
  ): void {
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
  emitPluginCacheEvent(
    pluginName: string,
    operation: 'hit' | 'miss' | 'eviction' | 'clear',
    cacheType: 'validation' | 'security' | 'manifest',
    key?: string
  ): void {
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
  emitPluginError(
    pluginName: string,
    error: Error,
    severity: 'low' | 'medium' | 'high' | 'critical',
    category: 'validation' | 'loading' | 'runtime' | 'security' | 'network',
    recoverable = true
  ): void {
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

  // Event validation methods
  private validateEventSync<T extends PluginEvent>(event: T): EventValidationResult {
    try {
      if (this.schemaValidationOnly) {
        return this.eventValidator.validateEventSchema(event);
      } else {
        // For synchronous validation, we only do schema validation
        // Full validation with class-validator would be async
        const schemaResult = this.eventValidator.validateEventSchema(event);
        if (!schemaResult.isValid) {
          this.validationStats.schemaErrors++;
        }
        return schemaResult;
      }
    } catch (error) {
      this.logger.error(`Error during event validation: ${error instanceof Error ? error.message : String(error)}`);
      return {
        isValid: false,
        errors: [],
        warnings: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  async validateEventAsync<T extends PluginEvent>(event: T): Promise<EventValidationResult> {
    try {
      if (this.schemaValidationOnly) {
        return this.eventValidator.validateEventSchema(event);
      } else {
        return await this.eventValidator.validateEvent(event);
      }
    } catch (error) {
      this.logger.error(`Error during event validation: ${error instanceof Error ? error.message : String(error)}`);
      return {
        isValid: false,
        errors: [],
        warnings: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  // Event validation configuration
  setValidationMode(enabled: boolean, schemaOnly = false): void {
    this.validationEnabled = enabled;
    this.schemaValidationOnly = schemaOnly;
    this.logger.debug(`Event validation ${enabled ? 'enabled' : 'disabled'}${enabled && schemaOnly ? ' (schema only)' : ''}`);
  }

  getValidationStats(): any {
    return {
      ...this.validationStats,
      validatorStats: this.eventValidator.getValidationStats(),
    };
  }

  clearValidationStats(): void {
    this.validationStats = {
      totalValidated: 0,
      validationErrors: 0,
      schemaErrors: 0,
      validationWarnings: 0,
    };
    this.eventValidator.clearValidationCache();
  }

  // Rate limiting and batching methods
  private initializeRateLimiters(): void {
    for (const [eventType, config] of Object.entries(this.rateLimitConfigs)) {
      this.rateLimiters.set(eventType, {
        tokens: config.burstLimit,
        lastRefill: Date.now(),
        droppedEvents: 0,
      });
    }
  }

  private checkRateLimit(eventType: string): boolean {
    const config = this.rateLimitConfigs[eventType];
    if (!config) {
      return true; // No rate limit configured
    }

    const limiter = this.rateLimiters.get(eventType);
    if (!limiter) {
      return true; // Limiter not initialized
    }

    // Refill tokens based on time passed
    const now = Date.now();
    const timePassed = (now - limiter.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * config.maxEventsPerSecond;
    limiter.tokens = Math.min(config.burstLimit, limiter.tokens + tokensToAdd);
    limiter.lastRefill = now;

    // Check if we have tokens available
    if (limiter.tokens >= 1) {
      limiter.tokens -= 1;
      return true;
    } else {
      limiter.droppedEvents++;
      
      // Activate backpressure if needed
      if (limiter.droppedEvents > config.backpressureThreshold && !this.backpressureActive) {
        this.activateBackpressure(eventType);
      }
      
      return false;
    }
  }

  private activateBackpressure(eventType: string): void {
    this.backpressureActive = true;
    this.logger.warn(`Backpressure activated for event type: ${eventType}`);
    
    // Emit backpressure event
    super.emit('backpressure.activated', {
      eventType,
      timestamp: new Date(),
      totalDropped: this.totalEventsDropped,
    });
    
    // Deactivate backpressure after a cooldown period
    setTimeout(() => {
      this.backpressureActive = false;
      this.logger.log(`Backpressure deactivated for event type: ${eventType}`);
      super.emit('backpressure.deactivated', {
        eventType,
        timestamp: new Date(),
      });
    }, 5000); // 5 second cooldown
  }

  private isHighPriorityEvent(eventType: string): boolean {
    const priority = EVENT_PRIORITIES[eventType] || 0;
    return priority >= 80; // High priority threshold
  }

  private addToBatch<T extends PluginEvent>(event: T, config: EventBatchConfig): boolean {
    const eventType = event.type;
    let batch = this.eventBatches.get(eventType);
    
    if (!batch) {
      batch = [];
      this.eventBatches.set(eventType, batch);
    }

    // Add event to batch with priority
    const priority = EVENT_PRIORITIES[eventType] || 0;
    const batchedEvent: BatchedEvent = {
      event,
      timestamp: new Date(),
      priority,
      retries: 0,
    };

    batch.push(batchedEvent);
    
    // Sort by priority (highest first)
    batch.sort((a, b) => b.priority - a.priority);

    // Check if batch should be flushed
    if (batch.length >= config.maxBatchSize) {
      this.flushBatch(eventType, config);
    } else {
      // Set timer to flush batch if not already set
      if (!this.batchTimers.has(eventType)) {
        const timer = setTimeout(() => {
          this.flushBatch(eventType, config);
        }, config.flushIntervalMs);
        this.batchTimers.set(eventType, timer);
      }
    }

    return true;
  }

  private flushBatch(eventType: string, config: EventBatchConfig): void {
    const batch = this.eventBatches.get(eventType);
    if (!batch || batch.length === 0) {
      return;
    }

    // Clear the timer
    const timer = this.batchTimers.get(eventType);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(eventType);
    }

    // Process events in batch
    const processedEvents = batch.map(batchedEvent => batchedEvent.event);
    this.totalEventsProcessed += processedEvents.length;

    // Emit batch event
    super.emit(`${eventType}.batch`, {
      eventType,
      events: processedEvents,
      batchSize: processedEvents.length,
      timestamp: new Date(),
      source: 'plugin-event-emitter',
    });

    // Emit individual events for backwards compatibility
    for (const batchedEvent of batch) {
      try {
        super.emit(eventType, batchedEvent.event);
      } catch (error) {
        this.logger.error(
          `Error emitting batched event ${eventType}: ${error instanceof Error ? error.message : String(error)}`
        );
        
        // Retry failed events up to 3 times
        if (batchedEvent.retries < 3) {
          batchedEvent.retries++;
          this.scheduleEventRetry(batchedEvent, config);
        }
      }
    }

    // Clear the batch
    this.eventBatches.set(eventType, []);

    this.logger.debug(`Flushed batch for ${eventType}: ${processedEvents.length} events`);
  }

  private scheduleEventRetry(batchedEvent: BatchedEvent, config: EventBatchConfig): void {
    const delay = Math.min(1000 * Math.pow(2, batchedEvent.retries), 10000); // Exponential backoff, max 10s
    
    setTimeout(() => {
      try {
        super.emit(batchedEvent.event.type, batchedEvent.event);
        this.totalEventsProcessed++;
      } catch (error) {
        this.logger.error(
          `Failed to retry event ${batchedEvent.event.type} after ${batchedEvent.retries} attempts`
        );
      }
    }, delay);
  }

  private cleanupStaleBatches(): void {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    for (const [eventType, batch] of this.eventBatches.entries()) {
      if (batch.length > 0) {
        const oldestEvent = batch[batch.length - 1]; // Sorted by priority, so oldest is last
        if (now - oldestEvent.timestamp.getTime() > staleThreshold) {
          const config = this.batchConfigs[eventType];
          if (config) {
            this.logger.warn(`Force flushing stale batch for ${eventType}: ${batch.length} events`);
            this.flushBatch(eventType, config);
          }
        }
      }
    }
  }

  // Enhanced statistics and monitoring
  getBatchingStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [eventType, batch] of this.eventBatches.entries()) {
      stats[eventType] = {
        queuedEvents: batch.length,
        hasTimer: this.batchTimers.has(eventType),
        config: this.batchConfigs[eventType],
      };
    }

    return {
      batches: stats,
      totalProcessed: this.totalEventsProcessed,
      totalDropped: this.totalEventsDropped,
      backpressureActive: this.backpressureActive,
    };
  }

  getRateLimitingStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [eventType, limiter] of this.rateLimiters.entries()) {
      const config = this.rateLimitConfigs[eventType];
      stats[eventType] = {
        tokensAvailable: Math.floor(limiter.tokens),
        droppedEvents: limiter.droppedEvents,
        config: config,
        utilizationPercent: ((config.burstLimit - limiter.tokens) / config.burstLimit) * 100,
      };
    }

    return stats;
  }

  // Public methods to control batching and rate limiting
  flushAllBatches(): void {
    for (const [eventType, config] of Object.entries(this.batchConfigs)) {
      this.flushBatch(eventType, config);
    }
    this.logger.log('Flushed all event batches');
  }

  resetRateLimiters(): void {
    for (const [eventType, config] of Object.entries(this.rateLimitConfigs)) {
      const limiter = this.rateLimiters.get(eventType);
      if (limiter) {
        limiter.tokens = config.burstLimit;
        limiter.droppedEvents = 0;
        limiter.lastRefill = Date.now();
      }
    }
    this.totalEventsDropped = 0;
    this.backpressureActive = false;
    this.logger.log('Reset all rate limiters');
  }

  // Private helper methods
  private wrapListener<T extends PluginEvent>(eventType: string, listener: PluginEventListener<T>): (event: T) => void {
    return async (event: T) => {
      try {
        await listener(event);
      } catch (error) {
        this.logger.error(
          `Error in event listener for ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined
        );

        // Emit error event for listener failures
        this.emitPluginError(event.pluginName, error as Error, 'medium', 'runtime', true);
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
    
    // Log batching and rate limiting stats
    this.logger.debug('Batching Statistics:', this.getBatchingStats());
    this.logger.debug('Rate Limiting Statistics:', this.getRateLimitingStats());
    this.logger.debug('Validation Statistics:', this.getValidationStats());
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
    this.flushAllBatches();
    this.resetRateLimiters();
    this.clearValidationStats();
    this.totalEventsProcessed = 0;
    this.logger.debug('Cleared all event statistics, batches, rate limiters, and validation stats');
  }
}
