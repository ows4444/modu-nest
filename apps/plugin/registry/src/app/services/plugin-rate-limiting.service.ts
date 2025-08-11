import { Injectable, Logger } from '@nestjs/common';
import { PluginSecurityError, PluginErrorMetrics } from '@plugin/core';

export interface RateLimitRule {
  name: string;
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (identifier: string) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Skip counting successful requests
  skipFailedRequests?: boolean; // Skip counting failed requests
  message?: string; // Custom error message
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequestTime: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  rule: string;
}

export interface RateLimitStats {
  totalRules: number;
  activeWindows: number;
  totalRequests: number;
  rejectedRequests: number;
  memoryUsage: number;
  rules: Array<{
    name: string;
    maxRequests: number;
    windowMs: number;
    activeEntries: number;
  }>;
}

@Injectable()
export class PluginRateLimitingService {
  private readonly logger = new Logger(PluginRateLimitingService.name);
  private errorMetrics = PluginErrorMetrics.getInstance();

  // In-memory storage for rate limiting data
  // In production, consider using Redis for distributed systems
  private readonly rateLimitData = new Map<string, Map<string, RateLimitEntry>>();
  private readonly rules = new Map<string, RateLimitRule>();

  // Statistics tracking
  private totalRequests = 0;
  private rejectedRequests = 0;

  constructor() {
    this.initializeDefaultRules();
    this.startCleanupTimer();
    this.logger.log('Rate limiting service initialized with default rules');
  }

  /**
   * Initialize default rate limiting rules from environment variables
   */
  private initializeDefaultRules(): void {
    // Plugin upload rate limiting (more restrictive)
    this.addRule({
      name: 'plugin-upload',
      windowMs: parseInt(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || '60000', 10), // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || '5', 10), // 5 uploads per minute
      message: 'Too many plugin uploads. Try again later.',
    });

    // Plugin download rate limiting
    this.addRule({
      name: 'plugin-download',
      windowMs: parseInt(process.env.RATE_LIMIT_DOWNLOAD_WINDOW_MS || '60000', 10), // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_DOWNLOAD_MAX || '50', 10), // 50 downloads per minute
      message: 'Too many plugin downloads. Try again later.',
    });

    // General API rate limiting
    this.addRule({
      name: 'general-api',
      windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || '60000', 10), // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_API_MAX || '100', 10), // 100 requests per minute
      message: 'Too many API requests. Try again later.',
    });

    // Search API rate limiting (to prevent abuse)
    this.addRule({
      name: 'plugin-search',
      windowMs: parseInt(process.env.RATE_LIMIT_SEARCH_WINDOW_MS || '60000', 10), // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_SEARCH_MAX || '30', 10), // 30 searches per minute
      message: 'Too many search requests. Try again later.',
    });

    // Admin operations rate limiting (most restrictive)
    this.addRule({
      name: 'admin-operations',
      windowMs: parseInt(process.env.RATE_LIMIT_ADMIN_WINDOW_MS || '300000', 10), // 5 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_ADMIN_MAX || '10', 10), // 10 admin operations per 5 minutes
      message: 'Too many administrative operations. Try again later.',
    });

    this.logger.log(`Initialized ${this.rules.size} rate limiting rules`);
  }

  /**
   * Add a new rate limiting rule
   */
  addRule(rule: RateLimitRule): void {
    this.rules.set(rule.name, rule);
    this.rateLimitData.set(rule.name, new Map());
    this.logger.debug(`Added rate limiting rule: ${rule.name} (${rule.maxRequests}/${rule.windowMs}ms)`);
  }

  /**
   * Remove a rate limiting rule
   */
  removeRule(ruleName: string): boolean {
    const removed = this.rules.delete(ruleName);
    this.rateLimitData.delete(ruleName);
    if (removed) {
      this.logger.debug(`Removed rate limiting rule: ${ruleName}`);
    }
    return removed;
  }

  /**
   * Check if a request is allowed under the specified rule
   */
  checkRateLimit(ruleName: string, identifier: string): RateLimitResult {
    this.totalRequests++;

    const rule = this.rules.get(ruleName);
    if (!rule) {
      this.logger.warn(`Rate limiting rule not found: ${ruleName}`);
      return {
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetTime: Date.now(),
        rule: ruleName,
      };
    }

    const key = rule.keyGenerator ? rule.keyGenerator(identifier) : identifier;
    const ruleData = this.rateLimitData.get(ruleName);
    if (!ruleData) {
      this.logger.error(`Rate limiting data not found for rule: ${ruleName}`);
      return {
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetTime: Date.now(),
        rule: ruleName,
      };
    }

    const now = Date.now();
    const entry = ruleData.get(key);

    if (!entry) {
      // First request for this identifier
      ruleData.set(key, {
        count: 1,
        resetTime: now + rule.windowMs,
        firstRequestTime: now,
      });

      return {
        allowed: true,
        remaining: rule.maxRequests - 1,
        resetTime: now + rule.windowMs,
        rule: ruleName,
      };
    }

    // Check if the window has expired
    if (now >= entry.resetTime) {
      // Reset the window
      entry.count = 1;
      entry.resetTime = now + rule.windowMs;
      entry.firstRequestTime = now;

      return {
        allowed: true,
        remaining: rule.maxRequests - 1,
        resetTime: entry.resetTime,
        rule: ruleName,
      };
    }

    // Check if the request exceeds the limit
    if (entry.count >= rule.maxRequests) {
      this.rejectedRequests++;
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

      this.logger.warn(
        `Rate limit exceeded for ${ruleName}: ${identifier} (${entry.count}/${rule.maxRequests}, retry after ${retryAfter}s)`
      );

      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
        retryAfter,
        rule: ruleName,
      };
    }

    // Increment the counter
    entry.count++;

    return {
      allowed: true,
      remaining: rule.maxRequests - entry.count,
      resetTime: entry.resetTime,
      rule: ruleName,
    };
  }

  /**
   * Record a request attempt and enforce rate limiting
   */
  async enforceRateLimit(ruleName: string, identifier: string, operation: string): Promise<RateLimitResult> {
    const result = this.checkRateLimit(ruleName, identifier);

    if (!result.allowed) {
      const rule = this.rules.get(ruleName);
      const message = rule?.message || `Rate limit exceeded for ${ruleName}`;

      const error = new PluginSecurityError(
        'rate-limit',
        [
          message,
          `Requests: ${this.getRuleMaxRequests(ruleName)}/${this.getRuleWindowMs(ruleName)}ms`,
          `Retry after: ${result.retryAfter} seconds`,
        ],
        'medium'
      );

      this.errorMetrics.recordError(error, {
        operation,
        userAgent: this.sanitizeIdentifier(identifier),
        retryAfter: result.retryAfter,
      });

      // Don't throw the error, just return the result
      // The caller (guard) will handle the rejection
    }

    return result;
  }

  /**
   * Get rate limiting statistics
   */
  getRateLimitStats(): RateLimitStats {
    let totalActiveWindows = 0;
    let totalMemoryUsage = 0;

    const rulesStats = Array.from(this.rules.entries()).map(([name, rule]) => {
      const ruleData = this.rateLimitData.get(name);
      const activeEntries = ruleData ? ruleData.size : 0;
      totalActiveWindows += activeEntries;
      totalMemoryUsage += activeEntries * 64; // Rough estimate of memory per entry

      return {
        name,
        maxRequests: rule.maxRequests,
        windowMs: rule.windowMs,
        activeEntries,
      };
    });

    return {
      totalRules: this.rules.size,
      activeWindows: totalActiveWindows,
      totalRequests: this.totalRequests,
      rejectedRequests: this.rejectedRequests,
      memoryUsage: totalMemoryUsage,
      rules: rulesStats,
    };
  }

  /**
   * Get current rate limit status for a specific identifier and rule
   */
  getRateLimitStatus(ruleName: string, identifier: string): RateLimitResult | null {
    const rule = this.rules.get(ruleName);
    if (!rule) {
      return null;
    }

    const key = rule.keyGenerator ? rule.keyGenerator(identifier) : identifier;
    const ruleData = this.rateLimitData.get(ruleName);
    const entry = ruleData?.get(key);

    if (!entry) {
      return {
        allowed: true,
        remaining: rule.maxRequests,
        resetTime: Date.now() + rule.windowMs,
        rule: ruleName,
      };
    }

    const now = Date.now();
    const isExpired = now >= entry.resetTime;

    return {
      allowed: isExpired || entry.count < rule.maxRequests,
      remaining: isExpired ? rule.maxRequests : Math.max(0, rule.maxRequests - entry.count),
      resetTime: isExpired ? now + rule.windowMs : entry.resetTime,
      rule: ruleName,
    };
  }

  /**
   * Reset rate limit for a specific identifier and rule
   */
  resetRateLimit(ruleName: string, identifier: string): boolean {
    const rule = this.rules.get(ruleName);
    if (!rule) {
      return false;
    }

    const key = rule.keyGenerator ? rule.keyGenerator(identifier) : identifier;
    const ruleData = this.rateLimitData.get(ruleName);
    if (!ruleData) {
      return false;
    }

    const removed = ruleData.delete(key);
    if (removed) {
      this.logger.log(`Reset rate limit for ${ruleName}: ${this.sanitizeIdentifier(identifier)}`);
    }
    return removed;
  }

  /**
   * Clear all rate limiting data
   */
  clearAllRateLimits(): void {
    for (const ruleData of this.rateLimitData.values()) {
      ruleData.clear();
    }
    this.totalRequests = 0;
    this.rejectedRequests = 0;
    this.logger.log('Cleared all rate limiting data');
  }

  /**
   * Get rule configuration
   */
  getRule(ruleName: string): RateLimitRule | undefined {
    return this.rules.get(ruleName);
  }

  /**
   * Get all rule names
   */
  getRuleNames(): string[] {
    return Array.from(this.rules.keys());
  }

  /**
   * Helper method to get rule max requests
   */
  private getRuleMaxRequests(ruleName: string): number {
    return this.rules.get(ruleName)?.maxRequests || 0;
  }

  /**
   * Helper method to get rule window ms
   */
  private getRuleWindowMs(ruleName: string): number {
    return this.rules.get(ruleName)?.windowMs || 0;
  }

  /**
   * Sanitize identifier for logging (remove sensitive information)
   */
  private sanitizeIdentifier(identifier: string): string {
    // If it looks like an IP address, mask the last octet
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(identifier)) {
      return identifier.replace(/\.\d{1,3}$/, '.xxx');
    }

    // For other identifiers, show only first few characters
    if (identifier.length > 8) {
      return identifier.substring(0, 4) + '****' + identifier.substring(identifier.length - 2);
    }

    return '****';
  }

  /**
   * Start background cleanup timer to remove expired entries
   */
  private startCleanupTimer(): void {
    const cleanupInterval = parseInt(process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS || '300000', 10); // 5 minutes

    setInterval(() => {
      this.cleanup();
    }, cleanupInterval);

    this.logger.debug(`Started rate limit cleanup timer with interval: ${cleanupInterval}ms`);
  }

  /**
   * Clean up expired rate limiting entries
   */
  private cleanup(): void {
    const now = Date.now();
    let totalCleaned = 0;

    for (const [ruleName, ruleData] of this.rateLimitData) {
      let cleaned = 0;

      for (const [key, entry] of ruleData) {
        if (now >= entry.resetTime) {
          ruleData.delete(key);
          cleaned++;
        }
      }

      totalCleaned += cleaned;

      if (cleaned > 0) {
        this.logger.debug(`Cleaned ${cleaned} expired entries for rule: ${ruleName}`);
      }
    }

    if (totalCleaned > 0) {
      this.logger.log(`Rate limit cleanup completed: removed ${totalCleaned} expired entries`);
    }
  }
}
