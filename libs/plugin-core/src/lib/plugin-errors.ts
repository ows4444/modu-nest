import { HttpException, HttpStatus } from '@nestjs/common';
import { 
  BaseFrameworkError, 
  ErrorCategory,
  ValidationError,
  NotFoundError,
  ConflictError
} from '@modu-nest/utils';

/**
 * Base plugin error class using standardized error handling
 * @deprecated Use specific error types from ErrorFactory for new code
 */
export abstract class PluginError extends BaseFrameworkError {
  abstract override readonly code: string;
  abstract override readonly statusCode: HttpStatus;
  abstract override readonly category: ErrorCategory;

  constructor(message: string, public readonly details?: unknown, context: Record<string, unknown> = {}) {
    super(message, { details, ...context });
    this.name = this.constructor.name;
  }
}

/**
 * Plugin validation errors - uses standardized validation error
 */
export class PluginValidationError extends ValidationError {
  constructor(message: string, validationErrors: string[] = [], pluginName?: string) {
    super(message, validationErrors, { pluginName, errorType: 'plugin_validation' });
  }
}

/**
 * Plugin not found error - uses standardized not found error
 */
export class PluginNotFoundError extends NotFoundError {
  constructor(pluginName: string, version?: string) {
    const identifier = version ? `${pluginName}@${version}` : pluginName;
    super('Plugin', identifier, { pluginName, version });
  }
}

/**
 * Plugin already exists error - uses standardized conflict error
 */
export class PluginAlreadyExistsError extends ConflictError {
  constructor(pluginName: string, version: string) {
    super(
      `Plugin '${pluginName}' version '${version}' already exists`,
      'plugin_version_conflict',
      { pluginName, version }
    );
  }
}

/**
 * Plugin file format error
 */
export class PluginFileFormatError extends PluginError {
  override readonly code = 'PLUGIN_FILE_FORMAT_ERROR';
  override readonly statusCode = HttpStatus.BAD_REQUEST;
  override readonly category = ErrorCategory.VALIDATION;

  constructor(message: string, fileName?: string) {
    super(message, { fileName });
  }
}

/**
 * Plugin storage error
 */
export class PluginStorageError extends PluginError {
  override readonly code = 'PLUGIN_STORAGE_ERROR';
  override readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  override readonly category = ErrorCategory.FILE_SYSTEM;

  constructor(message: string, operation?: string) {
    super(message, { operation });
  }
}

/**
 * Plugin registry connection error
 */
export class PluginRegistryConnectionError extends PluginError {
  override readonly code = 'PLUGIN_REGISTRY_CONNECTION_ERROR';
  override readonly statusCode = HttpStatus.SERVICE_UNAVAILABLE;
  override readonly category = ErrorCategory.NETWORK;

  constructor(registryUrl: string, originalError?: Error) {
    super(`Failed to connect to plugin registry at ${registryUrl}`, { registryUrl, originalError });
  }
}

/**
 * Plugin installation error
 */
export class PluginInstallationError extends PluginError {
  override readonly code = 'PLUGIN_INSTALLATION_ERROR';
  override readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  override readonly category = ErrorCategory.SYSTEM;

  constructor(pluginName: string, reason: string) {
    super(`Failed to install plugin '${pluginName}': ${reason}`, { pluginName, reason });
  }
}

/**
 * Plugin loading error
 */
export class PluginLoadingError extends PluginError {
  override readonly code = 'PLUGIN_LOADING_ERROR';
  override readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  override readonly category = ErrorCategory.SYSTEM;

  constructor(pluginName: string, reason: string, phase?: string) {
    super(`Failed to load plugin '${pluginName}': ${reason}`, { pluginName, reason, phase });
  }
}

/**
 * Plugin security error
 */
export class PluginSecurityError extends PluginError {
  override readonly code = 'PLUGIN_SECURITY_ERROR';
  override readonly statusCode = HttpStatus.BAD_REQUEST;
  override readonly category = ErrorCategory.SECURITY;

  constructor(pluginName: string, violations: string[], riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium') {
    super(`Security violations detected in plugin '${pluginName}': ${violations.join(', ')}`, {
      pluginName,
      violations,
      riskLevel,
    });
  }
}

/**
 * Plugin dependency error
 */
export class PluginDependencyError extends PluginError {
  override readonly code = 'PLUGIN_DEPENDENCY_ERROR';
  override readonly statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
  override readonly category = ErrorCategory.BUSINESS_LOGIC;

  constructor(pluginName: string, missingDependencies: string[], circular?: string[]) {
    const message =
      circular && circular.length > 0
        ? `Plugin '${pluginName}' has circular dependencies: ${circular.join(', ')}`
        : `Plugin '${pluginName}' has missing dependencies: ${missingDependencies.join(', ')}`;

    super(message, { pluginName, missingDependencies, circular });
  }
}

/**
 * Plugin configuration error
 */
export class PluginConfigurationError extends PluginError {
  override readonly code = 'PLUGIN_CONFIGURATION_ERROR';
  override readonly statusCode = HttpStatus.BAD_REQUEST;
  override readonly category = ErrorCategory.CONFIGURATION;

  constructor(pluginName: string, configKey: string, reason: string) {
    super(`Configuration error in plugin '${pluginName}' for key '${configKey}': ${reason}`, {
      pluginName,
      configKey,
      reason,
    });
  }
}

/**
 * Plugin manifest error
 */
export class PluginManifestError extends PluginError {
  override readonly code = 'PLUGIN_MANIFEST_ERROR';
  override readonly statusCode = HttpStatus.BAD_REQUEST;
  override readonly category = ErrorCategory.VALIDATION;

  constructor(pluginName: string, manifestErrors: string[], warnings?: string[]) {
    super(`Invalid manifest for plugin '${pluginName}': ${manifestErrors.join(', ')}`, {
      pluginName,
      manifestErrors,
      warnings,
    });
  }
}

/**
 * Plugin file size error
 */
export class PluginFileSizeError extends PluginError {
  override readonly code = 'PLUGIN_FILE_SIZE_ERROR';
  override readonly statusCode = HttpStatus.BAD_REQUEST;
  override readonly category = ErrorCategory.VALIDATION;

  constructor(actualSize: number, maxSize: number, pluginName?: string) {
    super(`Plugin file size (${actualSize} bytes) exceeds maximum allowed size (${maxSize} bytes)`, {
      actualSize,
      maxSize,
      pluginName,
    });
  }
}

/**
 * Plugin timeout error
 */
export class PluginTimeoutError extends PluginError {
  override readonly code = 'PLUGIN_TIMEOUT_ERROR';
  override readonly statusCode = HttpStatus.REQUEST_TIMEOUT;
  override readonly category = ErrorCategory.SYSTEM;

  constructor(operation: string, timeoutMs: number, pluginName?: string) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, {
      operation,
      timeoutMs,
      pluginName,
    });
  }
}

/**
 * Plugin guard error
 */
export class PluginGuardError extends PluginError {
  override readonly code = 'PLUGIN_GUARD_ERROR';
  override readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  override readonly category = ErrorCategory.SECURITY;

  constructor(pluginName: string, guardName: string, reason: string) {
    super(`Guard error in plugin '${pluginName}' for guard '${guardName}': ${reason}`, {
      pluginName,
      guardName,
      reason,
    });
  }
}

/**
 * Plugin state error
 */
export class PluginStateError extends PluginError {
  override readonly code = 'PLUGIN_STATE_ERROR';
  override readonly statusCode = HttpStatus.CONFLICT;
  override readonly category = ErrorCategory.BUSINESS_LOGIC;

  constructor(pluginName: string, currentState: string, attemptedTransition: string) {
    super(
      `Invalid state transition for plugin '${pluginName}': cannot perform '${attemptedTransition}' from state '${currentState}'`,
      {
        pluginName,
        currentState,
        attemptedTransition,
      }
    );
  }
}

/**
 * Plugin permission error
 */
export class PluginPermissionError extends PluginError {
  override readonly code = 'PLUGIN_PERMISSION_ERROR';
  override readonly statusCode = HttpStatus.FORBIDDEN;
  override readonly category = ErrorCategory.AUTHORIZATION;

  constructor(pluginName: string, requiredPermission: string, operation: string) {
    super(`Plugin '${pluginName}' lacks permission '${requiredPermission}' for operation '${operation}'`, {
      pluginName,
      requiredPermission,
      operation,
    });
  }
}

/**
 * Plugin circuit breaker error
 */
export class PluginCircuitBreakerError extends PluginError {
  override readonly code = 'PLUGIN_CIRCUIT_BREAKER_ERROR';
  override readonly statusCode = HttpStatus.SERVICE_UNAVAILABLE;
  override readonly category = ErrorCategory.SYSTEM;

  constructor(pluginName: string, reason: string, resetTime?: number) {
    super(`Circuit breaker open for plugin '${pluginName}': ${reason}`, {
      pluginName,
      reason,
      resetTime,
    });
  }
}

/**
 * Plugin registry error
 */
export class PluginRegistryError extends PluginError {
  override readonly code = 'PLUGIN_REGISTRY_ERROR';
  override readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  override readonly category = ErrorCategory.SYSTEM;

  constructor(operation: string, reason: string, pluginName?: string) {
    super(`Registry operation '${operation}' failed: ${reason}`, {
      operation,
      reason,
      pluginName,
    });
  }
}

/**
 * Plugin cache error
 */
export class PluginCacheError extends PluginError {
  override readonly code = 'PLUGIN_CACHE_ERROR';
  override readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  override readonly category = ErrorCategory.SYSTEM;

  constructor(operation: string, cacheKey: string, reason: string) {
    super(`Cache operation '${operation}' failed for key '${cacheKey}': ${reason}`, {
      operation,
      cacheKey,
      reason,
    });
  }
}

/**
 * Plugin database error
 */
export class PluginDatabaseError extends PluginError {
  override readonly code = 'PLUGIN_DATABASE_ERROR';
  override readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  override readonly category = ErrorCategory.DATABASE;

  constructor(operation: string, table: string, reason: string) {
    super(`Database operation '${operation}' failed on table '${table}': ${reason}`, {
      operation,
      table,
      reason,
    });
  }
}

/**
 * Error context interface for enhanced error reporting
 */
export interface PluginErrorContext {
  pluginName?: string;
  operation?: string;
  stack?: string;
  correlationId?: string;
  userAgent?: string;
  ipAddress?: string;
  suggestions?: string[];
  recoverable?: boolean;
  retryAfter?: number;
}

/**
 * Enhanced error response format
 */
export interface PluginErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  code: string;
  details: any;
  context: PluginErrorContext;
  timestamp: string;
  path?: string;
}

/**
 * Utility function to convert plugin errors to HTTP exceptions with enhanced context
 */
export function toHttpException(error: PluginError, context?: PluginErrorContext): HttpException {
  const errorResponse: PluginErrorResponse = {
    statusCode: error.statusCode,
    message: error.message,
    error: error.name,
    code: error.code,
    details: error.details,
    context: {
      stack: error.stack,
      correlationId: generateCorrelationId(),
      recoverable: isRecoverable(error),
      suggestions: getErrorSuggestions(error),
      ...context,
    },
    timestamp: new Date().toISOString(),
  };

  return new HttpException(errorResponse, error.statusCode);
}

/**
 * Enhanced error handler with context and suggestions
 */
export function handlePluginError(error: unknown, context?: PluginErrorContext): never {
  if (error instanceof PluginError) {
    throw toHttpException(error, context);
  }

  if (error instanceof HttpException) {
    throw error;
  }

  // Handle unknown errors with context
  const unknownError = new HttpException(
    {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      error: 'InternalServerError',
      code: 'UNKNOWN_ERROR',
      details: { originalError: error instanceof Error ? error.message : String(error) },
      context: {
        stack: error instanceof Error ? error.stack : undefined,
        correlationId: generateCorrelationId(),
        recoverable: false,
        suggestions: ['Contact system administrator', 'Check system logs for more details'],
        ...context,
      },
      timestamp: new Date().toISOString(),
    },
    HttpStatus.INTERNAL_SERVER_ERROR
  );

  throw unknownError;
}

/**
 * Async error handler with retry support
 */
export async function handlePluginErrorWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  retryDelayMs = 1000,
  context?: PluginErrorContext
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on non-recoverable errors
      if (error instanceof PluginError && !isRecoverable(error)) {
        handlePluginError(error, { ...context, operation: `attempt ${attempt}/${maxRetries}` });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  // All retries failed
  handlePluginError(lastError, {
    ...context,
    operation: `failed after ${maxRetries} attempts`,
    suggestions: ['Check plugin configuration', 'Verify dependencies', 'Contact plugin author'],
  });
}

/**
 * Error severity classification
 */
export enum PluginErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Get error severity level
 */
export function getErrorSeverity(error: PluginError): PluginErrorSeverity {
  switch (error.constructor) {
    case PluginSecurityError:
    case PluginCircuitBreakerError:
      return PluginErrorSeverity.CRITICAL;

    case PluginLoadingError:
    case PluginDependencyError:
    case PluginRegistryError:
      return PluginErrorSeverity.HIGH;

    case PluginValidationError:
    case PluginManifestError:
    case PluginTimeoutError:
      return PluginErrorSeverity.MEDIUM;

    default:
      return PluginErrorSeverity.LOW;
  }
}

/**
 * Check if error is recoverable (can be retried)
 */
export function isRecoverable(error: PluginError): boolean {
  const nonRecoverableErrors = [
    PluginValidationError,
    PluginManifestError,
    PluginSecurityError,
    PluginPermissionError,
    PluginFileFormatError,
    PluginFileSizeError,
    PluginStateError,
  ];

  return !nonRecoverableErrors.some((ErrorClass) => error instanceof ErrorClass);
}

/**
 * Get context-aware error suggestions
 */
export function getErrorSuggestions(error: PluginError): string[] {
  const baseMessage = 'For more help, check the plugin documentation';

  switch (error.constructor) {
    case PluginValidationError:
    case PluginManifestError:
      return [
        'Verify plugin manifest follows the correct schema',
        'Check required fields are present and valid',
        'Use plugin validation tools before uploading',
        baseMessage,
      ];

    case PluginSecurityError:
      return [
        'Remove dangerous imports and dependencies',
        'Use framework-provided alternatives for security-sensitive operations',
        'Review plugin security guidelines',
        baseMessage,
      ];

    case PluginDependencyError:
      return [
        'Install missing dependencies',
        'Resolve circular dependency issues',
        'Check dependency versions for compatibility',
        baseMessage,
      ];

    case PluginLoadingError:
      return [
        'Check plugin structure and entry points',
        'Verify plugin exports match manifest',
        'Review plugin loading logs for details',
        baseMessage,
      ];

    case PluginTimeoutError:
      return [
        'Optimize plugin initialization code',
        'Reduce dependency complexity',
        'Consider asynchronous initialization patterns',
        baseMessage,
      ];

    case PluginFileSizeError:
      return [
        'Reduce plugin bundle size',
        'Remove unnecessary files and dependencies',
        'Use plugin optimization tools',
        baseMessage,
      ];

    default:
      return ['Check plugin configuration', 'Review system logs for more details', baseMessage];
  }
}

/**
 * Generate correlation ID for error tracking
 */
export function generateCorrelationId(): string {
  return `plugin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Error code registry for consistent error identification
 */
export const PluginErrorCodes = {
  // Validation errors (1xxx)
  PLUGIN_VALIDATION_ERROR: 'PLUGIN-1001',
  PLUGIN_MANIFEST_ERROR: 'PLUGIN-1002',
  PLUGIN_FILE_FORMAT_ERROR: 'PLUGIN-1003',
  PLUGIN_FILE_SIZE_ERROR: 'PLUGIN-1004',

  // Security errors (2xxx)
  PLUGIN_SECURITY_ERROR: 'PLUGIN-2001',
  PLUGIN_PERMISSION_ERROR: 'PLUGIN-2002',

  // Loading errors (3xxx)
  PLUGIN_LOADING_ERROR: 'PLUGIN-3001',
  PLUGIN_DEPENDENCY_ERROR: 'PLUGIN-3002',
  PLUGIN_STATE_ERROR: 'PLUGIN-3003',
  PLUGIN_TIMEOUT_ERROR: 'PLUGIN-3004',

  // Storage errors (4xxx)
  PLUGIN_STORAGE_ERROR: 'PLUGIN-4001',
  PLUGIN_DATABASE_ERROR: 'PLUGIN-4002',
  PLUGIN_CACHE_ERROR: 'PLUGIN-4003',

  // Registry errors (5xxx)
  PLUGIN_REGISTRY_ERROR: 'PLUGIN-5001',
  PLUGIN_REGISTRY_CONNECTION_ERROR: 'PLUGIN-5002',
  PLUGIN_NOT_FOUND: 'PLUGIN-5003',
  PLUGIN_ALREADY_EXISTS: 'PLUGIN-5004',

  // Runtime errors (6xxx)
  PLUGIN_INSTALLATION_ERROR: 'PLUGIN-6001',
  PLUGIN_GUARD_ERROR: 'PLUGIN-6002',
  PLUGIN_CIRCUIT_BREAKER_ERROR: 'PLUGIN-6003',
  PLUGIN_CONFIGURATION_ERROR: 'PLUGIN-6004',
} as const;

/**
 * Error metrics collector for monitoring
 */
export class PluginErrorMetrics {
  private static instance: PluginErrorMetrics;
  private errorCounts = new Map<string, number>();
  private errorHistory: Array<{ error: PluginError; timestamp: Date; context?: PluginErrorContext }> = [];

  static getInstance(): PluginErrorMetrics {
    if (!PluginErrorMetrics.instance) {
      PluginErrorMetrics.instance = new PluginErrorMetrics();
    }
    return PluginErrorMetrics.instance;
  }

  recordError(error: PluginError, context?: PluginErrorContext): void {
    const errorType = error.constructor.name;
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);
    this.errorHistory.push({ error, timestamp: new Date(), context });

    // Keep only last 1000 errors
    if (this.errorHistory.length > 1000) {
      this.errorHistory = this.errorHistory.slice(-1000);
    }
  }

  getErrorStats(): Record<string, number> {
    return Object.fromEntries(this.errorCounts);
  }

  getRecentErrors(count = 10): Array<{ error: PluginError; timestamp: Date; context?: PluginErrorContext }> {
    return this.errorHistory.slice(-count);
  }

  clearStats(): void {
    this.errorCounts.clear();
    this.errorHistory = [];
  }
}
