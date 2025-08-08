/**
 * Plugin Registry Custom Exceptions
 *
 * Provides specialized exception classes for plugin registry operations.
 */

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for plugin registry exceptions
 */
export abstract class PluginRegistryException extends HttpException {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, status: HttpStatus, code: string, details?: Record<string, unknown>) {
    super({ message, code, details }, status);
    this.code = code;
    this.details = details;
  }
}

/**
 * Plugin not found exception
 */
export class PluginNotFoundException extends PluginRegistryException {
  constructor(pluginName: string, version?: string) {
    super(`Plugin '${pluginName}${version ? `:${version}` : ''}' not found`, HttpStatus.NOT_FOUND, 'PLUGIN_NOT_FOUND', {
      pluginName,
      version,
    });
  }
}

/**
 * Plugin validation exception
 */
export class PluginValidationException extends PluginRegistryException {
  constructor(pluginName: string, validationErrors: Record<string, string[]>) {
    super(`Plugin '${pluginName}' failed validation`, HttpStatus.BAD_REQUEST, 'PLUGIN_VALIDATION_FAILED', {
      pluginName,
      validationErrors,
    });
  }
}

/**
 * Plugin upload exception
 */
export class PluginUploadException extends PluginRegistryException {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(`Plugin upload failed: ${reason}`, HttpStatus.BAD_REQUEST, 'PLUGIN_UPLOAD_FAILED', details);
  }
}

/**
 * Plugin security exception
 */
export class PluginSecurityException extends PluginRegistryException {
  constructor(pluginName: string, securityIssue: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium') {
    super(
      `Security violation detected for plugin '${pluginName}': ${securityIssue}`,
      HttpStatus.FORBIDDEN,
      'PLUGIN_SECURITY_VIOLATION',
      { pluginName, securityIssue, severity }
    );
  }
}

/**
 * Plugin trust level exception
 */
export class PluginTrustException extends PluginRegistryException {
  constructor(pluginName: string, requiredTrustLevel: string, actualTrustLevel: string, operation: string) {
    super(
      `Plugin '${pluginName}' with trust level '${actualTrustLevel}' cannot perform operation '${operation}' (requires '${requiredTrustLevel}')`,
      HttpStatus.FORBIDDEN,
      'INSUFFICIENT_TRUST_LEVEL',
      { pluginName, requiredTrustLevel, actualTrustLevel, operation }
    );
  }
}

/**
 * Plugin capability exception
 */
export class PluginCapabilityException extends PluginRegistryException {
  constructor(pluginName: string, capability: string, reason: string) {
    super(
      `Plugin '${pluginName}' cannot use capability '${capability}': ${reason}`,
      HttpStatus.FORBIDDEN,
      'CAPABILITY_DENIED',
      { pluginName, capability, reason }
    );
  }
}

/**
 * Plugin conflict exception
 */
export class PluginConflictException extends PluginRegistryException {
  constructor(pluginName: string, version: string, conflictReason: string) {
    super(
      `Plugin '${pluginName}:${version}' conflicts with existing plugin: ${conflictReason}`,
      HttpStatus.CONFLICT,
      'PLUGIN_CONFLICT',
      { pluginName, version, conflictReason }
    );
  }
}

/**
 * Plugin operation timeout exception
 */
export class PluginOperationTimeoutException extends PluginRegistryException {
  constructor(operation: string, timeoutMs: number, pluginName?: string) {
    super(
      `Plugin operation '${operation}' timed out after ${timeoutMs}ms${
        pluginName ? ` for plugin '${pluginName}'` : ''
      }`,
      HttpStatus.REQUEST_TIMEOUT,
      'OPERATION_TIMEOUT',
      { operation, timeoutMs, pluginName }
    );
  }
}

/**
 * Plugin storage exception
 */
export class PluginStorageException extends PluginRegistryException {
  constructor(operation: string, reason: string, pluginName?: string) {
    super(
      `Plugin storage operation '${operation}' failed: ${reason}${pluginName ? ` (plugin: ${pluginName})` : ''}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'STORAGE_OPERATION_FAILED',
      { operation, reason, pluginName }
    );
  }
}

/**
 * Rate limiting exception
 */
export class RateLimitExceededException extends PluginRegistryException {
  constructor(rule: string, limit: number, windowMs: number, resetTime: Date) {
    super(
      `Rate limit exceeded for rule '${rule}'. Limit: ${limit} requests per ${windowMs}ms`,
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMIT_EXCEEDED',
      { rule, limit, windowMs, resetTime: resetTime.toISOString() }
    );
  }
}

/**
 * Database operation exception
 */
export class DatabaseOperationException extends PluginRegistryException {
  constructor(operation: string, reason: string) {
    super(
      `Database operation '${operation}' failed: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'DATABASE_OPERATION_FAILED',
      { operation, reason }
    );
  }
}

/**
 * Configuration exception
 */
export class ConfigurationException extends PluginRegistryException {
  constructor(configKey: string, reason: string) {
    super(
      `Configuration error for '${configKey}': ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'CONFIGURATION_ERROR',
      { configKey, reason }
    );
  }
}
