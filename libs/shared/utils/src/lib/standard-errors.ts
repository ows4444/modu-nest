import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Standardized error handling system for all libraries
 *
 * This module provides a unified error handling approach across all libraries,
 * ensuring consistent error structures, codes, and HTTP mappings.
 *
 * @fileoverview Standardized error handling for framework-wide consistency
 * @version 1.0.0
 * @since 1.0.0
 */

// ============================================================================
// Base Error Types
// ============================================================================

/**
 * Base error class for all framework errors
 *
 * Provides consistent structure with:
 * - Standardized error codes
 * - HTTP status mapping
 * - Context information
 * - Correlation IDs for tracing
 */
export abstract class BaseFrameworkError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: HttpStatus;
  abstract readonly category: ErrorCategory;

  public readonly correlationId: string;
  public readonly timestamp: string;
  public readonly context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}, correlationId?: string) {
    super(message);
    this.name = this.constructor.name;
    this.correlationId = correlationId || this.generateCorrelationId();
    this.timestamp = new Date().toISOString();
    this.context = context;

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to HTTP exception with standardized format
   */
  toHttpException(): HttpException {
    const errorResponse: StandardErrorResponse = {
      statusCode: this.statusCode,
      message: this.message,
      error: this.name,
      code: this.code,
      category: this.category,
      context: this.context,
      correlationId: this.correlationId,
      timestamp: this.timestamp,
      suggestions: this.getSuggestions(),
      recoverable: this.isRecoverable(),
    };

    return new HttpException(errorResponse, this.statusCode);
  }

  /**
   * Get contextual suggestions for resolving the error
   */
  public getSuggestions(): string[] {
    return ['Check system logs for more details', 'Contact system administrator if problem persists'];
  }

  /**
   * Determine if error is recoverable (can be retried)
   */
  public isRecoverable(): boolean {
    return false;
  }

  private generateCorrelationId(): string {
    return `err-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

// ============================================================================
// Error Categories
// ============================================================================

export enum ErrorCategory {
  VALIDATION = 'validation',
  SECURITY = 'security',
  NETWORK = 'network',
  DATABASE = 'database',
  FILE_SYSTEM = 'file_system',
  CONFIGURATION = 'configuration',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RESOURCE = 'resource',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
}

// ============================================================================
// Standard Error Response Interface
// ============================================================================

export interface StandardErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  code: string;
  category: ErrorCategory;
  context: Record<string, unknown>;
  correlationId: string;
  timestamp: string;
  suggestions: string[];
  recoverable: boolean;
  path?: string;
  method?: string;
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends BaseFrameworkError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly category = ErrorCategory.VALIDATION;

  constructor(message: string, validationErrors: string[] = [], context: Record<string, unknown> = {}) {
    super(message, { validationErrors, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Check input data format and types',
      'Ensure all required fields are provided',
      'Verify data meets validation constraints',
      'Review API documentation for expected format',
    ];
  }
}

export class SchemaValidationError extends BaseFrameworkError {
  readonly code = 'SCHEMA_VALIDATION_ERROR';
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly category = ErrorCategory.VALIDATION;

  constructor(schemaName: string, errors: string[] = [], context: Record<string, unknown> = {}) {
    super(`Schema validation failed for '${schemaName}'`, { schemaName, validationErrors: errors, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Check data structure matches expected schema',
      'Verify required fields are present',
      'Ensure field types match schema definitions',
      'Review schema documentation',
    ];
  }
}

// ============================================================================
// Security Errors
// ============================================================================

export class SecurityError extends BaseFrameworkError {
  readonly code = 'SECURITY_ERROR';
  readonly statusCode = HttpStatus.FORBIDDEN;
  readonly category = ErrorCategory.SECURITY;

  constructor(
    message: string,
    violations: string[] = [],
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    context: Record<string, unknown> = {}
  ) {
    super(message, { violations, riskLevel, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Review security policies and requirements',
      'Check permissions and access controls',
      'Verify request origin and authentication',
      'Contact security team for guidance',
    ];
  }
}

export class AuthenticationError extends BaseFrameworkError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = HttpStatus.UNAUTHORIZED;
  readonly category = ErrorCategory.AUTHENTICATION;

  override getSuggestions(): string[] {
    return [
      'Provide valid authentication credentials',
      'Check if token is expired or invalid',
      'Verify authentication method is correct',
      'Re-authenticate and try again',
    ];
  }
}

export class AuthorizationError extends BaseFrameworkError {
  readonly code = 'AUTHORIZATION_ERROR';
  readonly statusCode = HttpStatus.FORBIDDEN;
  readonly category = ErrorCategory.AUTHORIZATION;

  constructor(requiredPermission?: string, operation?: string, context: Record<string, unknown> = {}) {
    const message =
      requiredPermission && operation
        ? `Permission '${requiredPermission}' required for operation '${operation}'`
        : 'Access denied - insufficient permissions';
    super(message, { requiredPermission, operation, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Contact administrator to request necessary permissions',
      'Verify you have access to the requested resource',
      'Check role assignments and permissions',
      'Ensure you are accessing the correct endpoint',
    ];
  }
}

// ============================================================================
// Resource Errors
// ============================================================================

export class NotFoundError extends BaseFrameworkError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = HttpStatus.NOT_FOUND;
  readonly category = ErrorCategory.RESOURCE;

  constructor(resource: string, identifier?: string, context: Record<string, unknown> = {}) {
    const message = identifier ? `${resource} with identifier '${identifier}' not found` : `${resource} not found`;
    super(message, { resource, identifier, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Verify the identifier is correct',
      'Check if the resource exists',
      'Ensure you have access to view the resource',
      'Try searching with different criteria',
    ];
  }
}

export class ConflictError extends BaseFrameworkError {
  readonly code = 'CONFLICT_ERROR';
  readonly statusCode = HttpStatus.CONFLICT;
  readonly category = ErrorCategory.RESOURCE;

  constructor(message: string, conflictType?: string, context: Record<string, unknown> = {}) {
    super(message, { conflictType, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Check if resource already exists',
      'Use different identifier or name',
      'Update existing resource instead',
      'Resolve conflicts and try again',
    ];
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

export class ConfigurationError extends BaseFrameworkError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  readonly category = ErrorCategory.CONFIGURATION;

  constructor(configKey?: string, reason?: string, context: Record<string, unknown> = {}) {
    const message =
      configKey && reason ? `Configuration error for '${configKey}': ${reason}` : 'System configuration error';
    super(message, { configKey, reason, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Check configuration file syntax',
      'Verify all required configuration values are set',
      'Review configuration documentation',
      'Restart service after configuration changes',
    ];
  }
}

// ============================================================================
// Network Errors
// ============================================================================

export class NetworkError extends BaseFrameworkError {
  readonly code = 'NETWORK_ERROR';
  readonly statusCode = HttpStatus.SERVICE_UNAVAILABLE;
  readonly category = ErrorCategory.NETWORK;

  constructor(operation: string, target?: string, originalError?: Error, context: Record<string, unknown> = {}) {
    const message = target
      ? `Network error during '${operation}' to '${target}'`
      : `Network error during '${operation}'`;
    super(message, { operation, target, originalError: originalError?.message, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Check network connectivity',
      'Verify target service is available',
      'Try again after a short delay',
      'Check firewall and proxy settings',
    ];
  }

  override isRecoverable(): boolean {
    return true;
  }
}

export class TimeoutError extends BaseFrameworkError {
  readonly code = 'TIMEOUT_ERROR';
  readonly statusCode = HttpStatus.REQUEST_TIMEOUT;
  readonly category = ErrorCategory.NETWORK;

  constructor(operation: string, timeoutMs: number, context: Record<string, unknown> = {}) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, { operation, timeoutMs, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Increase timeout value if appropriate',
      'Optimize operation for better performance',
      'Check system load and resources',
      'Try breaking operation into smaller chunks',
    ];
  }

  override isRecoverable(): boolean {
    return true;
  }
}

// ============================================================================
// Database Errors
// ============================================================================

export class DatabaseError extends BaseFrameworkError {
  readonly code = 'DATABASE_ERROR';
  readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  readonly category = ErrorCategory.DATABASE;

  constructor(operation: string, table?: string, originalError?: Error, context: Record<string, unknown> = {}) {
    const message = table
      ? `Database operation '${operation}' failed on table '${table}'`
      : `Database operation '${operation}' failed`;
    super(message, { operation, table, originalError: originalError?.message, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Check database connection and availability',
      'Verify query syntax and parameters',
      'Check database permissions',
      'Review database logs for more details',
    ];
  }

  override isRecoverable(): boolean {
    return true;
  }
}

// ============================================================================
// File System Errors
// ============================================================================

export class FileSystemError extends BaseFrameworkError {
  readonly code = 'FILE_SYSTEM_ERROR';
  readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  readonly category = ErrorCategory.FILE_SYSTEM;

  constructor(operation: string, path?: string, originalError?: Error, context: Record<string, unknown> = {}) {
    const message = path
      ? `File system operation '${operation}' failed for path '${path}'`
      : `File system operation '${operation}' failed`;
    super(message, { operation, path, originalError: originalError?.message, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Check file path exists and is accessible',
      'Verify file system permissions',
      'Ensure sufficient disk space',
      'Check for file locks or conflicts',
    ];
  }
}

export class FileSizeError extends BaseFrameworkError {
  readonly code = 'FILE_SIZE_ERROR';
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly category = ErrorCategory.FILE_SYSTEM;

  constructor(actualSize: number, maxSize: number, fileName?: string, context: Record<string, unknown> = {}) {
    const message = fileName
      ? `File '${fileName}' size (${actualSize} bytes) exceeds maximum allowed size (${maxSize} bytes)`
      : `File size (${actualSize} bytes) exceeds maximum allowed size (${maxSize} bytes)`;
    super(message, { actualSize, maxSize, fileName, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Reduce file size before uploading',
      'Compress the file if possible',
      'Split large files into smaller chunks',
      'Contact administrator to increase size limits',
    ];
  }
}

// ============================================================================
// System Errors
// ============================================================================

export class SystemError extends BaseFrameworkError {
  readonly code = 'SYSTEM_ERROR';
  readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  readonly category = ErrorCategory.SYSTEM;

  override isRecoverable(): boolean {
    return true;
  }
}

export class RateLimitError extends BaseFrameworkError {
  readonly code = 'RATE_LIMIT_ERROR';
  readonly statusCode = HttpStatus.TOO_MANY_REQUESTS;
  readonly category = ErrorCategory.SYSTEM;

  constructor(limit: number, windowMs: number, retryAfterMs?: number, context: Record<string, unknown> = {}) {
    super(`Rate limit exceeded: ${limit} requests per ${windowMs}ms`, { limit, windowMs, retryAfterMs, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Wait before making additional requests',
      'Implement exponential backoff in retry logic',
      'Reduce request frequency',
      'Contact administrator if limits seem too restrictive',
    ];
  }

  override isRecoverable(): boolean {
    return true;
  }
}

// ============================================================================
// Business Logic Errors
// ============================================================================

export class BusinessLogicError extends BaseFrameworkError {
  readonly code = 'BUSINESS_LOGIC_ERROR';
  readonly statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly category = ErrorCategory.BUSINESS_LOGIC;

  constructor(operation: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Business logic error in '${operation}': ${reason}`, { operation, reason, ...context });
  }

  override getSuggestions(): string[] {
    return [
      'Review business rules and constraints',
      'Check data integrity and relationships',
      'Verify operation preconditions are met',
      'Consult business requirements documentation',
    ];
  }
}

// ============================================================================
// Error Factory and Utilities
// ============================================================================

/**
 * Factory class for creating standardized errors
 */
export class ErrorFactory {
  static validation(
    message: string,
    validationErrors: string[] = [],
    context: Record<string, unknown> = {}
  ): ValidationError {
    return new ValidationError(message, validationErrors, context);
  }

  static schemaValidation(
    schemaName: string,
    errors: string[] = [],
    context: Record<string, unknown> = {}
  ): SchemaValidationError {
    return new SchemaValidationError(schemaName, errors, context);
  }

  static security(
    message: string,
    violations: string[] = [],
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    context: Record<string, unknown> = {}
  ): SecurityError {
    return new SecurityError(message, violations, riskLevel, context);
  }

  static authentication(
    message = 'Authentication required',
    context: Record<string, unknown> = {}
  ): AuthenticationError {
    return new AuthenticationError(message, context);
  }

  static authorization(
    requiredPermission?: string,
    operation?: string,
    context: Record<string, unknown> = {}
  ): AuthorizationError {
    return new AuthorizationError(requiredPermission, operation, context);
  }

  static notFound(resource: string, identifier?: string, context: Record<string, unknown> = {}): NotFoundError {
    return new NotFoundError(resource, identifier, context);
  }

  static conflict(message: string, conflictType?: string, context: Record<string, unknown> = {}): ConflictError {
    return new ConflictError(message, conflictType, context);
  }

  static configuration(configKey?: string, reason?: string, context: Record<string, unknown> = {}): ConfigurationError {
    return new ConfigurationError(configKey, reason, context);
  }

  static network(
    operation: string,
    target?: string,
    originalError?: Error,
    context: Record<string, unknown> = {}
  ): NetworkError {
    return new NetworkError(operation, target, originalError, context);
  }

  static timeout(operation: string, timeoutMs: number, context: Record<string, unknown> = {}): TimeoutError {
    return new TimeoutError(operation, timeoutMs, context);
  }

  static database(
    operation: string,
    table?: string,
    originalError?: Error,
    context: Record<string, unknown> = {}
  ): DatabaseError {
    return new DatabaseError(operation, table, originalError, context);
  }

  static fileSystem(
    operation: string,
    path?: string,
    originalError?: Error,
    context: Record<string, unknown> = {}
  ): FileSystemError {
    return new FileSystemError(operation, path, originalError, context);
  }

  static fileSize(
    actualSize: number,
    maxSize: number,
    fileName?: string,
    context: Record<string, unknown> = {}
  ): FileSizeError {
    return new FileSizeError(actualSize, maxSize, fileName, context);
  }

  static system(message: string, context: Record<string, unknown> = {}): SystemError {
    return new SystemError(message, context);
  }

  static rateLimit(
    limit: number,
    windowMs: number,
    retryAfterMs?: number,
    context: Record<string, unknown> = {}
  ): RateLimitError {
    return new RateLimitError(limit, windowMs, retryAfterMs, context);
  }

  static businessLogic(operation: string, reason: string, context: Record<string, unknown> = {}): BusinessLogicError {
    return new BusinessLogicError(operation, reason, context);
  }
}

/**
 * Error handling utility functions
 */
export class ErrorUtils {
  /**
   * Convert any error to standardized framework error
   */
  static normalize(error: unknown, context: Record<string, unknown> = {}): BaseFrameworkError {
    if (error instanceof BaseFrameworkError) {
      return error;
    }

    if (error instanceof HttpException) {
      return ErrorFactory.system(error.message, {
        httpStatus: error.getStatus(),
        originalError: error,
        ...context,
      });
    }

    if (error instanceof Error) {
      return ErrorFactory.system(error.message, {
        originalError: error,
        stack: error.stack,
        ...context,
      });
    }

    return ErrorFactory.system('Unknown error occurred', {
      originalError: error,
      ...context,
    });
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error: BaseFrameworkError): boolean {
    return error.isRecoverable();
  }

  /**
   * Extract error information for logging
   */
  static extractForLogging(error: BaseFrameworkError): {
    message: string;
    code: string;
    category: ErrorCategory;
    correlationId: string;
    context: Record<string, unknown>;
    stack?: string;
  } {
    return {
      message: error.message,
      code: error.code,
      category: error.category,
      correlationId: error.correlationId,
      context: error.context,
      stack: error.stack,
    };
  }

  /**
   * Create error response for API endpoints
   */
  static toApiResponse(error: BaseFrameworkError, path?: string, method?: string): StandardErrorResponse {
    return {
      statusCode: error.statusCode,
      message: error.message,
      error: error.name,
      code: error.code,
      category: error.category,
      context: error.context,
      correlationId: error.correlationId,
      timestamp: error.timestamp,
      suggestions: error.getSuggestions(),
      recoverable: error.isRecoverable(),
      path,
      method,
    };
  }
}
