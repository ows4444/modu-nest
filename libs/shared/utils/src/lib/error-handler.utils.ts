import { Logger } from '@nestjs/common';
import { 
  ErrorFactory, 
  ErrorUtils, 
  StandardErrorResponse 
} from './standard-errors';

/**
 * @deprecated Use ErrorFactory and BaseFrameworkError classes for new code
 * This class is maintained for backward compatibility
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp?: string;
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

/**
 * Enhanced error handler using standardized error system
 * @deprecated Use ErrorFactory and ErrorUtils for new implementations
 */
export class ErrorHandler {
  private static readonly logger = new Logger('ErrorHandler');

  /**
   * Handle errors with standardized format
   */
  static handleError(error: unknown, context?: string): ErrorResponse {
    this.logger.error(`Error in ${context || 'unknown context'}:`, error);

    // Convert to standardized framework error
    const frameworkError = ErrorUtils.normalize(error, { context });
    const logInfo = ErrorUtils.extractForLogging(frameworkError);
    
    this.logger.error(
      `[${logInfo.correlationId}] ${logInfo.category}:${logInfo.code} - ${logInfo.message}`,
      logInfo.context
    );

    // Return in legacy format for backward compatibility
    return {
      success: false,
      error: {
        code: frameworkError.code,
        message: frameworkError.message,
        details: {
          category: frameworkError.category,
          correlationId: frameworkError.correlationId,
          context: frameworkError.context,
          suggestions: frameworkError.getSuggestions(),
          recoverable: frameworkError.isRecoverable(),
          ...(process.env.NODE_ENV === 'development' && { stack: frameworkError.stack }),
        },
        timestamp: frameworkError.timestamp,
      },
    };
  }

  /**
   * Handle errors with standardized response format
   */
  static handleErrorStandardized(error: unknown, path?: string, method?: string, context?: Record<string, any>): StandardErrorResponse {
    const frameworkError = ErrorUtils.normalize(error, context);
    const logInfo = ErrorUtils.extractForLogging(frameworkError);
    
    this.logger.error(
      `[${logInfo.correlationId}] ${logInfo.category}:${logInfo.code} - ${logInfo.message}`,
      { path, method, ...logInfo.context }
    );

    return ErrorUtils.toApiResponse(frameworkError, path, method);
  }

  static createSuccessResponse<T>(data: T, includeTimestamp = true): SuccessResponse<T> {
    return {
      success: true,
      data,
      ...(includeTimestamp && { timestamp: new Date().toISOString() }),
    };
  }

  // ============================================================================
  // Standardized Error Throwing Methods
  // ============================================================================

  static throwNotFound(resource: string, id?: string, context: Record<string, any> = {}): never {
    throw ErrorFactory.notFound(resource, id, context).toHttpException();
  }

  static throwBadRequest(message: string, details?: any): never {
    throw ErrorFactory.validation(message, [], { details }).toHttpException();
  }

  static throwConflict(message: string, details?: any): never {
    throw ErrorFactory.conflict(message, undefined, { details }).toHttpException();
  }

  static throwForbidden(message: string, context: Record<string, any> = {}): never {
    throw ErrorFactory.authorization(undefined, undefined, { originalMessage: message, ...context }).toHttpException();
  }

  static throwUnauthorized(message: string, context: Record<string, any> = {}): never {
    throw ErrorFactory.authentication(message, context).toHttpException();
  }

  static throwValidation(message: string, validationErrors: string[] = [], context: Record<string, any> = {}): never {
    throw ErrorFactory.validation(message, validationErrors, context).toHttpException();
  }

  static throwConfiguration(configKey?: string, reason?: string, context: Record<string, any> = {}): never {
    throw ErrorFactory.configuration(configKey, reason, context).toHttpException();
  }

  static throwNetwork(operation: string, target?: string, originalError?: Error, context: Record<string, any> = {}): never {
    throw ErrorFactory.network(operation, target, originalError, context).toHttpException();
  }

  static throwTimeout(operation: string, timeoutMs: number, context: Record<string, any> = {}): never {
    throw ErrorFactory.timeout(operation, timeoutMs, context).toHttpException();
  }

  static throwDatabase(operation: string, table?: string, originalError?: Error, context: Record<string, any> = {}): never {
    throw ErrorFactory.database(operation, table, originalError, context).toHttpException();
  }

  static throwFileSystem(operation: string, path?: string, originalError?: Error, context: Record<string, any> = {}): never {
    throw ErrorFactory.fileSystem(operation, path, originalError, context).toHttpException();
  }

  static throwRateLimit(limit: number, windowMs: number, retryAfterMs?: number, context: Record<string, any> = {}): never {
    throw ErrorFactory.rateLimit(limit, windowMs, retryAfterMs, context).toHttpException();
  }

  static throwBusinessLogic(operation: string, reason: string, context: Record<string, any> = {}): never {
    throw ErrorFactory.businessLogic(operation, reason, context).toHttpException();
  }
}