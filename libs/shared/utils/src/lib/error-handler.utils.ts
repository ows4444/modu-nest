import { HttpException, HttpStatus, Logger } from '@nestjs/common';

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

export class ErrorHandler {
  private static readonly logger = new Logger('ErrorHandler');

  static handleError(error: unknown, context?: string): ErrorResponse {
    this.logger.error(`Error in ${context || 'unknown context'}:`, error);

    if (error instanceof HttpException) {
      const status = error.getStatus();
      const response = error.getResponse();
      
      return {
        success: false,
        error: {
          code: `HTTP_${status}`,
          message: typeof response === 'string' ? response : (response as any)?.message || error.message,
          details: typeof response === 'object' ? response : undefined,
          timestamp: new Date().toISOString(),
        },
      };
    }

    if (error instanceof Error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
        timestamp: new Date().toISOString(),
      },
    };
  }

  static createSuccessResponse<T>(data: T, includeTimestamp = true): SuccessResponse<T> {
    return {
      success: true,
      data,
      ...(includeTimestamp && { timestamp: new Date().toISOString() }),
    };
  }

  static throwNotFound(resource: string, id?: string): never {
    const message = id 
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;
    throw new HttpException(message, HttpStatus.NOT_FOUND);
  }

  static throwBadRequest(message: string, details?: any): never {
    throw new HttpException(
      { message, details },
      HttpStatus.BAD_REQUEST
    );
  }

  static throwConflict(message: string, details?: any): never {
    throw new HttpException(
      { message, details },
      HttpStatus.CONFLICT
    );
  }

  static throwForbidden(message: string): never {
    throw new HttpException(message, HttpStatus.FORBIDDEN);
  }

  static throwUnauthorized(message: string): never {
    throw new HttpException(message, HttpStatus.UNAUTHORIZED);
  }
}