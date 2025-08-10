/**
 * Plugin Event Monitor Service
 *
 * A centralized service for monitoring and logging all plugin events.
 * Provides comprehensive monitoring, alerting, and analytics capabilities
 * for the plugin system's event-driven architecture.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PluginEvent,
  IPluginEventSubscriber,
  PluginDiscoveredEvent,
  PluginLoadingStartedEvent,
  PluginLoadingProgressEvent,
  PluginLoadedEvent,
  PluginLoadFailedEvent,
  PluginUnloadedEvent,
  PluginReloadedEvent,
  PluginStateChangedEvent,
  PluginDependencyResolvedEvent,
  PluginDependencyFailedEvent,
  PluginUploadStartedEvent,
  PluginValidationStartedEvent,
  PluginValidationCompletedEvent,
  PluginStoredEvent,
  PluginDownloadedEvent,
  PluginDeletedEvent,
  PluginSecurityScanStartedEvent,
  PluginSecurityScanCompletedEvent,
  PluginSecurityViolationEvent,
  PluginPerformanceEvent,
  PluginCircuitBreakerEvent,
  PluginCacheEvent,
  PluginErrorEvent,
} from '@modu-nest/plugin-core';
import { PluginEventEmitter } from './plugin-event-emitter';

export interface EventMetrics {
  total: number;
  lastHour: number;
  lastDay: number;
  averagePerMinute: number;
}

export interface PluginEventStats {
  eventCounts: Record<string, EventMetrics>;
  pluginActivity: Record<string, EventMetrics>;
  errorStats: {
    total: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
  performanceStats: {
    averageLoadTime: number;
    slowestPlugins: Array<{ name: string; loadTime: number }>;
    memoryUsage: Record<string, number>;
  };
  systemHealth: {
    uptime: number;
    totalEvents: number;
    eventsPerSecond: number;
    activePlugins: number;
    failedPlugins: number;
  };
}

@Injectable()
export class PluginEventMonitorService implements IPluginEventSubscriber {
  private readonly logger = new Logger(PluginEventMonitorService.name);

  // Event tracking
  private eventHistory: Array<{ event: PluginEvent; timestamp: Date }> = [];
  private eventCounts = new Map<string, number>();
  private pluginActivity = new Map<string, { events: number; lastSeen: Date }>();

  // Performance tracking
  private loadTimes = new Map<string, number>();
  private memoryUsage = new Map<string, number>();

  // Error tracking
  private errorCounts = new Map<string, number>();
  private errorsByCategory = new Map<string, number>();
  private errorsBySeverity = new Map<string, number>();

  // System metrics
  private startTime = new Date();
  private totalEventsProcessed = 0;

  // Configuration
  private readonly maxHistorySize = 10000;
  private readonly cleanupInterval = 3600000; // 1 hour

  constructor() {
    // Periodic cleanup of old events
    setInterval(() => this.cleanupOldEvents(), this.cleanupInterval);

    this.logger.log('PluginEventMonitorService initialized');
  }

  subscribeToEvents(eventEmitter: PluginEventEmitter): void {
    // Subscribe to all plugin events for comprehensive monitoring

    // Discovery and loading events
    eventEmitter.on('plugin.discovered', (event: PluginDiscoveredEvent) => {
      this.trackEvent(event);
      this.logger.debug(`📦 Plugin discovered: ${event.pluginName} at ${event.pluginPath}`);
    });

    eventEmitter.on('plugin.loading.started', (event: PluginLoadingStartedEvent) => {
      this.trackEvent(event);
      this.logger.log(`🔄 Loading started: ${event.pluginName} using ${event.loadingStrategy} strategy`);
    });

    eventEmitter.on('plugin.loading.progress', (event: PluginLoadingProgressEvent) => {
      this.trackEvent(event);
      this.logger.debug(`⏳ Loading progress: ${event.pluginName} - ${event.phase} (${event.progress}%)`);
    });

    eventEmitter.on('plugin.loaded', (event: PluginLoadedEvent) => {
      this.trackEvent(event);
      this.trackLoadTime(event.pluginName, event.loadTimeMs);
      if (event.memoryUsage) {
        this.trackMemoryUsage(event.pluginName, event.memoryUsage);
      }
      this.logger.log(`✅ Plugin loaded: ${event.pluginName} in ${event.loadTimeMs}ms`);
    });

    eventEmitter.on('plugin.load.failed', (event: PluginLoadFailedEvent) => {
      this.trackEvent(event);
      this.trackError('load-failure', 'high', 'loading');
      this.logger.error(
        `❌ Plugin load failed: ${event.pluginName} in ${event.phase} - ${
          event.error instanceof Error ? event.error.message : String(event.error)
        }`
      );
    });

    eventEmitter.on('plugin.unloaded', (event: PluginUnloadedEvent) => {
      this.trackEvent(event);
      this.logger.log(`🗑️ Plugin unloaded: ${event.pluginName} (reason: ${event.reason})`);
    });

    eventEmitter.on('plugin.reloaded', (event: PluginReloadedEvent) => {
      this.trackEvent(event);
      this.logger.log(`🔄 Plugin reloaded: ${event.pluginName} ${event.hotReload ? '(hot)' : '(cold)'}`);
    });

    // State change events
    eventEmitter.on('plugin.state.changed', (event: PluginStateChangedEvent) => {
      this.trackEvent(event);
      this.logger.debug(`🔄 State change: ${event.pluginName} ${event.fromState || 'null'} → ${event.toState}`);
    });

    // Dependency events
    eventEmitter.on('plugin.dependency.resolved', (event: PluginDependencyResolvedEvent) => {
      this.trackEvent(event);
      this.logger.debug(
        `🔗 Dependency resolved: ${event.pluginName} → ${event.dependency} (${event.resolutionTimeMs}ms)`
      );
    });

    eventEmitter.on('plugin.dependency.failed', (event: PluginDependencyFailedEvent) => {
      this.trackEvent(event);
      this.trackError('dependency-failure', 'medium', 'loading');
      this.logger.warn(
        `🔗❌ Dependency failed: ${event.pluginName} → ${event.dependency}${event.timeout ? ' (timeout)' : ''} - ${
          event.error instanceof Error ? event.error.message : String(event.error)
        }`
      );
    });

    // Registry events
    eventEmitter.on('plugin.upload.started', (event: PluginUploadStartedEvent) => {
      this.trackEvent(event);
      this.logger.log(`📤 Upload started: ${event.pluginName} (${(event.fileSize / 1024 / 1024).toFixed(2)}MB)`);
    });

    eventEmitter.on('plugin.validation.started', (event: PluginValidationStartedEvent) => {
      this.trackEvent(event);
      this.logger.debug(`🔍 Validation started: ${event.pluginName} - ${event.validationType}`);
    });

    eventEmitter.on('plugin.validation.completed', (event: PluginValidationCompletedEvent) => {
      this.trackEvent(event);
      const status = event.isValid ? '✅' : '❌';
      const cache = event.cacheHit ? ' (cached)' : '';
      this.logger.debug(`${status} Validation: ${event.pluginName} - ${event.validationType}${cache}`);

      if (!event.isValid) {
        this.trackError('validation-failure', 'medium', 'validation');
      }
    });

    eventEmitter.on('plugin.stored', (event: PluginStoredEvent) => {
      this.trackEvent(event);
      this.logger.log(`💾 Plugin stored: ${event.pluginName} v${event.metadata.version}`);
    });

    eventEmitter.on('plugin.downloaded', (event: PluginDownloadedEvent) => {
      this.trackEvent(event);
      this.logger.log(`📥 Plugin downloaded: ${event.pluginName} by ${event.userAgent || 'unknown'}`);
    });

    eventEmitter.on('plugin.deleted', (event: PluginDeletedEvent) => {
      this.trackEvent(event);
      this.logger.log(`🗑️ Plugin deleted: ${event.pluginName} (${event.reason})`);
    });

    // Security events
    eventEmitter.on('plugin.security.scan.started', (event: PluginSecurityScanStartedEvent) => {
      this.trackEvent(event);
      this.logger.debug(`🔒 Security scan started: ${event.pluginName} - ${event.scanType}`);
    });

    eventEmitter.on('plugin.security.scan.completed', (event: PluginSecurityScanCompletedEvent) => {
      this.trackEvent(event);
      const riskEmoji = this.getRiskEmoji(event.riskLevel);
      this.logger.debug(
        `🔒${riskEmoji} Security scan: ${event.pluginName} - ${event.riskLevel} risk${
          event.cacheHit ? ' (cached)' : ''
        }`
      );

      if (event.threats.length > 0) {
        this.logger.warn(`🚨 Security threats found in ${event.pluginName}: ${event.threats.join(', ')}`);
      }
    });

    eventEmitter.on('plugin.security.violation', (event: PluginSecurityViolationEvent) => {
      this.trackEvent(event);
      this.trackError('security-violation', event.severity as 'low' | 'medium' | 'high' | 'critical', 'security');
      const blocked = event.blocked ? '🚫 BLOCKED' : '⚠️ ALLOWED';
      this.logger.error(
        `🚨 ${blocked} Security violation: ${event.pluginName} - ${event.violationType} (${event.severity})`
      );
    });

    // Performance events
    eventEmitter.on('plugin.performance', (event: PluginPerformanceEvent) => {
      this.trackEvent(event);
      if (event.exceeded) {
        this.logger.warn(
          `⚡ Performance threshold exceeded: ${event.pluginName} ${event.metric}=${event.value}${event.unit} (limit: ${event.threshold})`
        );
      }
    });

    // Circuit breaker events
    eventEmitter.on('plugin.circuit-breaker', (event: PluginCircuitBreakerEvent) => {
      this.trackEvent(event);
      const stateEmoji = event.state === 'open' ? '🔴' : event.state === 'half-open' ? '🟡' : '🟢';
      this.logger.warn(`${stateEmoji} Circuit breaker ${event.state}: ${event.pluginName} - ${event.reason}`);
    });

    // Cache events
    eventEmitter.on('plugin.cache', (event: PluginCacheEvent) => {
      this.trackEvent(event);
      const hitEmoji = event.operation === 'hit' ? '🎯' : event.operation === 'miss' ? '❌' : '🧹';
      this.logger.debug(`${hitEmoji} Cache ${event.operation}: ${event.pluginName} - ${event.cacheType}`);
    });

    // Error events
    eventEmitter.on('plugin.error', (event: PluginErrorEvent) => {
      this.trackEvent(event);
      this.trackError(
        'general-error',
        event.severity as 'low' | 'medium' | 'high' | 'critical',
        event.category as 'validation' | 'loading' | 'runtime' | 'security' | 'network'
      );

      const severityEmoji = this.getSeverityEmoji(event.severity);
      const recoverable = event.recoverable ? '🔄' : '💀';

      if (event.severity === 'critical' || event.severity === 'high') {
        this.logger.error(
          `${severityEmoji}${recoverable} ${event.severity.toUpperCase()} ERROR: ${event.pluginName} (${
            event.category
          }) - ${event.error instanceof Error ? event.error.message : String(event.error)}`,
          event.error instanceof Error ? event.error.stack : undefined
        );
      } else {
        this.logger.warn(
          `${severityEmoji}${recoverable} ${event.severity} error: ${event.pluginName} (${event.category}) - ${
            event.error instanceof Error ? event.error.message : String(event.error)
          }`
        );
      }
    });

    this.logger.log('Subscribed to all plugin events for monitoring');
  }

  unsubscribeFromEvents(eventEmitter: PluginEventEmitter): void {
    eventEmitter.removeAllListeners();
    this.logger.log('Unsubscribed from all plugin events');
  }

  // Event tracking methods
  private trackEvent(event: PluginEvent): void {
    this.totalEventsProcessed++;

    // Track event counts
    const eventType = event.type;
    this.eventCounts.set(eventType, (this.eventCounts.get(eventType) || 0) + 1);

    // Track plugin activity
    const pluginName = event.pluginName;
    const activity = this.pluginActivity.get(pluginName) || { events: 0, lastSeen: new Date() };
    activity.events++;
    activity.lastSeen = new Date();
    this.pluginActivity.set(pluginName, activity);

    // Add to history
    this.eventHistory.push({ event, timestamp: new Date() });

    // Trim history if needed
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private trackLoadTime(pluginName: string, loadTimeMs: number): void {
    this.loadTimes.set(pluginName, loadTimeMs);
  }

  private trackMemoryUsage(pluginName: string, memoryBytes: number): void {
    this.memoryUsage.set(pluginName, memoryBytes);
  }

  private trackError(
    type: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    category: 'validation' | 'loading' | 'runtime' | 'security' | 'network'
  ): void {
    this.errorCounts.set(type, (this.errorCounts.get(type) || 0) + 1);
    this.errorsBySeverity.set(severity, (this.errorsBySeverity.get(severity) || 0) + 1);
    this.errorsByCategory.set(category, (this.errorsByCategory.get(category) || 0) + 1);
  }

  // Cleanup methods
  private cleanupOldEvents(): void {
    const oneHourAgo = new Date(Date.now() - 3600000);
    const initialLength = this.eventHistory.length;

    this.eventHistory = this.eventHistory.filter(({ timestamp }) => timestamp > oneHourAgo);

    const removed = initialLength - this.eventHistory.length;
    if (removed > 0) {
      this.logger.debug(`Cleaned up ${removed} old events from history`);
    }
  }

  // Statistics and reporting methods
  getEventStats(): PluginEventStats {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);
    const oneDayAgo = new Date(now.getTime() - 86400000);

    // Calculate event metrics
    const eventCounts: Record<string, EventMetrics> = {};
    for (const [eventType, count] of this.eventCounts.entries()) {
      const recentEvents = this.eventHistory.filter(
        ({ event, timestamp }) => event.type === eventType && timestamp > oneHourAgo
      );
      const dayEvents = this.eventHistory.filter(
        ({ event, timestamp }) => event.type === eventType && timestamp > oneDayAgo
      );

      eventCounts[eventType] = {
        total: count,
        lastHour: recentEvents.length,
        lastDay: dayEvents.length,
        averagePerMinute: dayEvents.length / (24 * 60),
      };
    }

    // Calculate plugin activity metrics
    const pluginActivity: Record<string, EventMetrics> = {};
    for (const [pluginName, activity] of this.pluginActivity.entries()) {
      const recentEvents = this.eventHistory.filter(
        ({ event, timestamp }) => event.pluginName === pluginName && timestamp > oneHourAgo
      );
      const dayEvents = this.eventHistory.filter(
        ({ event, timestamp }) => event.pluginName === pluginName && timestamp > oneDayAgo
      );

      pluginActivity[pluginName] = {
        total: activity.events,
        lastHour: recentEvents.length,
        lastDay: dayEvents.length,
        averagePerMinute: dayEvents.length / (24 * 60),
      };
    }

    // Calculate performance stats
    const loadTimeArray = Array.from(this.loadTimes.values());
    const averageLoadTime =
      loadTimeArray.length > 0 ? loadTimeArray.reduce((a, b) => a + b, 0) / loadTimeArray.length : 0;

    const slowestPlugins = Array.from(this.loadTimes.entries())
      .map(([name, loadTime]) => ({ name, loadTime }))
      .sort((a, b) => b.loadTime - a.loadTime)
      .slice(0, 10);

    const memoryUsage = Object.fromEntries(this.memoryUsage);

    // Calculate system health
    const uptime = now.getTime() - this.startTime.getTime();
    const eventsPerSecond = this.totalEventsProcessed / (uptime / 1000);
    const activePlugins = Array.from(this.pluginActivity.keys()).length;
    const failedPlugins = this.errorsByCategory.get('loading') || 0;

    return {
      eventCounts,
      pluginActivity,
      errorStats: {
        total: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
        bySeverity: Object.fromEntries(this.errorsBySeverity),
        byCategory: Object.fromEntries(this.errorsByCategory),
      },
      performanceStats: {
        averageLoadTime,
        slowestPlugins,
        memoryUsage,
      },
      systemHealth: {
        uptime,
        totalEvents: this.totalEventsProcessed,
        eventsPerSecond,
        activePlugins,
        failedPlugins,
      },
    };
  }

  getRecentEvents(limit = 100): Array<{ event: PluginEvent; timestamp: Date }> {
    return this.eventHistory.slice(-limit);
  }

  getPluginHistory(pluginName: string, limit = 50): Array<{ event: PluginEvent; timestamp: Date }> {
    return this.eventHistory.filter(({ event }) => event.pluginName === pluginName).slice(-limit);
  }

  // Utility methods
  private getRiskEmoji(riskLevel: string): string {
    switch (riskLevel) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '💀';
      case 'high':
        return '🚨';
      case 'medium':
        return '⚠️';
      case 'low':
        return 'ℹ️';
      default:
        return '❓';
    }
  }

  // Health check method
  isHealthy(): boolean {
    const stats = this.getEventStats();
    const criticalErrors = stats.errorStats.bySeverity.critical || 0;
    const highErrors = stats.errorStats.bySeverity.high || 0;

    // System is unhealthy if there are critical errors or too many high-severity errors
    return criticalErrors === 0 && highErrors < 10;
  }

  // Reset methods for testing
  reset(): void {
    this.eventHistory = [];
    this.eventCounts.clear();
    this.pluginActivity.clear();
    this.loadTimes.clear();
    this.memoryUsage.clear();
    this.errorCounts.clear();
    this.errorsByCategory.clear();
    this.errorsBySeverity.clear();
    this.totalEventsProcessed = 0;
    this.startTime = new Date();

    this.logger.log('Event monitor state reset');
  }
}
