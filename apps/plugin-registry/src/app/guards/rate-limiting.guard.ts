import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { PluginRateLimitingService, RateLimitResult } from '../services/plugin-rate-limiting.service';

export interface RateLimitOptions {
  ruleName: string;
  identifierExtractor?: (req: Request) => string;
  skipIf?: (req: Request) => boolean;
  onRateLimitReached?: (req: Request, result: RateLimitResult) => void;
}

// Decorator to apply rate limiting to a route
export const RateLimit = (options: RateLimitOptions) => SetMetadata('rateLimit', options);

// Pre-defined decorators for common scenarios
export const UploadRateLimit = () =>
  RateLimit({
    ruleName: 'plugin-upload',
    identifierExtractor: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
  });

export const DownloadRateLimit = () =>
  RateLimit({
    ruleName: 'plugin-download',
    identifierExtractor: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
  });

export const ApiRateLimit = () =>
  RateLimit({
    ruleName: 'general-api',
    identifierExtractor: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
  });

export const SearchRateLimit = () =>
  RateLimit({
    ruleName: 'plugin-search',
    identifierExtractor: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
  });

export const AdminRateLimit = () =>
  RateLimit({
    ruleName: 'admin-operations',
    identifierExtractor: (req) => {
      // Could use user ID from authentication if available
      // For now, use IP address
      return req.ip || req.connection?.remoteAddress || 'unknown';
    },
  });

@Injectable()
export class RateLimitingGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitingGuard.name);

  constructor(private readonly rateLimitingService: PluginRateLimitingService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimitOptions = this.reflector.get<RateLimitOptions>('rateLimit', context.getHandler());

    if (!rateLimitOptions) {
      // No rate limiting configured for this route
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Check if we should skip rate limiting for this request
    if (rateLimitOptions.skipIf && rateLimitOptions.skipIf(request)) {
      return true;
    }

    // Extract identifier (usually IP address, but could be user ID, API key, etc.)
    const identifier = rateLimitOptions.identifierExtractor
      ? rateLimitOptions.identifierExtractor(request)
      : this.getDefaultIdentifier(request);

    if (!identifier || identifier === 'unknown') {
      this.logger.warn('Could not extract identifier for rate limiting, allowing request');
      return true;
    }

    // Check rate limit
    const result = await this.rateLimitingService.enforceRateLimit(
      rateLimitOptions.ruleName,
      identifier,
      `${request.method} ${request.path}`
    );

    // Add rate limit headers to response
    this.addRateLimitHeaders(response, result);

    if (!result.allowed) {
      // Call custom handler if provided
      if (rateLimitOptions.onRateLimitReached) {
        rateLimitOptions.onRateLimitReached(request, result);
      }

      // Log rate limit violation
      this.logger.warn(
        `Rate limit exceeded: ${rateLimitOptions.ruleName} for ${this.sanitizeIdentifier(identifier)} ` +
          `on ${request.method} ${request.path}`
      );

      // Throw HTTP exception
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: this.getRateLimitMessage(rateLimitOptions.ruleName),
          retryAfter: result.retryAfter,
          limit: this.rateLimitingService.getRule(rateLimitOptions.ruleName)?.maxRequests,
          remaining: result.remaining,
          resetTime: result.resetTime,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }

  /**
   * Get default identifier from request (IP address)
   */
  private getDefaultIdentifier(request: Request): string {
    // Try various ways to get the client IP
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const forwardedIps = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return forwardedIps.split(',')[0].trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string') {
      return realIp;
    }

    return request.ip || request.connection?.remoteAddress || 'unknown';
  }

  /**
   * Add rate limit headers to the response
   */
  private addRateLimitHeaders(response: Response, result: RateLimitResult): void {
    const rule = this.rateLimitingService.getRule(result.rule);

    if (rule) {
      response.setHeader('X-RateLimit-Limit', rule.maxRequests);
      response.setHeader('X-RateLimit-Remaining', result.remaining);
      response.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
      response.setHeader('X-RateLimit-Window', rule.windowMs);
    }

    if (result.retryAfter) {
      response.setHeader('Retry-After', result.retryAfter);
    }
  }

  /**
   * Get user-friendly rate limit message
   */
  private getRateLimitMessage(ruleName: string): string {
    const rule = this.rateLimitingService.getRule(ruleName);

    if (rule?.message) {
      return rule.message;
    }

    const messages: Record<string, string> = {
      'plugin-upload': 'Too many plugin uploads. Please wait before uploading another plugin.',
      'plugin-download': 'Too many plugin downloads. Please wait before downloading more plugins.',
      'general-api': 'Too many API requests. Please wait before making more requests.',
      'plugin-search': 'Too many search requests. Please wait before searching again.',
      'admin-operations': 'Too many administrative operations. Please wait before performing more admin actions.',
    };

    return messages[ruleName] || 'Rate limit exceeded. Please try again later.';
  }

  /**
   * Sanitize identifier for logging
   */
  private sanitizeIdentifier(identifier: string): string {
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(identifier)) {
      return identifier.replace(/\.\d{1,3}$/, '.xxx');
    }

    if (identifier.length > 8) {
      return identifier.substring(0, 4) + '****' + identifier.substring(identifier.length - 2);
    }

    return '****';
  }
}

/**
 * Interceptor to add rate limit headers to all responses (optional)
 */
import { Injectable as InterceptorInjectable, NestInterceptor, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@InterceptorInjectable()
export class RateLimitHeadersInterceptor implements NestInterceptor {
  constructor(private readonly rateLimitingService: PluginRateLimitingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        // Add general rate limiting information to response headers
        const stats = this.rateLimitingService.getRateLimitStats();
        response.setHeader('X-RateLimit-Rules', stats.totalRules);
        response.setHeader('X-RateLimit-Service', 'plugin-registry');
      })
    );
  }
}
