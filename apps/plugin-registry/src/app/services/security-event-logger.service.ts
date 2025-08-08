/**
 * Security Event Logger Service
 * 
 * Provides structured logging for security events in plugin registry operations.
 * Designed for SIEM integration and compliance monitoring.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';

/**
 * Security event severity levels
 */
export enum SecurityEventSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Security event categories
 */
export enum SecurityEventCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  ACCESS_CONTROL = 'access-control',
  DATA_PROTECTION = 'data-protection',
  PLUGIN_SECURITY = 'plugin-security',
  TRUST_VIOLATION = 'trust-violation',
  CAPABILITY_VIOLATION = 'capability-violation',
  RATE_LIMITING = 'rate-limiting',
  VALIDATION = 'validation',
  UPLOAD_SECURITY = 'upload-security',
  DOWNLOAD_TRACKING = 'download-tracking',
  ADMIN_OPERATIONS = 'admin-operations',
  SUSPICIOUS_ACTIVITY = 'suspicious-activity',
}

/**
 * Security event actions
 */
export enum SecurityEventAction {
  ALLOW = 'allow',
  DENY = 'deny',
  BLOCK = 'block',
  WARN = 'warn',
  QUARANTINE = 'quarantine',
  AUDIT = 'audit',
}

/**
 * Base security event interface
 */
export interface BaseSecurityEvent {
  /** Unique event identifier */
  eventId: string;
  /** Event timestamp in ISO format */
  timestamp: string;
  /** Event category */
  category: SecurityEventCategory;
  /** Event severity */
  severity: SecurityEventSeverity;
  /** Action taken */
  action: SecurityEventAction;
  /** Event description */
  description: string;
  /** Source system/component */
  source: string;
  /** User/actor information */
  actor?: {
    type: 'user' | 'system' | 'plugin' | 'anonymous';
    identifier?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  /** Resource being accessed */
  resource?: {
    type: 'plugin' | 'endpoint' | 'file' | 'configuration';
    identifier: string;
    version?: string;
  };
  /** Additional context */
  context?: Record<string, unknown>;
  /** Correlation ID for request tracking */
  correlationId?: string;
}

/**
 * Plugin security event
 */
export interface PluginSecurityEvent extends BaseSecurityEvent {
  category: SecurityEventCategory.PLUGIN_SECURITY;
  resource: {
    type: 'plugin';
    identifier: string;
    version?: string;
  };
  securityDetails: {
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
    threats: string[];
    scanType: 'upload' | 'validation' | 'runtime';
    blocked: boolean;
  };
}

/**
 * Trust violation event
 */
export interface TrustViolationEvent extends BaseSecurityEvent {
  category: SecurityEventCategory.TRUST_VIOLATION;
  trustDetails: {
    currentTrustLevel: string;
    requiredTrustLevel: string;
    violationType: string;
    operation: string;
  };
}

/**
 * Rate limiting event
 */
export interface RateLimitEvent extends BaseSecurityEvent {
  category: SecurityEventCategory.RATE_LIMITING;
  rateLimitDetails: {
    rule: string;
    limit: number;
    current: number;
    windowMs: number;
    blocked: boolean;
  };
}

/**
 * Admin operation event
 */
export interface AdminOperationEvent extends BaseSecurityEvent {
  category: SecurityEventCategory.ADMIN_OPERATIONS;
  adminDetails: {
    operation: string;
    targetResource?: string;
    parameters?: Record<string, unknown>;
    successful: boolean;
  };
}

/**
 * Security event logger service
 */
@Injectable()
export class SecurityEventLoggerService {
  private readonly logger = new Logger(SecurityEventLoggerService.name);
  private readonly eventCounter = new Map<string, number>();

  /**
   * Log a generic security event
   */
  logSecurityEvent(event: BaseSecurityEvent): void {
    const enrichedEvent = this.enrichEvent(event);
    
    // Log with appropriate level based on severity
    switch (event.severity) {
      case SecurityEventSeverity.CRITICAL:
        this.logger.error(this.formatSecurityLog(enrichedEvent));
        break;
      case SecurityEventSeverity.HIGH:
        this.logger.error(this.formatSecurityLog(enrichedEvent));
        break;
      case SecurityEventSeverity.MEDIUM:
        this.logger.warn(this.formatSecurityLog(enrichedEvent));
        break;
      case SecurityEventSeverity.LOW:
        this.logger.log(this.formatSecurityLog(enrichedEvent));
        break;
      case SecurityEventSeverity.INFO:
      default:
        this.logger.debug(this.formatSecurityLog(enrichedEvent));
        break;
    }

    // Update event counter
    this.updateEventCounter(event.category, event.severity);
  }

  /**
   * Log plugin security event
   */
  logPluginSecurityEvent(
    pluginName: string,
    threatLevel: 'low' | 'medium' | 'high' | 'critical',
    threats: string[],
    scanType: 'upload' | 'validation' | 'runtime',
    blocked: boolean,
    request?: Request
  ): void {
    const event: PluginSecurityEvent = {
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
      category: SecurityEventCategory.PLUGIN_SECURITY,
      severity: this.mapThreatLevelToSeverity(threatLevel),
      action: blocked ? SecurityEventAction.BLOCK : SecurityEventAction.WARN,
      description: `Plugin security scan detected ${threats.length} threat(s) in ${pluginName}`,
      source: 'plugin-registry',
      actor: request ? this.extractActorInfo(request) : undefined,
      resource: {
        type: 'plugin',
        identifier: pluginName,
      },
      securityDetails: {
        threatLevel,
        threats,
        scanType,
        blocked,
      },
      correlationId: this.extractCorrelationId(request),
    };

    this.logSecurityEvent(event);
  }

  /**
   * Log trust violation event
   */
  logTrustViolationEvent(
    pluginName: string,
    currentTrustLevel: string,
    requiredTrustLevel: string,
    violationType: string,
    operation: string,
    request?: Request
  ): void {
    const event: TrustViolationEvent = {
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
      category: SecurityEventCategory.TRUST_VIOLATION,
      severity: SecurityEventSeverity.HIGH,
      action: SecurityEventAction.DENY,
      description: `Trust violation: Plugin ${pluginName} (${currentTrustLevel}) attempted ${operation} requiring ${requiredTrustLevel}`,
      source: 'plugin-registry',
      actor: request ? this.extractActorInfo(request) : undefined,
      resource: {
        type: 'plugin',
        identifier: pluginName,
      },
      trustDetails: {
        currentTrustLevel,
        requiredTrustLevel,
        violationType,
        operation,
      },
      correlationId: this.extractCorrelationId(request),
    };

    this.logSecurityEvent(event);
  }

  /**
   * Log rate limiting event
   */
  logRateLimitEvent(
    rule: string,
    limit: number,
    current: number,
    windowMs: number,
    blocked: boolean,
    request?: Request
  ): void {
    const event: RateLimitEvent = {
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
      category: SecurityEventCategory.RATE_LIMITING,
      severity: blocked ? SecurityEventSeverity.MEDIUM : SecurityEventSeverity.LOW,
      action: blocked ? SecurityEventAction.BLOCK : SecurityEventAction.WARN,
      description: `Rate limit ${blocked ? 'exceeded' : 'approaching'} for rule ${rule}: ${current}/${limit}`,
      source: 'plugin-registry',
      actor: request ? this.extractActorInfo(request) : undefined,
      resource: {
        type: 'endpoint',
        identifier: request?.url || 'unknown',
      },
      rateLimitDetails: {
        rule,
        limit,
        current,
        windowMs,
        blocked,
      },
      correlationId: this.extractCorrelationId(request),
    };

    this.logSecurityEvent(event);
  }

  /**
   * Log admin operation event
   */
  logAdminOperationEvent(
    operation: string,
    successful: boolean,
    targetResource?: string,
    parameters?: Record<string, unknown>,
    request?: Request
  ): void {
    const event: AdminOperationEvent = {
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
      category: SecurityEventCategory.ADMIN_OPERATIONS,
      severity: successful ? SecurityEventSeverity.INFO : SecurityEventSeverity.MEDIUM,
      action: successful ? SecurityEventAction.ALLOW : SecurityEventAction.DENY,
      description: `Admin operation ${operation} ${successful ? 'successful' : 'failed'}`,
      source: 'plugin-registry',
      actor: request ? this.extractActorInfo(request) : undefined,
      resource: targetResource ? {
        type: 'plugin',
        identifier: targetResource,
      } : undefined,
      adminDetails: {
        operation,
        targetResource,
        parameters,
        successful,
      },
      correlationId: this.extractCorrelationId(request),
    };

    this.logSecurityEvent(event);
  }

  /**
   * Log capability violation event
   */
  logCapabilityViolationEvent(
    pluginName: string,
    capability: string,
    reason: string,
    request?: Request
  ): void {
    const event: BaseSecurityEvent = {
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
      category: SecurityEventCategory.CAPABILITY_VIOLATION,
      severity: SecurityEventSeverity.MEDIUM,
      action: SecurityEventAction.DENY,
      description: `Capability violation: Plugin ${pluginName} denied access to ${capability} - ${reason}`,
      source: 'plugin-registry',
      actor: request ? this.extractActorInfo(request) : undefined,
      resource: {
        type: 'plugin',
        identifier: pluginName,
      },
      context: {
        capability,
        reason,
      },
      correlationId: this.extractCorrelationId(request),
    };

    this.logSecurityEvent(event);
  }

  /**
   * Log suspicious activity
   */
  logSuspiciousActivity(
    description: string,
    severity: SecurityEventSeverity,
    context?: Record<string, unknown>,
    request?: Request
  ): void {
    const event: BaseSecurityEvent = {
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
      category: SecurityEventCategory.SUSPICIOUS_ACTIVITY,
      severity,
      action: SecurityEventAction.AUDIT,
      description: `Suspicious activity detected: ${description}`,
      source: 'plugin-registry',
      actor: request ? this.extractActorInfo(request) : undefined,
      context,
      correlationId: this.extractCorrelationId(request),
    };

    this.logSecurityEvent(event);
  }

  /**
   * Get security event statistics
   */
  getSecurityEventStats(): Record<string, Record<string, number>> {
    const stats: Record<string, Record<string, number>> = {};
    
    for (const [key, count] of this.eventCounter.entries()) {
      const [category, severity] = key.split(':');
      if (!stats[category]) {
        stats[category] = {};
      }
      stats[category][severity] = count;
    }

    return stats;
  }

  /**
   * Clear security event statistics
   */
  clearSecurityEventStats(): void {
    this.eventCounter.clear();
  }

  // Private helper methods

  private enrichEvent(event: BaseSecurityEvent): BaseSecurityEvent {
    return {
      ...event,
      context: {
        ...event.context,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'unknown',
        hostname: process.env.HOSTNAME || 'unknown',
      },
    };
  }

  private formatSecurityLog(event: BaseSecurityEvent): string {
    // Format as JSON for structured logging
    return JSON.stringify({
      '@timestamp': event.timestamp,
      '@version': '1',
      security_event: true,
      event_id: event.eventId,
      category: event.category,
      severity: event.severity,
      action: event.action,
      description: event.description,
      source: event.source,
      actor: event.actor,
      resource: event.resource,
      correlation_id: event.correlationId,
      ...event.context,
    });
  }

  private generateEventId(): string {
    return `sec-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  private mapThreatLevelToSeverity(threatLevel: string): SecurityEventSeverity {
    switch (threatLevel) {
      case 'critical':
        return SecurityEventSeverity.CRITICAL;
      case 'high':
        return SecurityEventSeverity.HIGH;
      case 'medium':
        return SecurityEventSeverity.MEDIUM;
      case 'low':
        return SecurityEventSeverity.LOW;
      default:
        return SecurityEventSeverity.INFO;
    }
  }

  private extractActorInfo(request: Request): BaseSecurityEvent['actor'] {
    return {
      type: 'anonymous', // Could be enhanced with authentication info
      ipAddress: request.ip || request.connection?.remoteAddress,
      userAgent: request.get('User-Agent'),
    };
  }

  private extractCorrelationId(request?: Request): string | undefined {
    return request?.headers['x-correlation-id'] as string || 
           request?.headers['x-request-id'] as string;
  }

  private updateEventCounter(category: SecurityEventCategory, severity: SecurityEventSeverity): void {
    const key = `${category}:${severity}`;
    const current = this.eventCounter.get(key) || 0;
    this.eventCounter.set(key, current + 1);
  }
}