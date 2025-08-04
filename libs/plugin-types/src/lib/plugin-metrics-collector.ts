import { Injectable, Logger } from '@nestjs/common';

export interface PluginMetrics {
  pluginName: string;
  loadTime: number;
  memoryUsage: number;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  lastActivity: Date;
  avgResponseTime: number;
  peakMemoryUsage: number;
  startupTime: number;
  uptime: number;
  version: string;
  status: 'loading' | 'loaded' | 'error' | 'unloaded';
}

export interface SystemMetrics {
  totalPlugins: number;
  loadedPlugins: number;
  totalMemoryUsage: number;
  totalRequests: number;
  totalErrors: number;
  systemUptime: number;
  avgLoadTime: number;
  healthyPlugins: number;
  unhealthyPlugins: number;
}

export interface PluginPerformanceEntry {
  timestamp: number;
  responseTime: number;
  isError: boolean;
  endpoint?: string;
  memorySnapshot?: number;
}

export interface PluginMetricsSnapshot {
  metrics: PluginMetrics;
  performanceHistory: PluginPerformanceEntry[];
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: Date;
}

@Injectable()
export class PluginMetricsCollector {
  private readonly logger = new Logger(PluginMetricsCollector.name);

  private metrics = new Map<string, PluginMetrics>();
  private performanceHistory = new Map<string, PluginPerformanceEntry[]>();
  private metricsInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();

  // Configuration
  private readonly COLLECTION_INTERVAL = parseInt(process.env.PLUGIN_METRICS_INTERVAL || '30000', 10); // 30 seconds
  private readonly HISTORY_RETENTION = parseInt(process.env.PLUGIN_METRICS_HISTORY_SIZE || '1000', 10);
  private readonly MEMORY_CHECK_INTERVAL = parseInt(process.env.PLUGIN_MEMORY_CHECK_INTERVAL || '10000', 10); // 10 seconds

  // Health thresholds
  private readonly ERROR_RATE_THRESHOLD = parseFloat(process.env.PLUGIN_ERROR_RATE_THRESHOLD || '0.05'); // 5%
  private readonly RESPONSE_TIME_THRESHOLD = parseInt(process.env.PLUGIN_RESPONSE_TIME_THRESHOLD || '5000', 10); // 5 seconds
  private readonly MEMORY_GROWTH_THRESHOLD = parseFloat(process.env.PLUGIN_MEMORY_GROWTH_THRESHOLD || '0.2'); // 20%

  startCollection(): void {
    if (this.metricsInterval) {
      this.logger.warn('Metrics collection already started');
      return;
    }

    this.logger.log('Starting plugin metrics collection');

    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.performHealthChecks();
      this.cleanupOldPerformanceData();
    }, this.COLLECTION_INTERVAL);

    // Start memory monitoring on a different interval
    setInterval(() => {
      this.collectMemoryMetrics();
    }, this.MEMORY_CHECK_INTERVAL);
  }

  stopCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      this.logger.log('Stopped plugin metrics collection');
    }
  }

  recordPluginLoad(pluginName: string, loadTime: number, version = '1.0.0'): void {
    const existing = this.metrics.get(pluginName) || this.createEmptyMetrics(pluginName);
    existing.loadTime = loadTime;
    existing.startupTime = loadTime;
    existing.version = version;
    existing.status = 'loaded';
    existing.lastActivity = new Date();

    this.metrics.set(pluginName, existing);

    this.logger.debug(`Recorded plugin load: ${pluginName} (${loadTime}ms)`);
  }

  recordPluginLoadStart(pluginName: string): void {
    const existing = this.metrics.get(pluginName) || this.createEmptyMetrics(pluginName);
    existing.status = 'loading';
    existing.lastActivity = new Date();

    this.metrics.set(pluginName, existing);
  }

  recordPluginLoadError(pluginName: string, error: Error): void {
    const existing = this.metrics.get(pluginName) || this.createEmptyMetrics(pluginName);
    existing.status = 'error';
    existing.errorCount++;
    existing.lastActivity = new Date();

    this.metrics.set(pluginName, existing);

    this.logger.debug(`Recorded plugin load error: ${pluginName} - ${error.message}`);
  }

  recordPluginUnload(pluginName: string): void {
    const existing = this.metrics.get(pluginName);
    if (existing) {
      existing.status = 'unloaded';
      existing.lastActivity = new Date();
      this.metrics.set(pluginName, existing);
    }

    this.logger.debug(`Recorded plugin unload: ${pluginName}`);
  }

  recordRequest(pluginName: string, responseTime: number, isError = false, endpoint?: string): void {
    const metrics = this.metrics.get(pluginName);
    if (!metrics) {
      this.logger.warn(`Attempted to record request for unknown plugin: ${pluginName}`);
      return;
    }

    metrics.requestCount++;
    metrics.lastActivity = new Date();

    // Update average response time using running average
    const totalResponseTime = metrics.avgResponseTime * (metrics.requestCount - 1) + responseTime;
    metrics.avgResponseTime = totalResponseTime / metrics.requestCount;

    if (isError) {
      metrics.errorCount++;
    }

    // Calculate error rate
    metrics.errorRate = metrics.requestCount > 0 ? metrics.errorCount / metrics.requestCount : 0;

    this.metrics.set(pluginName, metrics);

    // Record performance entry
    this.recordPerformanceEntry(pluginName, {
      timestamp: Date.now(),
      responseTime,
      isError,
      endpoint,
      memorySnapshot: metrics.memoryUsage,
    });

    this.logger.debug(`Recorded request: ${pluginName} (${responseTime}ms, error: ${isError})`);
  }

  getPluginMetrics(pluginName: string): PluginMetrics | undefined {
    const metrics = this.metrics.get(pluginName);
    if (metrics) {
      // Update uptime
      metrics.uptime = Date.now() - this.startTime;
    }
    return metrics;
  }

  getPluginMetricsSnapshot(pluginName: string): PluginMetricsSnapshot | undefined {
    const metrics = this.getPluginMetrics(pluginName);
    if (!metrics) return undefined;

    const performanceHistory = this.performanceHistory.get(pluginName) || [];
    const healthStatus = this.calculateHealthStatus(metrics, performanceHistory);

    return {
      metrics,
      performanceHistory: performanceHistory.slice(-100), // Last 100 entries
      healthStatus,
      lastHealthCheck: new Date(),
    };
  }

  getAllMetrics(): PluginMetrics[] {
    const currentTime = Date.now();
    return Array.from(this.metrics.values()).map((metrics) => ({
      ...metrics,
      uptime: currentTime - this.startTime,
    }));
  }

  getSystemMetrics(): SystemMetrics {
    const allMetrics = this.getAllMetrics();
    const loadedPlugins = allMetrics.filter((m) => m.status === 'loaded');

    const totalMemoryUsage = allMetrics.reduce((sum, m) => sum + m.memoryUsage, 0);
    const totalRequests = allMetrics.reduce((sum, m) => sum + m.requestCount, 0);
    const totalErrors = allMetrics.reduce((sum, m) => sum + m.errorCount, 0);
    const avgLoadTime =
      loadedPlugins.length > 0 ? loadedPlugins.reduce((sum, m) => sum + m.loadTime, 0) / loadedPlugins.length : 0;

    const healthyPlugins = allMetrics.filter(
      (m) => m.status === 'loaded' && m.errorRate <= this.ERROR_RATE_THRESHOLD
    ).length;

    const unhealthyPlugins = allMetrics.filter(
      (m) => m.status === 'error' || m.errorRate > this.ERROR_RATE_THRESHOLD
    ).length;

    return {
      totalPlugins: allMetrics.length,
      loadedPlugins: loadedPlugins.length,
      totalMemoryUsage,
      totalRequests,
      totalErrors,
      systemUptime: Date.now() - this.startTime,
      avgLoadTime: Math.round(avgLoadTime),
      healthyPlugins,
      unhealthyPlugins,
    };
  }

  getTopPerformers(limit = 5): PluginMetrics[] {
    return this.getAllMetrics()
      .filter((m) => m.status === 'loaded')
      .sort((a, b) => {
        // Score based on low error rate, fast response time, and high request count
        const scoreA = (1 - a.errorRate) * (1000 / Math.max(a.avgResponseTime, 1)) * Math.log(a.requestCount + 1);
        const scoreB = (1 - b.errorRate) * (1000 / Math.max(b.avgResponseTime, 1)) * Math.log(b.requestCount + 1);
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  getWorstPerformers(limit = 5): PluginMetrics[] {
    return this.getAllMetrics()
      .filter((m) => m.status === 'loaded')
      .sort((a, b) => {
        // Score based on high error rate and slow response time
        const scoreA = a.errorRate * a.avgResponseTime;
        const scoreB = b.errorRate * b.avgResponseTime;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  resetPluginMetrics(pluginName: string): boolean {
    const existing = this.metrics.get(pluginName);
    if (!existing) return false;

    const resetMetrics = this.createEmptyMetrics(pluginName);
    resetMetrics.version = existing.version;
    resetMetrics.status = existing.status;

    this.metrics.set(pluginName, resetMetrics);
    this.performanceHistory.delete(pluginName);

    this.logger.log(`Reset metrics for plugin: ${pluginName}`);
    return true;
  }

  clearAllMetrics(): void {
    this.metrics.clear();
    this.performanceHistory.clear();
    this.startTime = Date.now();

    this.logger.log('Cleared all plugin metrics');
  }

  private createEmptyMetrics(pluginName: string): PluginMetrics {
    return {
      pluginName,
      loadTime: 0,
      memoryUsage: 0,
      requestCount: 0,
      errorCount: 0,
      errorRate: 0,
      lastActivity: new Date(),
      avgResponseTime: 0,
      peakMemoryUsage: 0,
      startupTime: 0,
      uptime: 0,
      version: '1.0.0',
      status: 'loading',
    };
  }

  private recordPerformanceEntry(pluginName: string, entry: PluginPerformanceEntry): void {
    let history = this.performanceHistory.get(pluginName);
    if (!history) {
      history = [];
      this.performanceHistory.set(pluginName, history);
    }

    history.push(entry);

    // Keep only recent entries
    if (history.length > this.HISTORY_RETENTION) {
      history.splice(0, history.length - this.HISTORY_RETENTION);
    }
  }

  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const totalPlugins = this.metrics.size;

    if (totalPlugins === 0) return;

    // Estimate memory usage per plugin (simplified approach)
    const baseMemoryPerPlugin = Math.floor(memUsage.heapUsed / Math.max(totalPlugins, 1));

    for (const [_pluginName, metrics] of this.metrics) {
      if (metrics.status !== 'loaded') continue;

      // Update memory usage estimate
      const currentMemory = baseMemoryPerPlugin + Math.random() * baseMemoryPerPlugin * 0.2; // Add some variance
      metrics.memoryUsage = Math.floor(currentMemory);

      // Track peak memory usage
      if (metrics.memoryUsage > metrics.peakMemoryUsage) {
        metrics.peakMemoryUsage = metrics.memoryUsage;
      }

      // Update uptime
      metrics.uptime = Date.now() - this.startTime;
    }

    this.logger.debug(`Updated system metrics for ${totalPlugins} plugins`);
  }

  private collectMemoryMetrics(): void {
    for (const [pluginName, metrics] of this.metrics) {
      if (metrics.status !== 'loaded') continue;

      // Record memory snapshot in performance history
      this.recordPerformanceEntry(pluginName, {
        timestamp: Date.now(),
        responseTime: 0,
        isError: false,
        memorySnapshot: metrics.memoryUsage,
      });
    }
  }

  private performHealthChecks(): void {
    for (const [pluginName, metrics] of this.metrics) {
      if (metrics.status !== 'loaded') continue;

      const performanceHistory = this.performanceHistory.get(pluginName) || [];
      const healthStatus = this.calculateHealthStatus(metrics, performanceHistory);

      if (healthStatus === 'unhealthy') {
        this.logger.warn(
          `Plugin health check failed: ${pluginName} (error rate: ${(metrics.errorRate * 100).toFixed(
            2
          )}%, avg response: ${metrics.avgResponseTime.toFixed(2)}ms)`
        );
      } else if (healthStatus === 'degraded') {
        this.logger.debug(`Plugin performance degraded: ${pluginName}`);
      }
    }
  }

  private calculateHealthStatus(
    metrics: PluginMetrics,
    performanceHistory: PluginPerformanceEntry[]
  ): 'healthy' | 'degraded' | 'unhealthy' {
    // Check error rate
    if (metrics.errorRate > this.ERROR_RATE_THRESHOLD) {
      return 'unhealthy';
    }

    // Check average response time
    if (metrics.avgResponseTime > this.RESPONSE_TIME_THRESHOLD) {
      return 'unhealthy';
    }

    // Check memory growth trend
    if (performanceHistory.length > 10) {
      const recent = performanceHistory.slice(-10);
      const older = performanceHistory.slice(-20, -10);

      if (recent.length > 0 && older.length > 0) {
        const recentAvgMemory = recent.reduce((sum, entry) => sum + (entry.memorySnapshot || 0), 0) / recent.length;
        const olderAvgMemory = older.reduce((sum, entry) => sum + (entry.memorySnapshot || 0), 0) / older.length;

        if (olderAvgMemory > 0 && (recentAvgMemory - olderAvgMemory) / olderAvgMemory > this.MEMORY_GROWTH_THRESHOLD) {
          return 'degraded';
        }
      }
    }

    // Check for recent errors in performance history
    const recentErrors = performanceHistory
      .slice(-50) // Last 50 entries
      .filter((entry) => entry.isError).length;

    if (recentErrors > 5) {
      // More than 5 errors in recent activity
      return 'degraded';
    }

    return 'healthy';
  }

  private cleanupOldPerformanceData(): void {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    for (const [pluginName, history] of this.performanceHistory) {
      const filteredHistory = history.filter((entry) => entry.timestamp > cutoffTime);

      if (filteredHistory.length !== history.length) {
        this.performanceHistory.set(pluginName, filteredHistory);
        this.logger.debug(
          `Cleaned up ${history.length - filteredHistory.length} old performance entries for ${pluginName}`
        );
      }
    }
  }
}
