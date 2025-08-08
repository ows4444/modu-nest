/**
 * Response Utilities
 * 
 * Provides helper functions for creating standardized response objects.
 */

import { StandardSuccessResponse, type StandardResponse } from '../types/error-response.types';

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T = unknown>(
  data?: T,
  message?: string,
  meta?: Record<string, unknown>
): StandardSuccessResponse<T> {
  const response: StandardSuccessResponse<T> = {
    success: true,
  };

  if (data !== undefined) {
    response.data = data;
  }

  if (message) {
    response.message = message;
  }

  if (meta) {
    response.meta = {
      timestamp: new Date().toISOString(),
      ...meta,
    };
  }

  return response;
}

/**
 * Create a paginated success response
 */
export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
  message?: string
): StandardSuccessResponse<T[]> {
  return createSuccessResponse(data, message, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  });
}

/**
 * Create a simple success message response
 */
export function createMessageResponse(message: string): StandardSuccessResponse {
  return createSuccessResponse(undefined, message);
}

/**
 * Response decorator for controllers
 */
export function StandardResponse(message?: string) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const result = await originalMethod.apply(this, args);
      
      // If result is already a standard response, return as-is
      if (result && typeof result === 'object' && 'success' in result) {
        return result as StandardResponse;
      }
      
      // Wrap in standard response
      return createSuccessResponse(result, message);
    };

    return descriptor;
  };
}