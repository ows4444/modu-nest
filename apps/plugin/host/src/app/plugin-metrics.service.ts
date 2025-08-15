import {
  PluginMetrics,
  PluginMetricsCollector,
  PluginMetricsSnapshot,
  PluginPerformanceEntry,
  SystemMetrics,
} from '@plugin/services';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

export interface MetricsServiceConfiguration {
  enabled: boolean;
  collectionInterval: number;
  historyRetention: number;
  memoryCheckInterval: number;
  errorRateThreshold: number;
  responseTimeThreshold: number;
  memoryGrowthThreshold: number;
}

export interface PluginHealthReport {
  pluginName: string;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
  recommendations: string[];
  lastCheckTime: Date;
}

export interface MetricsExportOptions {
  format: 'json' | 'csv' | 'prometheus';
  timeRange?: {
    start: Date;
    end: Date;
  };
  plugins?: string[];
  includePerformanceHistory?: boolean;
}

export interface AlertThreshold {
  errorRate?: number;
  responseTime?: number;
  memoryGrowth?: number;
  [key: string]: number | undefined;
}

export interface MetricsExportData {
  timestamp: string;
  systemMetrics: SystemMetrics;
  pluginMetrics: PluginMetrics[];
  performanceHistory?: Record<string, PluginPerformanceEntry[]>;
}

@Injectable()
export class PluginMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginMetricsService.name);
  private readonly metricsCollector = new PluginMetricsCollector();

  private configuration: MetricsServiceConfiguration;
  private healthReportCache = new Map<string, PluginHealthReport>();
  private alertThresholds = new Map<string, AlertThreshold>();

  constructor() {
    this.configuration = this.loadConfiguration();
    this.setupAlertThresholds();
  }

  async onModuleInit(): Promise<void> {
    if (this.configuration.enabled) {
      this.logger.log('Starting Plugin Metrics Service');
      this.metricsCollector.startCollection();

      // Start periodic health reporting
      this.startHealthReporting();
    } else {
      this.logger.log('Plugin Metrics Service is disabled');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Stopping Plugin Metrics Service');
    this.metricsCollector.stopCollection();
  }

  // Core metrics collection methods
  recordPluginLoad(pluginName: string, loadTime: number, version?: string): void {
    this.metricsCollector.recordPluginLoad(pluginName, loadTime, version);
    this.logger.debug(`Recorded plugin load: ${pluginName} (${loadTime}ms)`);
  }

  recordPluginLoadStart(pluginName: string): void {
    this.metricsCollector.recordPluginLoadStart(pluginName);
  }

  recordPluginLoadError(pluginName: string, error: Error): void {
    this.metricsCollector.recordPluginLoadError(pluginName, error);
    this.logger.warn(`Plugin load error recorded: ${pluginName} - ${error.message}`);
  }

  recordPluginUnload(pluginName: string): void {
    this.metricsCollector.recordPluginUnload(pluginName);
    this.logger.debug(`Recorded plugin unload: ${pluginName}`);
  }

  recordRequest(pluginName: string, responseTime: number, isError = false, endpoint?: string): void {
    this.metricsCollector.recordRequest(pluginName, responseTime, isError, endpoint);

    // Check for performance alerts
    this.checkPerformanceAlerts(pluginName, responseTime, isError);
  }

  recordLoadingTime(totalTime: number): void {
    this.logger.debug(`Recorded total loading time: ${totalTime}ms`);
  }

  recordSuccessfulLoads(count: number): void {
    this.logger.debug(`Recorded successful loads: ${count}`);
  }

  recordFailedLoads(count: number): void {
    this.logger.debug(`Recorded failed loads: ${count}`);
  }

  recordDiscoveryMetrics(discoveryTime: number, successful: number, failed: number): void {
    this.logger.debug(`Recorded discovery metrics: ${discoveryTime}ms, ${successful} successful, ${failed} failed`);
  }

  // Metrics retrieval methods
  getPluginMetrics(pluginName: string): PluginMetrics | undefined {
    return this.metricsCollector.getPluginMetrics(pluginName);
  }

  getPluginMetricsSnapshot(pluginName: string): PluginMetricsSnapshot | undefined {
    return this.metricsCollector.getPluginMetricsSnapshot(pluginName);
  }

  getAllMetrics(): PluginMetrics[] {
    return this.metricsCollector.getAllMetrics();
  }

  getSystemMetrics(): SystemMetrics {
    return this.metricsCollector.getSystemMetrics();
  }

  getTopPerformers(limit = 5): PluginMetrics[] {
    return this.metricsCollector.getTopPerformers(limit);
  }

  getWorstPerformers(limit = 5): PluginMetrics[] {
    return this.metricsCollector.getWorstPerformers(limit);
  }

  // Health monitoring methods
  getPluginHealthReport(pluginName: string): PluginHealthReport | undefined {
    const cached = this.healthReportCache.get(pluginName);
    if (cached && Date.now() - cached.lastCheckTime.getTime() < 60000) {
      // 1 minute cache
      return cached;
    }

    const snapshot = this.getPluginMetricsSnapshot(pluginName);
    if (!snapshot) return undefined;

    const report = this.generateHealthReport(snapshot);
    this.healthReportCache.set(pluginName, report);
    return report;
  }

  getAllHealthReports(): PluginHealthReport[] {
    const allMetrics = this.getAllMetrics();
    return allMetrics.map((metrics) => {
      const cached = this.healthReportCache.get(metrics.pluginName);
      if (cached && Date.now() - cached.lastCheckTime.getTime() < 60000) {
        return cached;
      }

      const snapshot = this.getPluginMetricsSnapshot(metrics.pluginName);
      if (!snapshot) return this.createEmptyHealthReport(metrics.pluginName);

      const report = this.generateHealthReport(snapshot);
      this.healthReportCache.set(metrics.pluginName, report);
      return report;
    });
  }

  getSystemHealthSummary(): {
    totalPlugins: number;
    healthyPlugins: number;
    degradedPlugins: number;
    unhealthyPlugins: number;
    criticalIssues: string[];
    systemStatus: 'healthy' | 'degraded' | 'critical';
  } {
    const reports = this.getAllHealthReports();
    const healthyCount = reports.filter((r) => r.healthStatus === 'healthy').length;
    const degradedCount = reports.filter((r) => r.healthStatus === 'degraded').length;
    const unhealthyCount = reports.filter((r) => r.healthStatus === 'unhealthy').length;

    const criticalIssues: string[] = [];
    reports.forEach((report) => {
      if (report.healthStatus === 'unhealthy') {
        criticalIssues.push(`${report.pluginName}: ${report.issues.join(', ')}`);
      }
    });

    let systemStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (unhealthyCount > 0 || criticalIssues.length > 0) {
      systemStatus = 'critical';
    } else if (degradedCount > reports.length * 0.2) {
      // More than 20% degraded
      systemStatus = 'degraded';
    }

    return {
      totalPlugins: reports.length,
      healthyPlugins: healthyCount,
      degradedPlugins: degradedCount,
      unhealthyPlugins: unhealthyCount,
      criticalIssues,
      systemStatus,
    };
  }

  // Management methods
  resetPluginMetrics(pluginName: string): boolean {
    const success = this.metricsCollector.resetPluginMetrics(pluginName);
    if (success) {
      this.healthReportCache.delete(pluginName);
      this.logger.log(`Reset metrics for plugin: ${pluginName}`);
    }
    return success;
  }

  clearAllMetrics(): void {
    this.metricsCollector.clearAllMetrics();
    this.healthReportCache.clear();
    this.logger.log('Cleared all plugin metrics');
  }

  // Export methods
  exportMetrics(options: MetricsExportOptions): string {
    const allMetrics = this.getAllMetrics();
    let filteredMetrics = allMetrics;

    // Apply plugin filter
    if (options.plugins && options.plugins.length > 0) {
      filteredMetrics = allMetrics.filter((m) => options.plugins!.includes(m.pluginName));
    }

    // Apply time range filter (simplified - would need timestamp tracking for full implementation)
    if (options.timeRange) {
      filteredMetrics = filteredMetrics.filter(
        (m) => m.lastActivity >= options.timeRange!.start && m.lastActivity <= options.timeRange!.end
      );
    }

    switch (options.format) {
      case 'json':
        return this.exportAsJson(filteredMetrics, options);
      case 'csv':
        return this.exportAsCsv(filteredMetrics);
      case 'prometheus':
        return this.exportAsPrometheus(filteredMetrics);
      default:
        return this.exportAsJson(filteredMetrics, options);
    }
  }

  // Configuration methods
  updateConfiguration(config: Partial<MetricsServiceConfiguration>): void {
    this.configuration = { ...this.configuration, ...config };
    this.logger.log('Updated metrics service configuration');
  }

  getConfiguration(): MetricsServiceConfiguration {
    return { ...this.configuration };
  }

  // Alert methods
  setAlertThreshold(pluginName: string, metric: string, threshold: number): void {
    if (!this.alertThresholds.has(pluginName)) {
      this.alertThresholds.set(pluginName, {});
    }
    const pluginThresholds = this.alertThresholds.get(pluginName)!;
    pluginThresholds[metric] = threshold;

    this.logger.log(`Set alert threshold for ${pluginName}.${metric}: ${threshold}`);
  }

  getAlertThresholds(pluginName?: string): Map<string, AlertThreshold> | AlertThreshold {
    if (pluginName) {
      return this.alertThresholds.get(pluginName) || {};
    }
    return new Map(this.alertThresholds);
  }

  // Private methods
  private loadConfiguration(): MetricsServiceConfiguration {
    return {
      enabled: process.env.PLUGIN_METRICS_ENABLED !== 'false',
      collectionInterval: parseInt(process.env.PLUGIN_METRICS_INTERVAL || '30000', 10),
      historyRetention: parseInt(process.env.PLUGIN_METRICS_HISTORY_SIZE || '1000', 10),
      memoryCheckInterval: parseInt(process.env.PLUGIN_MEMORY_CHECK_INTERVAL || '10000', 10),
      errorRateThreshold: parseFloat(process.env.PLUGIN_ERROR_RATE_THRESHOLD || '0.05'),
      responseTimeThreshold: parseInt(process.env.PLUGIN_RESPONSE_TIME_THRESHOLD || '5000', 10),
      memoryGrowthThreshold: parseFloat(process.env.PLUGIN_MEMORY_GROWTH_THRESHOLD || '0.2'),
    };
  }

  private setupAlertThresholds(): void {
    // Default system-wide thresholds
    this.alertThresholds.set('*', {
      errorRate: this.configuration.errorRateThreshold,
      responseTime: this.configuration.responseTimeThreshold,
      memoryGrowth: this.configuration.memoryGrowthThreshold,
    });
  }

  private startHealthReporting(): void {
    // Generate health reports periodically
    setInterval(() => {
      const summary = this.getSystemHealthSummary();
      if (summary.systemStatus === 'critical') {
        this.logger.error(`System health critical: ${summary.unhealthyPlugins} unhealthy plugins`);
        summary.criticalIssues.forEach((issue) => this.logger.error(`Critical: ${issue}`));
      } else if (summary.systemStatus === 'degraded') {
        this.logger.warn(`System health degraded: ${summary.degradedPlugins} degraded plugins`);
      }
    }, 300000); // Every 5 minutes
  }

  private generateHealthReport(snapshot: PluginMetricsSnapshot): PluginHealthReport {
    const { metrics, performanceHistory, healthStatus } = snapshot;
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Analyze metrics for issues
    if (metrics.errorRate > this.configuration.errorRateThreshold) {
      issues.push(`High error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
      recommendations.push('Review error logs and implement error handling improvements');
    }

    if (metrics.avgResponseTime > this.configuration.responseTimeThreshold) {
      issues.push(`Slow response time: ${metrics.avgResponseTime.toFixed(2)}ms`);
      recommendations.push('Optimize plugin performance or increase timeout thresholds');
    }

    if (metrics.memoryUsage > metrics.peakMemoryUsage * 0.9) {
      issues.push('Memory usage near peak levels');
      recommendations.push('Monitor for memory leaks and optimize memory usage');
    }

    if (performanceHistory.length > 0) {
      const recentErrors = performanceHistory.slice(-10).filter((entry) => entry.isError).length;
      if (recentErrors > 3) {
        issues.push(`Recent error spike: ${recentErrors} errors in last 10 requests`);
        recommendations.push('Investigate recent changes or external dependencies');
      }
    }

    if (metrics.status === 'error') {
      issues.push('Plugin in error state');
      recommendations.push('Check plugin logs and restart if necessary');
    }

    return {
      pluginName: metrics.pluginName,
      healthStatus,
      issues,
      recommendations,
      lastCheckTime: new Date(),
    };
  }

  private createEmptyHealthReport(pluginName: string): PluginHealthReport {
    return {
      pluginName,
      healthStatus: 'unhealthy',
      issues: ['No metrics available'],
      recommendations: ['Ensure plugin is properly loaded and instrumented'],
      lastCheckTime: new Date(),
    };
  }

  private checkPerformanceAlerts(pluginName: string, responseTime: number, isError: boolean): void {
    const thresholds = this.getAlertThresholds(pluginName) as AlertThreshold;

    if (responseTime > (thresholds.responseTime || this.configuration.responseTimeThreshold)) {
      this.logger.warn(`Performance alert: ${pluginName} response time ${responseTime}ms exceeds threshold`);
    }

    if (isError) {
      const metrics = this.getPluginMetrics(pluginName);
      if (metrics && metrics.errorRate > (thresholds.errorRate || this.configuration.errorRateThreshold)) {
        this.logger.warn(
          `Error rate alert: ${pluginName} error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds threshold`
        );
      }
    }
  }

  private exportAsJson(metrics: PluginMetrics[], options: MetricsExportOptions): string {
    const exportData: MetricsExportData = {
      timestamp: new Date().toISOString(),
      systemMetrics: this.getSystemMetrics(),
      pluginMetrics: metrics,
    };

    if (options.includePerformanceHistory) {
      exportData.performanceHistory = {};
      metrics.forEach((metric) => {
        const snapshot = this.getPluginMetricsSnapshot(metric.pluginName);
        if (snapshot && exportData.performanceHistory) {
          exportData.performanceHistory[metric.pluginName] = snapshot.performanceHistory;
        }
      });
    }

    return JSON.stringify(exportData, null, 2);
  }

  private exportAsCsv(metrics: PluginMetrics[]): string {
    const headers = [
      'pluginName',
      'version',
      'status',
      'loadTime',
      'memoryUsage',
      'peakMemoryUsage',
      'requestCount',
      'errorCount',
      'errorRate',
      'avgResponseTime',
      'uptime',
      'lastActivity',
    ];

    const csvLines = [headers.join(',')];

    metrics.forEach((metric) => {
      const row = [
        metric.pluginName,
        metric.version,
        metric.status,
        metric.loadTime,
        metric.memoryUsage,
        metric.peakMemoryUsage,
        metric.requestCount,
        metric.errorCount,
        metric.errorRate.toFixed(4),
        metric.avgResponseTime.toFixed(2),
        metric.uptime,
        metric.lastActivity.toISOString(),
      ];
      csvLines.push(row.join(','));
    });

    return csvLines.join('\n');
  }

  private exportAsPrometheus(metrics: PluginMetrics[]): string {
    const lines: string[] = [];

    // System metrics
    const systemMetrics = this.getSystemMetrics();
    lines.push(`# HELP plugin_system_total_plugins Total number of plugins`);
    lines.push(`# TYPE plugin_system_total_plugins gauge`);
    lines.push(`plugin_system_total_plugins ${systemMetrics.totalPlugins}`);

    lines.push(`# HELP plugin_system_loaded_plugins Number of loaded plugins`);
    lines.push(`# TYPE plugin_system_loaded_plugins gauge`);
    lines.push(`plugin_system_loaded_plugins ${systemMetrics.loadedPlugins}`);

    // Plugin-specific metrics
    metrics.forEach((metric) => {
      const labels = `{plugin="${metric.pluginName}",version="${metric.version}",status="${metric.status}"}`;

      lines.push(`plugin_load_time_milliseconds${labels} ${metric.loadTime}`);
      lines.push(`plugin_memory_usage_bytes${labels} ${metric.memoryUsage}`);
      lines.push(`plugin_requests_total${labels} ${metric.requestCount}`);
      lines.push(`plugin_errors_total${labels} ${metric.errorCount}`);
      lines.push(`plugin_error_rate${labels} ${metric.errorRate}`);
      lines.push(`plugin_response_time_milliseconds${labels} ${metric.avgResponseTime}`);
      lines.push(`plugin_uptime_seconds${labels} ${Math.floor(metric.uptime / 1000)}`);
    });

    return lines.join('\n');
  }
}
