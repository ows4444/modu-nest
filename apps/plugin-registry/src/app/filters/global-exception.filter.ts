/**
 * Global Exception Filter
 * 
 * Provides standardized error response format across all controllers
 * in the plugin registry application.
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StandardErrorResponse } from '../types/error-response.types';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine HTTP status
    const httpStatus = this.getHttpStatus(exception);
    
    // Generate standardized error response
    const errorResponse = this.createErrorResponse(exception, request, httpStatus);

    // Log the error with appropriate level
    this.logError(exception, request, httpStatus, errorResponse);

    // Send standardized response
    response.status(httpStatus).json(errorResponse);
  }

  private getHttpStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    
    // Handle specific error types
    if (exception instanceof Error) {
      if (exception.name === 'ValidationError') {
        return HttpStatus.BAD_REQUEST;
      }
      if (exception.name === 'UnauthorizedError') {
        return HttpStatus.UNAUTHORIZED;
      }
      if (exception.name === 'ForbiddenError') {
        return HttpStatus.FORBIDDEN;
      }
      if (exception.name === 'NotFoundError') {
        return HttpStatus.NOT_FOUND;
      }
      if (exception.name === 'ConflictError') {
        return HttpStatus.CONFLICT;
      }
      if (exception.name === 'TooManyRequestsError') {
        return HttpStatus.TOO_MANY_REQUESTS;
      }
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private createErrorResponse(
    exception: unknown,
    request: Request,
    httpStatus: number
  ): StandardErrorResponse {
    const timestamp = new Date().toISOString();
    const path = request.url;
    const method = request.method;
    const correlationId = this.generateCorrelationId();

    let message: string;
    let code: string;
    let details: Record<string, unknown> | undefined = undefined;
    let stack: string | undefined = undefined;

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.getErrorCode(httpStatus);
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string) || exception.message;
        code = (responseObj.code as string) || this.getErrorCode(httpStatus);
        details = responseObj.details as Record<string, unknown>;
      } else {
        message = exception.message;
        code = this.getErrorCode(httpStatus);
      }
    } else if (exception instanceof Error) {
      message = exception.message || 'Internal server error';
      code = this.getErrorCode(httpStatus, exception.name);
      
      // Include stack trace in development
      if (process.env.NODE_ENV !== 'production') {
        stack = exception.stack;
      }
    } else {
      message = 'An unexpected error occurred';
      code = this.getErrorCode(httpStatus);
    }

    return {
      success: false,
      error: {
        code,
        message,
        details,
        timestamp,
        path,
        method,
        correlationId,
        ...(stack && { stack }),
      },
    };
  }

  private getErrorCode(httpStatus: number, errorName?: string): string {
    // Map specific error names to codes
    if (errorName) {
      switch (errorName) {
        case 'ValidationError':
          return 'VALIDATION_FAILED';
        case 'UnauthorizedError':
          return 'AUTHENTICATION_REQUIRED';
        case 'ForbiddenError':
          return 'INSUFFICIENT_PERMISSIONS';
        case 'NotFoundError':
          return 'RESOURCE_NOT_FOUND';
        case 'ConflictError':
          return 'RESOURCE_CONFLICT';
        case 'TooManyRequestsError':
          return 'RATE_LIMIT_EXCEEDED';
      }
    }

    // Map HTTP status to error codes
    switch (httpStatus) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.METHOD_NOT_ALLOWED:
        return 'METHOD_NOT_ALLOWED';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'INTERNAL_SERVER_ERROR';
      case HttpStatus.BAD_GATEWAY:
        return 'BAD_GATEWAY';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      case HttpStatus.GATEWAY_TIMEOUT:
        return 'GATEWAY_TIMEOUT';
      default:
        return 'UNKNOWN_ERROR';
    }
  }

  private logError(
    exception: unknown,
    request: Request,
    httpStatus: number,
    errorResponse: StandardErrorResponse
  ): void {
    const logContext = {
      correlationId: errorResponse.error.correlationId,
      method: request.method,
      url: request.url,
      userAgent: request.get('User-Agent'),
      ip: request.ip,
      httpStatus,
    };

    if (httpStatus >= 500) {
      // Server errors - log as error with full details
      this.logger.error(
        `Internal server error: ${errorResponse.error.message}`,
        {
          ...logContext,
          exception: exception instanceof Error ? exception.stack : exception,
        }
      );
    } else if (httpStatus === 429) {
      // Rate limiting - log as warning
      this.logger.warn(
        `Rate limit exceeded: ${errorResponse.error.message}`,
        logContext
      );
    } else if (httpStatus >= 400) {
      // Client errors - log as debug/info
      this.logger.debug(
        `Client error: ${errorResponse.error.message}`,
        logContext
      );
    }
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * Specialized exception filter for plugin-related operations
 * Provides enhanced error context for plugin operations
 */
@Catch()
export class PluginOperationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PluginOperationExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Extract plugin information from request
    const pluginName = this.extractPluginName(request);
    const operation = this.extractOperation(request);

    // Use global filter for standardized response
    const globalFilter = new GlobalExceptionFilter();
    const httpStatus = this.getHttpStatus(exception);
    const errorResponse = this.enhanceErrorResponse(
      globalFilter['createErrorResponse'](exception, request, httpStatus),
      pluginName,
      operation
    );

    // Enhanced logging for plugin operations
    this.logPluginError(exception, request, httpStatus, pluginName, operation);

    response.status(httpStatus).json(errorResponse);
  }

  private getHttpStatus(exception: unknown): number {
    const globalFilter = new GlobalExceptionFilter();
    return globalFilter['getHttpStatus'](exception);
  }

  private extractPluginName(request: Request): string | undefined {
    // Try to extract plugin name from URL parameters
    const params = request.params as Record<string, string>;
    return params?.name || params?.pluginName;
  }

  private extractOperation(request: Request): string {
    const method = request.method.toLowerCase();
    const path = request.url;

    if (path.includes('/upload') || (method === 'post' && path.endsWith('/plugins'))) {
      return 'upload';
    }
    if (path.includes('/download')) {
      return 'download';
    }
    if (method === 'delete') {
      return 'delete';
    }
    if (method === 'get' && path.includes('/plugins/')) {
      return 'retrieve';
    }
    if (method === 'get' && path.endsWith('/plugins')) {
      return 'list';
    }
    if (path.includes('/search')) {
      return 'search';
    }
    if (path.includes('/trust')) {
      return 'trust-management';
    }

    return 'unknown';
  }

  private enhanceErrorResponse(
    baseResponse: StandardErrorResponse,
    pluginName?: string,
    operation?: string
  ): StandardErrorResponse {
    return {
      ...baseResponse,
      error: {
        ...baseResponse.error,
        context: {
          pluginName,
          operation,
          service: 'plugin-registry',
        },
      },
    };
  }

  private logPluginError(
    exception: unknown,
    request: Request,
    httpStatus: number,
    pluginName?: string,
    operation?: string
  ): void {
    const logContext = {
      pluginName,
      operation,
      method: request.method,
      url: request.url,
      userAgent: request.get('User-Agent'),
      ip: request.ip,
      httpStatus,
      service: 'plugin-registry',
    };

    const message = exception instanceof Error ? exception.message : String(exception);

    if (httpStatus >= 500) {
      this.logger.error(`Plugin operation failed: ${message}`, {
        ...logContext,
        exception: exception instanceof Error ? exception.stack : exception,
      });
    } else if (httpStatus === 429) {
      this.logger.warn(`Plugin operation rate limited: ${message}`, logContext);
    } else if (httpStatus >= 400) {
      this.logger.debug(`Plugin operation client error: ${message}`, logContext);
    }
  }
}