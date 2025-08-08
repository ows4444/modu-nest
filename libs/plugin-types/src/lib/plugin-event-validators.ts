/**
 * Runtime Event Schema Validation
 *
 * Provides runtime validation for plugin events to ensure type safety
 * and data integrity throughout the plugin system.
 */

import {
  IsString,
  IsNumber,
  IsBoolean,
  IsDate,
  IsOptional,
  IsArray,
  IsEnum,
  IsObject,
  validate,
  ValidationError,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  PluginEvent,
  PluginState,
  PluginTransition,
  BasePluginEvent,
  PluginDiscoveredEvent,
  PluginLoadingStartedEvent,
  PluginLoadingProgressEvent,
  PluginLoadedEvent,
  PluginLoadFailedEvent,
  PluginUnloadedEvent,
  PluginStateChangedEvent,
  PluginDependencyResolvedEvent,
  PluginDependencyFailedEvent,
  PluginReloadedEvent,
  PluginUploadStartedEvent,
  PluginValidationStartedEvent,
  PluginValidationCompletedEvent,
  PluginStoredEvent,
  PluginDownloadedEvent,
  PluginDeletedEvent,
  PluginSecurityScanStartedEvent,
  PluginSecurityScanCompletedEvent,
  PluginSecurityViolationEvent,
  PluginPerformanceEvent,
  PluginCircuitBreakerEvent,
  PluginCacheEvent,
  PluginErrorEvent,
} from './plugin-events';

/**
 * Base event validator class
 */
export class BasePluginEventValidator implements BasePluginEvent {
  @IsString()
  pluginName: string;

  @IsDate()
  @Transform(({ value }) => new Date(value))
  timestamp: Date;

  @IsOptional()
  context?: any;

  @IsOptional()
  @IsString()
  source?: string;

  constructor(pluginName: string, timestamp: Date, context?: any, source?: string) {
    this.pluginName = pluginName;
    this.timestamp = timestamp;
    this.context = context;
    this.source = source;
  }
}

/**
 * Plugin Host Event Validators
 */
export class PluginDiscoveredEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.discovered' as const;

  @IsString()
  pluginPath: string;

  @IsObject()
  manifest: any; // PluginManifest - using any to avoid circular dependencies

  constructor(data: PluginDiscoveredEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.pluginPath = data.pluginPath;
    this.manifest = data.manifest;
  }
}

export class PluginLoadingStartedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.loading.started' as const;

  @IsString()
  loadingStrategy: string;

  @IsArray()
  @IsString({ each: true })
  dependencies: string[];

  constructor(data: PluginLoadingStartedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.loadingStrategy = data.loadingStrategy;
    this.dependencies = data.dependencies;
  }
}

export class PluginLoadingProgressEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.loading.progress' as const;

  @IsEnum(['validation', 'dependency-resolution', 'instantiation', 'initialization'])
  phase: 'validation' | 'dependency-resolution' | 'instantiation' | 'initialization';

  @IsNumber()
  @Transform(({ value }) => Number(value))
  progress: number;

  @IsOptional()
  @IsString()
  details?: string;

  constructor(data: PluginLoadingProgressEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.phase = data.phase;
    this.progress = data.progress;
    this.details = data.details;
  }
}

export class PluginLoadedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.loaded' as const;

  @IsObject()
  plugin: any; // LoadedPlugin - using any to avoid circular dependencies

  @IsNumber()
  @Transform(({ value }) => Number(value))
  loadTimeMs: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  memoryUsage?: number;

  constructor(data: PluginLoadedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.plugin = data.plugin;
    this.loadTimeMs = data.loadTimeMs;
    this.memoryUsage = data.memoryUsage;
  }
}

export class PluginLoadFailedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.load.failed' as const;

  @IsObject()
  @Transform(({ value }) => (value instanceof Error ? value : new Error(String(value))))
  error: Error;

  @IsString()
  phase: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  retryCount?: number;

  constructor(data: PluginLoadFailedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.error = data.error;
    this.phase = data.phase;
    this.retryCount = data.retryCount;
  }
}

export class PluginUnloadedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.unloaded' as const;

  @IsEnum(['manual', 'error', 'shutdown', 'dependency-conflict'])
  reason: 'manual' | 'error' | 'shutdown' | 'dependency-conflict';

  @IsOptional()
  @IsObject()
  resourcesFreed?: {
    memory: number;
    timers: number;
    listeners: number;
  };

  constructor(data: PluginUnloadedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.reason = data.reason;
    this.resourcesFreed = data.resourcesFreed;
  }
}

export class PluginStateChangedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.state.changed' as const;

  @IsOptional()
  @IsEnum(PluginState)
  fromState: PluginState | undefined;

  @IsEnum(PluginState)
  toState: PluginState;

  @IsEnum(PluginTransition)
  transition: PluginTransition;

  constructor(data: PluginStateChangedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.fromState = data.fromState;
    this.toState = data.toState;
    this.transition = data.transition;
  }
}

export class PluginDependencyResolvedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.dependency.resolved' as const;

  @IsString()
  dependency: string;

  @IsNumber()
  @Transform(({ value }) => Number(value))
  resolutionTimeMs: number;

  constructor(data: PluginDependencyResolvedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.dependency = data.dependency;
    this.resolutionTimeMs = data.resolutionTimeMs;
  }
}

export class PluginDependencyFailedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.dependency.failed' as const;

  @IsString()
  dependency: string;

  @IsObject()
  @Transform(({ value }) => (value instanceof Error ? value : new Error(String(value))))
  error: Error;

  @IsOptional()
  @IsBoolean()
  timeout?: boolean;

  constructor(data: PluginDependencyFailedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.dependency = data.dependency;
    this.error = data.error;
    this.timeout = data.timeout;
  }
}

export class PluginReloadedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.reloaded' as const;

  @IsOptional()
  @IsString()
  previousVersion?: string;

  @IsOptional()
  @IsString()
  newVersion?: string;

  @IsBoolean()
  hotReload: boolean;

  constructor(data: PluginReloadedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.previousVersion = data.previousVersion;
    this.newVersion = data.newVersion;
    this.hotReload = data.hotReload;
  }
}

/**
 * Plugin Registry Event Validators
 */
export class PluginUploadStartedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.upload.started' as const;

  @IsNumber()
  @Transform(({ value }) => Number(value))
  fileSize: number;

  @IsString()
  checksum: string;

  constructor(data: PluginUploadStartedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.fileSize = data.fileSize;
    this.checksum = data.checksum;
  }
}

export class PluginValidationStartedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.validation.started' as const;

  @IsEnum(['manifest', 'structure', 'security'])
  validationType: 'manifest' | 'structure' | 'security';

  constructor(data: PluginValidationStartedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.validationType = data.validationType;
  }
}

export class PluginValidationCompletedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.validation.completed' as const;

  @IsEnum(['manifest', 'structure', 'security'])
  validationType: 'manifest' | 'structure' | 'security';

  @IsBoolean()
  isValid: boolean;

  @IsArray()
  @IsString({ each: true })
  warnings: string[];

  @IsArray()
  @IsString({ each: true })
  errors: string[];

  @IsOptional()
  @IsBoolean()
  cacheHit?: boolean;

  constructor(data: PluginValidationCompletedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.validationType = data.validationType;
    this.isValid = data.isValid;
    this.warnings = data.warnings;
    this.errors = data.errors;
    this.cacheHit = data.cacheHit;
  }
}

export class PluginStoredEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.stored' as const;

  @IsObject()
  metadata: any; // PluginMetadata - using any to avoid circular dependencies

  @IsString()
  storageLocation: string;

  constructor(data: PluginStoredEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.metadata = data.metadata;
    this.storageLocation = data.storageLocation;
  }
}

export class PluginDownloadedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.downloaded' as const;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsNumber()
  @Transform(({ value }) => Number(value))
  fileSize: number;

  constructor(data: PluginDownloadedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.userAgent = data.userAgent;
    this.ipAddress = data.ipAddress;
    this.fileSize = data.fileSize;
  }
}

export class PluginDeletedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.deleted' as const;

  @IsString()
  reason: string;

  constructor(data: PluginDeletedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.reason = data.reason;
  }
}

/**
 * Security Event Validators
 */
export class PluginSecurityScanStartedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.security.scan.started' as const;

  @IsEnum(['imports', 'structure', 'manifest'])
  scanType: 'imports' | 'structure' | 'manifest';

  constructor(data: PluginSecurityScanStartedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.scanType = data.scanType;
  }
}

export class PluginSecurityScanCompletedEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.security.scan.completed' as const;

  @IsEnum(['imports', 'structure', 'manifest'])
  scanType: 'imports' | 'structure' | 'manifest';

  @IsArray()
  @IsString({ each: true })
  threats: string[];

  @IsEnum(['low', 'medium', 'high', 'critical'])
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsBoolean()
  cacheHit?: boolean;

  constructor(data: PluginSecurityScanCompletedEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.scanType = data.scanType;
    this.threats = data.threats;
    this.riskLevel = data.riskLevel;
    this.cacheHit = data.cacheHit;
  }
}

export class PluginSecurityViolationEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.security.violation' as const;

  @IsString()
  violationType: string;

  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity: 'low' | 'medium' | 'high' | 'critical';

  @IsBoolean()
  blocked: boolean;

  constructor(data: PluginSecurityViolationEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.violationType = data.violationType;
    this.severity = data.severity;
    this.blocked = data.blocked;
  }
}

/**
 * Performance Event Validators
 */
export class PluginPerformanceEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.performance' as const;

  @IsEnum(['load-time', 'memory-usage', 'cpu-usage', 'response-time'])
  metric: 'load-time' | 'memory-usage' | 'cpu-usage' | 'response-time';

  @IsNumber()
  @Transform(({ value }) => Number(value))
  value: number;

  @IsEnum(['ms', 'bytes', 'percent'])
  unit: 'ms' | 'bytes' | 'percent';

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  threshold?: number;

  @IsOptional()
  @IsBoolean()
  exceeded?: boolean;

  constructor(data: PluginPerformanceEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.metric = data.metric;
    this.value = data.value;
    this.unit = data.unit;
    this.threshold = data.threshold;
    this.exceeded = data.exceeded;
  }
}

/**
 * Circuit Breaker Event Validators
 */
export class PluginCircuitBreakerEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.circuit-breaker' as const;

  @IsEnum(['open', 'half-open', 'closed'])
  state: 'open' | 'half-open' | 'closed';

  @IsString()
  reason: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  errorCount?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  resetTimeMs?: number;

  constructor(data: PluginCircuitBreakerEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.state = data.state;
    this.reason = data.reason;
    this.errorCount = data.errorCount;
    this.resetTimeMs = data.resetTimeMs;
  }
}

/**
 * Cache Event Validators
 */
export class PluginCacheEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.cache' as const;

  @IsEnum(['hit', 'miss', 'eviction', 'clear'])
  operation: 'hit' | 'miss' | 'eviction' | 'clear';

  @IsEnum(['validation', 'security', 'manifest'])
  cacheType: 'validation' | 'security' | 'manifest';

  @IsOptional()
  @IsString()
  key?: string;

  constructor(data: PluginCacheEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.operation = data.operation;
    this.cacheType = data.cacheType;
    this.key = data.key;
  }
}

/**
 * Error Event Validators
 */
export class PluginErrorEventValidator extends BasePluginEventValidator {
  @IsString()
  type = 'plugin.error' as const;

  @IsObject()
  @Transform(({ value }) => (value instanceof Error ? value : new Error(String(value))))
  error: Error;

  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity: 'low' | 'medium' | 'high' | 'critical';

  @IsBoolean()
  recoverable: boolean;

  @IsEnum(['validation', 'loading', 'runtime', 'security', 'network'])
  category: 'validation' | 'loading' | 'runtime' | 'security' | 'network';

  constructor(data: PluginErrorEvent) {
    super(data.pluginName, data.timestamp, data.context, data.source);
    this.error = data.error;
    this.severity = data.severity;
    this.recoverable = data.recoverable;
    this.category = data.category;
  }
}

/**
 * Event validation registry
 */
export const EVENT_VALIDATORS = {
  'plugin.discovered': PluginDiscoveredEventValidator,
  'plugin.loading.started': PluginLoadingStartedEventValidator,
  'plugin.loading.progress': PluginLoadingProgressEventValidator,
  'plugin.loaded': PluginLoadedEventValidator,
  'plugin.load.failed': PluginLoadFailedEventValidator,
  'plugin.unloaded': PluginUnloadedEventValidator,
  'plugin.state.changed': PluginStateChangedEventValidator,
  'plugin.dependency.resolved': PluginDependencyResolvedEventValidator,
  'plugin.dependency.failed': PluginDependencyFailedEventValidator,
  'plugin.reloaded': PluginReloadedEventValidator,
  'plugin.upload.started': PluginUploadStartedEventValidator,
  'plugin.validation.started': PluginValidationStartedEventValidator,
  'plugin.validation.completed': PluginValidationCompletedEventValidator,
  'plugin.stored': PluginStoredEventValidator,
  'plugin.downloaded': PluginDownloadedEventValidator,
  'plugin.deleted': PluginDeletedEventValidator,
  'plugin.security.scan.started': PluginSecurityScanStartedEventValidator,
  'plugin.security.scan.completed': PluginSecurityScanCompletedEventValidator,
  'plugin.security.violation': PluginSecurityViolationEventValidator,
  'plugin.performance': PluginPerformanceEventValidator,
  'plugin.circuit-breaker': PluginCircuitBreakerEventValidator,
  'plugin.cache': PluginCacheEventValidator,
  'plugin.error': PluginErrorEventValidator,
};

/**
 * Validation result interface
 */
export interface EventValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Event validation service
 */
export class PluginEventValidator {
  private static instance: PluginEventValidator;
  private validationCache = new Map<string, EventValidationResult>();
  private validationStats = {
    totalValidations: 0,
    totalErrors: 0,
    cacheHits: 0,
    validationsByType: new Map<string, number>(),
    errorsByType: new Map<string, number>(),
  };

  static getInstance(): PluginEventValidator {
    if (!PluginEventValidator.instance) {
      PluginEventValidator.instance = new PluginEventValidator();
    }
    return PluginEventValidator.instance;
  }

  /**
   * Validate a plugin event
   */
  async validateEvent<T extends PluginEvent>(event: T): Promise<EventValidationResult> {
    this.validationStats.totalValidations++;

    const eventType = event.type;
    this.validationStats.validationsByType.set(
      eventType,
      (this.validationStats.validationsByType.get(eventType) || 0) + 1
    );

    // Check cache first (for structural validation)
    const cacheKey = this.getCacheKey(event);
    const cached = this.validationCache.get(cacheKey);
    if (cached) {
      this.validationStats.cacheHits++;
      return cached;
    }

    const ValidatorClass = EVENT_VALIDATORS[eventType];
    if (!ValidatorClass) {
      const result: EventValidationResult = {
        isValid: false,
        errors: [],
        warnings: [`Unknown event type: ${eventType}`],
      };
      this.cacheResult(cacheKey, result);
      return result;
    }

    try {
      // Create validator instance
      const validator = new ValidatorClass(event as any);

      // Validate the event
      const errors = await validate(validator, {
        skipMissingProperties: false,
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      const result: EventValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings: [],
      };

      // Add custom validation warnings
      this.addCustomWarnings(event, result);

      // Cache the result
      this.cacheResult(cacheKey, result);

      if (!result.isValid) {
        this.validationStats.totalErrors++;
        this.validationStats.errorsByType.set(eventType, (this.validationStats.errorsByType.get(eventType) || 0) + 1);
      }

      return result;
    } catch (error) {
      const result: EventValidationResult = {
        isValid: false,
        errors: [],
        warnings: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
      };
      this.cacheResult(cacheKey, result);
      this.validationStats.totalErrors++;
      return result;
    }
  }

  /**
   * Validate event schema only (without content validation)
   */
  validateEventSchema<T extends PluginEvent>(event: T): EventValidationResult {
    const eventType = event.type;
    const ValidatorClass = EVENT_VALIDATORS[eventType];

    if (!ValidatorClass) {
      return {
        isValid: false,
        errors: [],
        warnings: [`Unknown event type: ${eventType}`],
      };
    }

    // Check required fields
    const requiredFields = ['pluginName', 'timestamp', 'type'];
    const missingFields = requiredFields.filter((field) => !(field in event));

    if (missingFields.length > 0) {
      return {
        isValid: false,
        errors: [],
        warnings: [`Missing required fields: ${missingFields.join(', ')}`],
      };
    }

    return {
      isValid: true,
      errors: [],
      warnings: [],
    };
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): any {
    return {
      ...this.validationStats,
      validationsByType: Object.fromEntries(this.validationStats.validationsByType),
      errorsByType: Object.fromEntries(this.validationStats.errorsByType),
      cacheSize: this.validationCache.size,
    };
  }

  /**
   * Clear validation cache and statistics
   */
  clearValidationCache(): void {
    this.validationCache.clear();
    this.validationStats = {
      totalValidations: 0,
      totalErrors: 0,
      cacheHits: 0,
      validationsByType: new Map(),
      errorsByType: new Map(),
    };
  }

  private getCacheKey<T extends PluginEvent>(event: T): string {
    // Create a cache key based on event structure (not content)
    const key = {
      type: event.type,
      hasPluginName: 'pluginName' in event,
      hasTimestamp: 'timestamp' in event,
      hasSource: 'source' in event,
      hasContext: 'context' in event,
      fieldCount: Object.keys(event).length,
    };
    return JSON.stringify(key);
  }

  private cacheResult(key: string, result: EventValidationResult): void {
    // Limit cache size to prevent memory leaks
    if (this.validationCache.size > 1000) {
      const firstKey = this.validationCache.keys().next().value;
      if (firstKey) {
        this.validationCache.delete(firstKey);
      }
    }
    this.validationCache.set(key, result);
  }

  private addCustomWarnings<T extends PluginEvent>(event: T, result: EventValidationResult): void {
    // Add performance warnings
    if (event.type === 'plugin.performance') {
      const perfEvent = event as unknown as PluginPerformanceEvent;
      if (perfEvent.threshold && perfEvent.value > perfEvent.threshold) {
        result.warnings.push(`Performance metric ${perfEvent.metric} exceeded threshold`);
      }
    }

    // Add security warnings
    if (event.type === 'plugin.security.violation') {
      const secEvent = event as unknown as PluginSecurityViolationEvent;
      if (secEvent.severity === 'critical' || secEvent.severity === 'high') {
        result.warnings.push('High severity security violation detected');
      }
    }

    // Add memory usage warnings
    if (event.type === 'plugin.loaded') {
      const loadEvent = event as unknown as PluginLoadedEvent;
      if (loadEvent.memoryUsage && loadEvent.memoryUsage > 100 * 1024 * 1024) {
        // 100MB
        result.warnings.push('Plugin using significant memory (>100MB)');
      }
    }
  }
}

/**
 * Utility functions for event validation
 */
export async function validatePluginEvent<T extends PluginEvent>(event: T): Promise<EventValidationResult> {
  return PluginEventValidator.getInstance().validateEvent(event);
}

export function validatePluginEventSchema<T extends PluginEvent>(event: T): EventValidationResult {
  return PluginEventValidator.getInstance().validateEventSchema(event);
}

export function getEventValidationStats(): any {
  return PluginEventValidator.getInstance().getValidationStats();
}

export function clearEventValidationCache(): void {
  return PluginEventValidator.getInstance().clearValidationCache();
}
