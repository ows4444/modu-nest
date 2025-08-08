/**
 * Standardized Error Response Types
 *
 * Provides consistent error response format for all plugin registry endpoints.
 */

/**
 * Standard error details
 */
export interface ErrorDetails {
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error context */
  details?: Record<string, unknown>;
  /** ISO timestamp when error occurred */
  timestamp: string;
  /** Request path where error occurred */
  path: string;
  /** HTTP method used */
  method: string;
  /** Unique correlation ID for error tracking */
  correlationId: string;
  /** Additional context for the error */
  context?: {
    pluginName?: string;
    operation?: string;
    service?: string;
    [key: string]: unknown;
  };
  /** Stack trace (development only) */
  stack?: string;
}

/**
 * Standard error response format
 */
export interface StandardErrorResponse {
  /** Always false for error responses */
  success: false;
  /** Error details */
  error: ErrorDetails;
}

/**
 * Standard success response format
 */
export interface StandardSuccessResponse<T = unknown> {
  /** Always true for success responses */
  success: true;
  /** Response data */
  data?: T;
  /** Success message */
  message?: string;
  /** Additional metadata */
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    timestamp?: string;
    [key: string]: unknown;
  };
}

/**
 * Union type for all standard responses
 */
export type StandardResponse<T = unknown> = StandardSuccessResponse<T> | StandardErrorResponse;

/**
 * Validation error details
 */
export interface ValidationErrorDetails {
  field: string;
  value?: unknown;
  constraints: Record<string, string>;
}

/**
 * Enhanced error response for validation errors
 */
export interface ValidationErrorResponse extends StandardErrorResponse {
  error: ErrorDetails & {
    code: 'VALIDATION_FAILED';
    validationErrors: ValidationErrorDetails[];
  };
}

/**
 * Rate limiting error response
 */
export interface RateLimitErrorResponse extends StandardErrorResponse {
  error: ErrorDetails & {
    code: 'RATE_LIMIT_EXCEEDED';
    rateLimitDetails: {
      rule: string;
      limit: number;
      remaining: number;
      resetTime: string;
    };
  };
}

/**
 * Plugin-specific error response
 */
export interface PluginErrorResponse extends StandardErrorResponse {
  error: ErrorDetails & {
    context: {
      pluginName: string;
      operation: string;
      service: 'plugin-registry';
      [key: string]: unknown;
    };
  };
}

/**
 * Security event error response
 */
export interface SecurityErrorResponse extends StandardErrorResponse {
  error: ErrorDetails & {
    context: {
      securityEventId: string;
      threatLevel: 'low' | 'medium' | 'high' | 'critical';
      action: string;
      [key: string]: unknown;
    };
  };
}
