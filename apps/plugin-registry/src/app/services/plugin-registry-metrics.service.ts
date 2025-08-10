import { Injectable, Logger } from '@nestjs/common';

// Registry-specific metrics interfaces
export interface RegistryMetrics {
  uploads: OperationMetrics;
  downloads: OperationMetrics;
  validations: OperationMetrics;
  searches: OperationMetrics;
  storage: StorageMetrics;
  performance: PerformanceMetrics;
  security: SecurityMetrics;
  cache: CacheMetrics;
  system: SystemMetrics;
}

export interface OperationMetrics {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  averageResponseTime: number;
  medianResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughputPerMinute: number;
  concurrentOperations: number;
  peakConcurrentOperations: number;
}

export interface StorageMetrics {
  totalPlugins: number;
  totalVersions: number;
  totalSizeBytes: number;
  averagePluginSize: number;
  storageUtilization: number;
  compressionRatio: number;
  duplicateDetections: number;
}

export interface PerformanceMetrics {
  databaseQueryTimes: {
    average: number;
    median: number;
    p95: number;
    p99: number;
    slowQueries: number;
  };
  validationTimes: {
    manifest: number;
    security: number;
    structure: number;
    signature: number;
  };
  optimizationSavings: {
    totalSizeReduction: number;
    averageCompressionRatio: number;
    optimizationCount: number;
  };
}

export interface SecurityMetrics {
  threatsDetected: number;
  signatureValidations: {
    successful: number;
    failed: number;
    warnings: number;
  };
  trustViolations: number;
  quarantinedPlugins: number;
  securityScansPerformed: number;
  riskLevelDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  cacheSize: number;
  evictions: number;
  averageRetrievalTime: number;
  cacheEfficiencyScore: number;
}

export interface SystemMetrics {
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpuUsage: number;
  eventLoopLag: number;
  activeConnections: number;
  uptime: number;
  errorRate: number;
  healthScore: number;
}

export interface MetricDataPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface OperationEvent {
  operation: string;
  duration: number;
  success: boolean;
  metadata?: Record<string, any>;
  timestamp: Date;
}

/**
 * Comprehensive metrics and monitoring service for Plugin Registry
 * Tracks performance, usage, security, and system health metrics
 */
@Injectable()
export class PluginRegistryMetricsService {
  private readonly logger = new Logger(PluginRegistryMetricsService.name);
  
  // Metrics storage
  private metrics!: RegistryMetrics;
  private operationHistory: OperationEvent[] = [];
  private responseTimeHistory: Map<string, number[]> = new Map();
  private metricsHistory: Map<string, MetricDataPoint[]> = new Map();
  
  // Configuration
  private readonly maxHistorySize = 10000;
  private readonly metricsRetentionDays = 30;
  private readonly performanceThresholds = {
    responseTime: 5000, // 5 seconds
    errorRate: 0.05, // 5%
    memoryUsage: 0.8, // 80%
    cpuUsage: 0.8, // 80%
  };
  
  // Tracking state
  private startTime = Date.now();
  
  constructor() {
    this.initializeMetrics();
    this.startMetricsCollection();
    this.logger.log('Plugin Registry Metrics Service initialized');
  }

  private initializeMetrics(): void {
    this.metrics = {
      uploads: this.createEmptyOperationMetrics(),
      downloads: this.createEmptyOperationMetrics(),
      validations: this.createEmptyOperationMetrics(),
      searches: this.createEmptyOperationMetrics(),
      storage: {
        totalPlugins: 0,
        totalVersions: 0,
        totalSizeBytes: 0,
        averagePluginSize: 0,
        storageUtilization: 0,
        compressionRatio: 0,
        duplicateDetections: 0,
      },
      performance: {
        databaseQueryTimes: {
          average: 0,
          median: 0,
          p95: 0,
          p99: 0,
          slowQueries: 0,
        },
        validationTimes: {
          manifest: 0,
          security: 0,
          structure: 0,
          signature: 0,
        },
        optimizationSavings: {
          totalSizeReduction: 0,
          averageCompressionRatio: 0,
          optimizationCount: 0,
        },
      },
      security: {
        threatsDetected: 0,
        signatureValidations: {
          successful: 0,
          failed: 0,
          warnings: 0,
        },
        trustViolations: 0,
        quarantinedPlugins: 0,
        securityScansPerformed: 0,
        riskLevelDistribution: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 0,
        },
      },
      cache: {
        hitRate: 0,
        missRate: 0,
        totalHits: 0,
        totalMisses: 0,
        cacheSize: 0,
        evictions: 0,
        averageRetrievalTime: 0,
        cacheEfficiencyScore: 0,
      },
      system: {
        memoryUsage: {
          heapUsed: 0,
          heapTotal: 0,
          external: 0,
          rss: 0,
        },
        cpuUsage: 0,
        eventLoopLag: 0,
        activeConnections: 0,
        uptime: 0,
        errorRate: 0,
        healthScore: 100,
      },
    };
  }

  private createEmptyOperationMetrics(): OperationMetrics {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      successRate: 0,
      averageResponseTime: 0,
      medianResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      throughputPerMinute: 0,
      concurrentOperations: 0,
      peakConcurrentOperations: 0,
    };
  }

  private startMetricsCollection(): void {
    // Update metrics every 30 seconds
    setInterval(() => {
      this.updateSystemMetrics();
      this.calculateDerivedMetrics();
      this.cleanupOldMetrics();
    }, 30000);
    
    // Update performance metrics every 5 seconds
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 5000);
  }

  // ====================
  // Operation Tracking
  // ====================

  /**
   * Record a plugin upload operation
   */
  recordUpload(duration: number, success: boolean, pluginSize: number, metadata?: Record<string, any>): void {
    this.recordOperation('upload', duration, success, { pluginSize, ...metadata });
    this.updateStorageMetrics(pluginSize);
  }

  /**
   * Record a plugin download operation
   */
  recordDownload(duration: number, success: boolean, pluginName: string, userAgent?: string, ipAddress?: string): void {
    this.recordOperation('download', duration, success, { pluginName, userAgent, ipAddress });
  }

  /**
   * Record a validation operation
   */
  recordValidation(validationType: string, duration: number, success: boolean, metadata?: Record<string, any>): void {
    this.recordOperation('validation', duration, success, { validationType, ...metadata });
    
    // Update specific validation timing
    if (validationType in this.metrics.performance.validationTimes) {
      this.metrics.performance.validationTimes[validationType as keyof typeof this.metrics.performance.validationTimes] = 
        this.calculateMovingAverage(this.metrics.performance.validationTimes[validationType as keyof typeof this.metrics.performance.validationTimes], duration);
    }
  }

  /**
   * Record a search operation
   */
  recordSearch(query: string, duration: number, resultCount: number, success: boolean): void {
    this.recordOperation('search', duration, success, { query, resultCount });
  }

  /**
   * Record a database query operation
   */
  recordDatabaseQuery(_queryType: string, duration: number, _success: boolean): void {
    const queryTimes = this.metrics.performance.databaseQueryTimes;
    queryTimes.average = this.calculateMovingAverage(queryTimes.average, duration);
    
    // Track slow queries (over 1 second)
    if (duration > 1000) {
      queryTimes.slowQueries++;
    }
    
    this.addToHistory('dbQuery', duration);
    this.updatePercentiles();
  }

  /**
   * Record a security scan result
   */
  recordSecurityScan(threats: string[], riskLevel: 'low' | 'medium' | 'high' | 'critical', duration: number): void {
    const securityMetrics = this.metrics.security;
    securityMetrics.securityScansPerformed++;
    securityMetrics.threatsDetected += threats.length;
    securityMetrics.riskLevelDistribution[riskLevel]++;
  }

  /**
   * Record a signature validation result
   */
  recordSignatureValidation(success: boolean, hasWarnings: boolean): void {
    const signatureMetrics = this.metrics.security.signatureValidations;
    if (success) {
      signatureMetrics.successful++;
    } else {
      signatureMetrics.failed++;
    }
    
    if (hasWarnings) {
      signatureMetrics.warnings++;
    }
  }

  /**
   * Record a cache operation
   */
  recordCacheOperation(hit: boolean, _retrievalTime: number): void {
    const cacheMetrics = this.metrics.cache;
    
    if (hit) {
      cacheMetrics.totalHits++;
    } else {
      cacheMetrics.totalMisses++;
    }
    
    cacheMetrics.averageRetrievalTime = this.calculateMovingAverage(cacheMetrics.averageRetrievalTime, _retrievalTime);
    this.updateCacheMetrics();
  }

  /**
   * Record bundle optimization results
   */
  recordOptimization(originalSize: number, optimizedSize: number): void {
    const optimizationMetrics = this.metrics.performance.optimizationSavings;
    const sizeReduction = originalSize - optimizedSize;
    const compressionRatio = sizeReduction / originalSize;
    
    optimizationMetrics.totalSizeReduction += sizeReduction;
    optimizationMetrics.optimizationCount++;
    optimizationMetrics.averageCompressionRatio = this.calculateMovingAverage(
      optimizationMetrics.averageCompressionRatio,
      compressionRatio
    );
  }

  // ====================
  // Metrics Calculation
  // ====================

  private recordOperation(operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void {
    const event: OperationEvent = {
      operation,
      duration,
      success,
      metadata,
      timestamp: new Date(),
    };
    
    // Add to history
    this.operationHistory.push(event);
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory.shift();
    }
    
    // Update operation metrics
    const operationMetrics = this.getOperationMetrics(operation);
    operationMetrics.total++;
    
    if (success) {
      operationMetrics.successful++;
    } else {
      operationMetrics.failed++;
    }
    
    operationMetrics.successRate = operationMetrics.successful / operationMetrics.total;
    operationMetrics.averageResponseTime = this.calculateMovingAverage(operationMetrics.averageResponseTime, duration);
    
    // Update response time history for percentile calculations
    this.addToResponseTimeHistory(operation, duration);
    this.updateOperationPercentiles(operation);
  }

  private getOperationMetrics(operation: string): OperationMetrics {
    switch (operation) {
      case 'upload': return this.metrics.uploads;
      case 'download': return this.metrics.downloads;
      case 'validation': return this.metrics.validations;
      case 'search': return this.metrics.searches;
      default: return this.metrics.uploads; // fallback
    }
  }

  private addToResponseTimeHistory(operation: string, duration: number): void {
    if (!this.responseTimeHistory.has(operation)) {
      this.responseTimeHistory.set(operation, []);
    }
    
    const history = this.responseTimeHistory.get(operation);
    if (!history) return;
    history.push(duration);
    
    // Keep only last 1000 measurements for percentile calculation
    if (history.length > 1000) {
      history.shift();
    }
  }

  private updateOperationPercentiles(operation: string): void {
    const history = this.responseTimeHistory.get(operation);
    if (!history || history.length === 0) return;
    
    const sorted = [...history].sort((a, b) => a - b);
    const operationMetrics = this.getOperationMetrics(operation);
    
    operationMetrics.medianResponseTime = this.calculatePercentile(sorted, 50);
    operationMetrics.p95ResponseTime = this.calculatePercentile(sorted, 95);
    operationMetrics.p99ResponseTime = this.calculatePercentile(sorted, 99);
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  private calculateMovingAverage(currentAverage: number, newValue: number, weight = 0.1): number {
    return currentAverage * (1 - weight) + newValue * weight;
  }

  private updateSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const systemMetrics = this.metrics.system;
    
    systemMetrics.memoryUsage = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
    
    systemMetrics.uptime = Date.now() - this.startTime;
    
    // Calculate error rate from recent operations
    const recentOperations = this.operationHistory.filter(
      op => Date.now() - op.timestamp.getTime() < 300000 // last 5 minutes
    );
    
    if (recentOperations.length > 0) {
      const failedOperations = recentOperations.filter(op => !op.success).length;
      systemMetrics.errorRate = failedOperations / recentOperations.length;
    }
    
    // Calculate health score
    systemMetrics.healthScore = this.calculateHealthScore();
  }

  private calculateHealthScore(): number {
    let score = 100;
    const system = this.metrics.system;
    
    // Deduct for high error rate
    if (system.errorRate > this.performanceThresholds.errorRate) {
      score -= 20;
    }
    
    // Deduct for high memory usage
    const memoryUsageRatio = system.memoryUsage.heapUsed / system.memoryUsage.heapTotal;
    if (memoryUsageRatio > this.performanceThresholds.memoryUsage) {
      score -= 15;
    }
    
    // Deduct for slow response times
    const avgResponseTime = (
      this.metrics.uploads.averageResponseTime +
      this.metrics.downloads.averageResponseTime +
      this.metrics.validations.averageResponseTime +
      this.metrics.searches.averageResponseTime
    ) / 4;
    
    if (avgResponseTime > this.performanceThresholds.responseTime) {
      score -= 25;
    }
    
    // Deduct for security issues
    if (this.metrics.security.trustViolations > 0) {
      score -= 10;
    }
    
    // Deduct for poor cache performance
    if (this.metrics.cache.hitRate < 0.7) {
      score -= 10;
    }
    
    return Math.max(0, score);
  }

  private updatePerformanceMetrics(): void {
    // Update database query percentiles
    const dbQueryHistory = this.metricsHistory.get('dbQuery') || [];
    if (dbQueryHistory.length > 0) {
      const recentQueries = dbQueryHistory
        .filter(point => Date.now() - point.timestamp.getTime() < 300000) // last 5 minutes
        .map(point => point.value);
      
      if (recentQueries.length > 0) {
        const sorted = recentQueries.sort((a, b) => a - b);
        this.metrics.performance.databaseQueryTimes.median = this.calculatePercentile(sorted, 50);
        this.metrics.performance.databaseQueryTimes.p95 = this.calculatePercentile(sorted, 95);
        this.metrics.performance.databaseQueryTimes.p99 = this.calculatePercentile(sorted, 99);
      }
    }
  }

  private updateCacheMetrics(): void {
    const cacheMetrics = this.metrics.cache;
    const total = cacheMetrics.totalHits + cacheMetrics.totalMisses;
    
    if (total > 0) {
      cacheMetrics.hitRate = cacheMetrics.totalHits / total;
      cacheMetrics.missRate = cacheMetrics.totalMisses / total;
    }
    
    // Calculate cache efficiency score based on hit rate and retrieval time
    cacheMetrics.cacheEfficiencyScore = cacheMetrics.hitRate * 100 - (cacheMetrics.averageRetrievalTime / 10);
  }

  private updateStorageMetrics(pluginSize: number): void {
    const storageMetrics = this.metrics.storage;
    storageMetrics.totalPlugins++;
    storageMetrics.totalSizeBytes += pluginSize;
    storageMetrics.averagePluginSize = storageMetrics.totalSizeBytes / storageMetrics.totalPlugins;
  }

  private calculateDerivedMetrics(): void {
    // Calculate throughput for each operation type
    const oneMinuteAgo = Date.now() - 60000;
    
    for (const operation of ['upload', 'download', 'validation', 'search']) {
      const recentOps = this.operationHistory.filter(
        op => op.operation === operation && op.timestamp.getTime() > oneMinuteAgo
      );
      
      this.getOperationMetrics(operation).throughputPerMinute = recentOps.length;
    }
  }

  private addToHistory(metric: string, value: number): void {
    if (!this.metricsHistory.has(metric)) {
      this.metricsHistory.set(metric, []);
    }
    
    const history = this.metricsHistory.get(metric);
    if (!history) return;
    history.push({
      timestamp: new Date(),
      value,
    });
    
    // Keep only recent history
    const cutoffTime = Date.now() - (this.metricsRetentionDays * 24 * 60 * 60 * 1000);
    this.metricsHistory.set(metric, history.filter(point => point.timestamp.getTime() > cutoffTime));
  }

  private updatePercentiles(): void {
    // This could be optimized with a more sophisticated percentile calculation
    // For now, we update periodically in updatePerformanceMetrics
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - (this.metricsRetentionDays * 24 * 60 * 60 * 1000);
    
    // Clean operation history
    this.operationHistory = this.operationHistory.filter(
      op => op.timestamp.getTime() > cutoffTime
    );
    
    // Clean metrics history
    for (const [metric, history] of this.metricsHistory.entries()) {
      this.metricsHistory.set(metric, history.filter(point => point.timestamp.getTime() > cutoffTime));
    }
  }

  // ====================
  // Public API
  // ====================

  /**
   * Get current metrics snapshot
   */
  getMetrics(): RegistryMetrics {
    return JSON.parse(JSON.stringify(this.metrics)); // Deep copy
  }

  /**
   * Get metrics for a specific time range
   */
  getMetricsHistory(metric: string, startTime: Date, endTime: Date): MetricDataPoint[] {
    const history = this.metricsHistory.get(metric) || [];
    return history.filter(
      point => point.timestamp >= startTime && point.timestamp <= endTime
    );
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    overallHealthScore: number;
    criticalIssues: string[];
    warnings: string[];
    recommendations: string[];
  } {
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // Check critical issues
    if (this.metrics.system.errorRate > 0.1) {
      criticalIssues.push(`High error rate: ${(this.metrics.system.errorRate * 100).toFixed(1)}%`);
    }
    
    if (this.metrics.system.memoryUsage.heapUsed / this.metrics.system.memoryUsage.heapTotal > 0.9) {
      criticalIssues.push('Memory usage critical (>90%)');
    }
    
    // Check warnings
    if (this.metrics.cache.hitRate < 0.7) {
      warnings.push(`Low cache hit rate: ${(this.metrics.cache.hitRate * 100).toFixed(1)}%`);
    }
    
    if (this.metrics.uploads.averageResponseTime > 3000) {
      warnings.push(`Slow upload response time: ${this.metrics.uploads.averageResponseTime.toFixed(0)}ms`);
    }
    
    // Generate recommendations
    if (this.metrics.cache.hitRate < 0.8) {
      recommendations.push('Consider increasing cache size or TTL');
    }
    
    if (this.metrics.performance.databaseQueryTimes.p95 > 1000) {
      recommendations.push('Review database indexes and query optimization');
    }
    
    if (this.metrics.security.trustViolations > 0) {
      recommendations.push('Review trust policies and security configurations');
    }
    
    return {
      overallHealthScore: this.metrics.system.healthScore,
      criticalIssues,
      warnings,
      recommendations,
    };
  }

  /**
   * Get operational statistics
   */
  getOperationalStats(): {
    totalOperations: number;
    operationsPerHour: number;
    averageResponseTime: number;
    uptime: string;
    topOperations: Array<{ operation: string; count: number; averageTime: number }>;
  } {
    const totalOperations = this.metrics.uploads.total + this.metrics.downloads.total + 
                          this.metrics.validations.total + this.metrics.searches.total;
    
    const uptimeHours = (Date.now() - this.startTime) / (1000 * 60 * 60);
    const operationsPerHour = totalOperations / uptimeHours;
    
    const avgResponseTime = (
      this.metrics.uploads.averageResponseTime + this.metrics.downloads.averageResponseTime +
      this.metrics.validations.averageResponseTime + this.metrics.searches.averageResponseTime
    ) / 4;
    
    const uptime = this.formatUptime(Date.now() - this.startTime);
    
    const topOperations = [
      { operation: 'uploads', count: this.metrics.uploads.total, averageTime: this.metrics.uploads.averageResponseTime },
      { operation: 'downloads', count: this.metrics.downloads.total, averageTime: this.metrics.downloads.averageResponseTime },
      { operation: 'validations', count: this.metrics.validations.total, averageTime: this.metrics.validations.averageResponseTime },
      { operation: 'searches', count: this.metrics.searches.total, averageTime: this.metrics.searches.averageResponseTime },
    ].sort((a, b) => b.count - a.count);
    
    return {
      totalOperations,
      operationsPerHour,
      averageResponseTime: avgResponseTime,
      uptime,
      topOperations,
    };
  }

  private formatUptime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Reset all metrics (use with caution)
   */
  resetMetrics(): void {
    this.logger.warn('Resetting all metrics data');
    this.initializeMetrics();
    this.operationHistory = [];
    this.responseTimeHistory.clear();
    this.metricsHistory.clear();
    this.startTime = Date.now();
  }

  /**
   * Export metrics to JSON for external analysis
   */
  exportMetrics(): {
    metrics: RegistryMetrics;
    operationHistory: OperationEvent[];
    timestamp: Date;
    exportVersion: string;
  } {
    return {
      metrics: this.getMetrics(),
      operationHistory: [...this.operationHistory],
      timestamp: new Date(),
      exportVersion: '1.0.0',
    };
  }
}