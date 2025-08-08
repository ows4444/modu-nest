import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Error handling and utility functions
 */

/**
 * Extracts error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as any).message === 'string') {
      return (error as any).message;
    }

    return JSON.stringify(error);
  }

  return String(error);
}

/**
 * Extracts error stack from various error types
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }

  if (error && typeof error === 'object' && 'stack' in error) {
    return String((error as any).stack);
  }

  return undefined;
}

/**
 * Type guard to check if error is an HttpException
 */
export function isHttpException(error: unknown): error is HttpException {
  return error instanceof HttpException;
}

/**
 * Creates a standardized error response object
 */
export function createErrorResponse(
  message: string,
  details?: any,
  statusCode?: number
): {
  message: string;
  details?: any;
  statusCode?: number;
  timestamp: string;
} {
  return {
    message,
    details,
    statusCode,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Wraps a function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => any>(
  fn: T,
  errorHandler?: (error: unknown) => void
): T {
  return ((...args: any[]) => {
    try {
      const result = fn(...args);

      if (result instanceof Promise) {
        return result.catch((error) => {
          if (errorHandler) {
            errorHandler(error);
          }
          throw error;
        });
      }

      return result;
    } catch (error) {
      if (errorHandler) {
        errorHandler(error);
      }
      throw error;
    }
  }) as T;
}

/**
 * Wraps an async function with error handling
 */
export function withAsyncErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorHandler?: (error: unknown) => Promise<void> | void
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorHandler) {
        await errorHandler(error);
      }
      throw error;
    }
  }) as T;
}

/**
 * Retries an operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Creates an error with additional context
 */
export class ContextualError extends Error {
  constructor(message: string, public readonly context: Record<string, any>, public readonly originalError?: Error) {
    super(message);
    this.name = 'ContextualError';

    if (originalError) {
      this.stack = originalError.stack;
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      stack: this.stack,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : undefined,
    };
  }
}

/**
 * Aggregates multiple errors into a single error
 */
export class AggregateError extends Error {
  constructor(public readonly errors: Error[], message?: string) {
    super(message || `Multiple errors occurred (${errors.length})`);
    this.name = 'AggregateError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errors: this.errors.map((error) => ({
        name: error.name,
        message: error.message,
        stack: error.stack,
      })),
      stack: this.stack,
    };
  }
}

/**
 * Formats an error for logging
 */
export function formatErrorForLogging(error: unknown): {
  message: string;
  stack?: string;
  context?: any;
} {
  const message = getErrorMessage(error);
  const stack = getErrorStack(error);

  let context: any;
  if (error instanceof ContextualError) {
    context = error.context;
  } else if (error instanceof AggregateError) {
    context = { errorCount: error.errors.length };
  } else if (isHttpException(error)) {
    context = { statusCode: error.getStatus() };
  }

  return { message, stack, context };
}

/**
 * Checks if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (isHttpException(error)) {
    const status = error.getStatus();
    // Retry on 5xx errors and some 4xx errors
    return status >= 500 || status === HttpStatus.TOO_MANY_REQUESTS;
  }

  if (error instanceof Error) {
    // Common retryable error patterns
    const retryablePatterns = [/timeout/i, /connection/i, /network/i, /econnreset/i, /enotfound/i, /etimedout/i];

    return retryablePatterns.some((pattern) => pattern.test(error.message));
  }

  return false;
}
