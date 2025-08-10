/**
 * Plugin Event System
 *
 * This module defines a comprehensive event-driven architecture for the plugin system.
 * It enables loose coupling between plugin management components by replacing direct
 * method calls with events for plugin state changes and lifecycle operations.
 */

import { PluginMetadata, PluginManifest, LoadedPlugin } from './interfaces/plugin-interfaces';

// Re-export required types for loose coupling
export type { PluginMetadata, PluginManifest, LoadedPlugin } from './interfaces/plugin-interfaces';

// Plugin state types (re-exported for loose coupling)
export enum PluginState {
  DISCOVERED = 'discovered',
  LOADING = 'loading',
  LOADED = 'loaded',
  FAILED = 'failed',
  UNLOADED = 'unloaded',
}

export enum PluginTransition {
  START_LOADING = 'start_loading',
  COMPLETE_LOADING = 'complete_loading',
  FAIL_LOADING = 'fail_loading',
  UNLOAD = 'unload',
  REDISCOVER = 'rediscover',
  RETRY = 'retry',
  ROLLBACK = 'rollback',
  RECOVER = 'recover',
}

// Base event interface
export interface BasePluginEvent {
  pluginName: string;
  timestamp: Date;
  context?: any;
  source?: string;
}

// Plugin Host Events
export interface PluginDiscoveredEvent extends BasePluginEvent {
  type: 'plugin.discovered';
  pluginPath: string;
  manifest: PluginManifest;
}

export interface PluginLoadingStartedEvent extends BasePluginEvent {
  type: 'plugin.loading.started';
  loadingStrategy: string;
  dependencies: string[];
}

export interface PluginLoadingProgressEvent extends BasePluginEvent {
  type: 'plugin.loading.progress';
  phase: 'validation' | 'dependency-resolution' | 'instantiation' | 'initialization';
  progress: number; // 0-100
  details?: string;
}

export interface PluginLoadedEvent extends BasePluginEvent {
  type: 'plugin.loaded';
  plugin: LoadedPlugin;
  loadTimeMs: number;
  memoryUsage?: number;
}

export interface PluginLoadFailedEvent extends BasePluginEvent {
  type: 'plugin.load.failed';
  error: Error;
  phase: string;
  retryCount?: number;
}

export interface PluginUnloadedEvent extends BasePluginEvent {
  type: 'plugin.unloaded';
  reason: 'manual' | 'error' | 'shutdown' | 'dependency-conflict';
  resourcesFreed?: {
    memory: number;
    timers: number;
    listeners: number;
  };
}

export interface PluginStateChangedEvent extends BasePluginEvent {
  type: 'plugin.state.changed';
  fromState: PluginState | undefined;
  toState: PluginState;
  transition: PluginTransition;
}

export interface PluginDependencyResolvedEvent extends BasePluginEvent {
  type: 'plugin.dependency.resolved';
  dependency: string;
  resolutionTimeMs: number;
}

export interface PluginDependencyFailedEvent extends BasePluginEvent {
  type: 'plugin.dependency.failed';
  dependency: string;
  error: Error;
  timeout?: boolean;
}

export interface PluginReloadedEvent extends BasePluginEvent {
  type: 'plugin.reloaded';
  previousVersion?: string;
  newVersion?: string;
  hotReload: boolean;
}

// Plugin Registry Events
export interface PluginUploadStartedEvent extends BasePluginEvent {
  type: 'plugin.upload.started';
  fileSize: number;
  checksum: string;
}

export interface PluginValidationStartedEvent extends BasePluginEvent {
  type: 'plugin.validation.started';
  validationType: 'manifest' | 'structure' | 'security';
}

export interface PluginValidationCompletedEvent extends BasePluginEvent {
  type: 'plugin.validation.completed';
  validationType: 'manifest' | 'structure' | 'security';
  isValid: boolean;
  warnings: string[];
  errors: string[];
  cacheHit?: boolean;
}

export interface PluginStoredEvent extends BasePluginEvent {
  type: 'plugin.stored';
  metadata: PluginMetadata;
  storageLocation: string;
}

export interface PluginDownloadedEvent extends BasePluginEvent {
  type: 'plugin.downloaded';
  userAgent?: string;
  ipAddress?: string;
  fileSize: number;
}

export interface PluginDeletedEvent extends BasePluginEvent {
  type: 'plugin.deleted';
  reason: string;
}

// Security Events
export interface PluginSecurityScanStartedEvent extends BasePluginEvent {
  type: 'plugin.security.scan.started';
  scanType: 'imports' | 'structure' | 'manifest';
}

export interface PluginSecurityScanCompletedEvent extends BasePluginEvent {
  type: 'plugin.security.scan.completed';
  scanType: 'imports' | 'structure' | 'manifest';
  threats: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  cacheHit?: boolean;
}

export interface PluginSecurityViolationEvent extends BasePluginEvent {
  type: 'plugin.security.violation';
  violationType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blocked: boolean;
}

// Performance Events
export interface PluginPerformanceEvent extends BasePluginEvent {
  type: 'plugin.performance';
  metric: 'load-time' | 'memory-usage' | 'cpu-usage' | 'response-time';
  value: number;
  unit: 'ms' | 'bytes' | 'percent';
  threshold?: number;
  exceeded?: boolean;
}

// Circuit Breaker Events
export interface PluginCircuitBreakerEvent extends BasePluginEvent {
  type: 'plugin.circuit-breaker';
  state: 'open' | 'half-open' | 'closed';
  reason: string;
  errorCount?: number;
  resetTimeMs?: number;
}

// Cache Events
export interface PluginCacheEvent extends BasePluginEvent {
  type: 'plugin.cache';
  operation: 'hit' | 'miss' | 'eviction' | 'clear';
  cacheType: 'validation' | 'security' | 'manifest';
  key?: string;
}

// Error Events
export interface PluginErrorEvent extends BasePluginEvent {
  type: 'plugin.error';
  error: Error;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
  category: 'validation' | 'loading' | 'runtime' | 'security' | 'network';
}

// Union type of all plugin events
export type PluginEvent =
  | PluginDiscoveredEvent
  | PluginLoadingStartedEvent
  | PluginLoadingProgressEvent
  | PluginLoadedEvent
  | PluginLoadFailedEvent
  | PluginUnloadedEvent
  | PluginStateChangedEvent
  | PluginDependencyResolvedEvent
  | PluginDependencyFailedEvent
  | PluginReloadedEvent
  | PluginUploadStartedEvent
  | PluginValidationStartedEvent
  | PluginValidationCompletedEvent
  | PluginStoredEvent
  | PluginDownloadedEvent
  | PluginDeletedEvent
  | PluginSecurityScanStartedEvent
  | PluginSecurityScanCompletedEvent
  | PluginSecurityViolationEvent
  | PluginPerformanceEvent
  | PluginCircuitBreakerEvent
  | PluginCacheEvent
  | PluginErrorEvent;

// Event listener types
export type PluginEventListener<T extends PluginEvent = PluginEvent> = (event: T) => void | Promise<void>;

// Event emitter interface
export interface IPluginEventEmitter {
  emit<T extends PluginEvent>(event: T): boolean;
  on<T extends PluginEvent>(eventType: T['type'], listener: PluginEventListener<T>): void;
  off<T extends PluginEvent>(eventType: T['type'], listener: PluginEventListener<T>): void;
  once<T extends PluginEvent>(eventType: T['type'], listener: PluginEventListener<T>): void;
  removeAllListeners(eventType?: string): void;
  getListenerCount(eventType: string): number;
}

// Event subscription interface for services
export interface IPluginEventSubscriber {
  subscribeToEvents(eventEmitter: IPluginEventEmitter): void;
  unsubscribeFromEvents(eventEmitter: IPluginEventEmitter): void;
}

// Event bus interface for global event coordination
export interface IPluginEventBus extends IPluginEventEmitter {
  // High-level event emission helpers
  emitPluginDiscovered(pluginName: string, pluginPath: string, manifest: PluginManifest): void;
  emitPluginLoadingStarted(pluginName: string, strategy: string, dependencies: string[]): void;
  emitPluginLoaded(pluginName: string, plugin: LoadedPlugin, loadTimeMs: number): void;
  emitPluginLoadFailed(pluginName: string, error: Error, phase: string): void;
  emitPluginUnloaded(pluginName: string, reason: string): void;
  emitPluginStateChanged(
    pluginName: string,
    fromState: PluginState | undefined,
    toState: PluginState,
    transition: PluginTransition
  ): void;

  // Registry events
  emitPluginUploadStarted(pluginName: string, fileSize: number, checksum: string): void;
  emitPluginValidationCompleted(
    pluginName: string,
    type: string,
    isValid: boolean,
    warnings: string[],
    errors: string[]
  ): void;
  emitPluginStored(pluginName: string, metadata: PluginMetadata, location: string): void;
  emitPluginDownloaded(pluginName: string, userAgent?: string, ipAddress?: string): void;

  // Security events
  emitPluginSecurityScanCompleted(pluginName: string, scanType: string, threats: string[], riskLevel: string): void;
  emitPluginSecurityViolation(pluginName: string, violationType: string, severity: string, blocked: boolean): void;

  // Performance events
  emitPluginPerformance(pluginName: string, metric: string, value: number, unit: string): void;

  // Error events
  emitPluginError(pluginName: string, error: Error, severity: string, category: string): void;
}

// Event filtering and routing
export interface EventFilter<T extends PluginEvent = PluginEvent> {
  (event: T): boolean;
}

export interface EventRouter {
  addRoute<T extends PluginEvent>(eventType: T['type'], filter: EventFilter<T>, listener: PluginEventListener<T>): void;
  removeRoute<T extends PluginEvent>(eventType: T['type'], listener: PluginEventListener<T>): void;
}

// Event middleware for processing events before they reach listeners
export interface EventMiddleware {
  process<T extends PluginEvent>(event: T, next: (event: T) => void): void;
}

export interface IPluginEventMiddleware {
  use(middleware: EventMiddleware): void;
  process<T extends PluginEvent>(event: T): T;
}

// Export PluginEventEmitter class (forward declaration)
// PluginEventEmitter is now exported from @modu-nest/plugin-services
