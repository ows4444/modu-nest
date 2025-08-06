import { Controller, Get, Post, Param, Query, Body, Delete } from '@nestjs/common';
import { PluginLoaderService } from './plugin-loader.service';
import { RegistryClientService, RegistryPluginMetadata } from './registry-client.service';
import { PluginUpdateInfo } from '@modu-nest/plugin-types';
import {
  PluginMetricsService,
  type MetricsExportOptions,
  type MetricsServiceConfiguration,
} from './plugin-metrics.service';

@Controller()
export class AppController {
  constructor(
    private readonly pluginLoader: PluginLoaderService,
    private readonly registryClient: RegistryClientService,
    private readonly metricsService: PluginMetricsService
  ) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'plugin-host',
      version: '1.0.0',
    };
  }

  // Plugin management endpoints
  @Get('plugins/installed')
  getInstalledPlugins() {
    const loadedPlugins = this.pluginLoader.getLoadedPlugins();
    return Array.from(loadedPlugins.entries()).map(([pluginName, plugin]) => ({
      ...plugin.manifest,
      name: pluginName,
      status: 'active',
      loadedAt: new Date().toISOString(),
    }));
  }

  @Get('plugins/updates')
  async checkForUpdates(): Promise<PluginUpdateInfo[]> {
    const loadedPlugins = this.pluginLoader.getLoadedPlugins();
    return this.registryClient.checkPluginUpdates(loadedPlugins);
  }

  @Get('plugins/stats')
  async getPluginStats() {
    return await this.pluginLoader.getPluginStats();
  }

  @Get('plugins/cross-plugin-services')
  getCrossPluginServices() {
    return {
      availableServices: this.pluginLoader.getAvailableCrossPluginServices(),
      globalServices: this.pluginLoader.getGlobalCrossPluginServices(),
      statistics: this.pluginLoader.getCrossPluginServiceManager().getStatistics(),
    };
  }

  @Get('plugins/memory/:name')
  getPluginMemoryStats(@Param('name') name: string) {
    return this.pluginLoader.getPluginMemoryStats(name);
  }

  @Post('plugins/memory/cleanup')
  async forceMemoryCleanup() {
    return await this.pluginLoader.forceMemoryCleanup();
  }

  // Plugin Metrics endpoints
  @Get('plugins/metrics')
  getPluginMetrics(@Query('plugin') pluginName?: string) {
    if (pluginName) {
      const metrics = this.metricsService.getPluginMetrics(pluginName);
      return metrics ? { [pluginName]: metrics } : { error: 'Plugin not found' };
    }

    const allMetrics = this.metricsService.getAllMetrics();
    return {
      metrics: allMetrics,
      totalPlugins: allMetrics.length,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('plugins/metrics/:name')
  getPluginMetricsDetailed(@Param('name') pluginName: string) {
    const snapshot = this.metricsService.getPluginMetricsSnapshot(pluginName);
    if (!snapshot) {
      return { error: 'Plugin not found or no metrics available' };
    }
    return snapshot;
  }

  @Get('plugins/metrics/system/overview')
  getSystemMetrics() {
    return {
      system: this.metricsService.getSystemMetrics(),
      health: this.metricsService.getSystemHealthSummary(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('plugins/metrics/performance/top')
  getTopPerformers(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return {
      topPerformers: this.metricsService.getTopPerformers(limitNum),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('plugins/metrics/performance/worst')
  getWorstPerformers(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return {
      worstPerformers: this.metricsService.getWorstPerformers(limitNum),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('plugins/health')
  getPluginHealth(@Query('plugin') pluginName?: string) {
    if (pluginName) {
      const report = this.metricsService.getPluginHealthReport(pluginName);
      return report ? { [pluginName]: report } : { error: 'Plugin not found' };
    }

    return {
      healthReports: this.metricsService.getAllHealthReports(),
      systemHealth: this.metricsService.getSystemHealthSummary(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('plugins/health/:name')
  getPluginHealthDetailed(@Param('name') pluginName: string) {
    const report = this.metricsService.getPluginHealthReport(pluginName);
    if (!report) {
      return { error: 'Plugin not found or no health data available' };
    }
    return report;
  }

  @Post('plugins/metrics/:name/reset')
  resetPluginMetrics(@Param('name') pluginName: string) {
    const success = this.metricsService.resetPluginMetrics(pluginName);
    return {
      success,
      message: success ? `Metrics reset for plugin: ${pluginName}` : 'Plugin not found',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('plugins/metrics/reset-all')
  resetAllMetrics() {
    this.metricsService.clearAllMetrics();
    return {
      success: true,
      message: 'All plugin metrics have been reset',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('plugins/metrics/export')
  exportMetrics(@Body() options: MetricsExportOptions) {
    try {
      const exportData = this.metricsService.exportMetrics(options);
      return {
        success: true,
        format: options.format,
        data: exportData,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('plugins/metrics/config')
  getMetricsConfiguration() {
    return {
      configuration: this.metricsService.getConfiguration(),
      alertThresholds: this.metricsService.getAlertThresholds(),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('plugins/metrics/config')
  updateMetricsConfiguration(@Body() config: Partial<MetricsServiceConfiguration>) {
    try {
      this.metricsService.updateConfiguration(config);
      return {
        success: true,
        message: 'Metrics configuration updated',
        configuration: this.metricsService.getConfiguration(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('plugins/metrics/alerts/:plugin/:metric')
  setPluginAlert(
    @Param('plugin') pluginName: string,
    @Param('metric') metric: string,
    @Body() body: { threshold: number }
  ) {
    try {
      this.metricsService.setAlertThreshold(pluginName, metric, body.threshold);
      return {
        success: true,
        message: `Alert threshold set for ${pluginName}.${metric}: ${body.threshold}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('plugins/metrics/alerts/:plugin')
  getPluginAlerts(@Param('plugin') pluginName: string) {
    return {
      pluginName,
      thresholds: this.metricsService.getAlertThresholds(pluginName),
      timestamp: new Date().toISOString(),
    };
  }

  // Registry endpoints
  @Get('registry/plugins')
  async getAvailablePlugins(): Promise<RegistryPluginMetadata[]> {
    return this.registryClient.listAvailablePlugins();
  }

  @Get('registry/plugins/:name')
  async getPluginInfo(@Param('name') name: string): Promise<RegistryPluginMetadata> {
    return this.registryClient.getPluginInfo(name);
  }

  @Post('registry/plugins/:name/install')
  async installPlugin(@Param('name') name: string): Promise<{ message: string }> {
    await this.registryClient.downloadAndInstallPlugin(name);
    return { message: `Plugin ${name} installed successfully. Restart the application to load the plugin.` };
  }

  @Post('registry/plugins/:name/update')
  async updatePlugin(@Param('name') name: string): Promise<{ message: string }> {
    await this.registryClient.downloadAndInstallPlugin(name);
    return { message: `Plugin ${name} updated successfully. Restart the application to load the updated plugin.` };
  }

  @Get('registry/status')
  async getRegistryStatus() {
    const isAvailable = await this.registryClient.isRegistryAvailable();
    const registryUrl = this.registryClient.getRegistryUrl();

    return {
      available: isAvailable,
      url: registryUrl,
      lastChecked: new Date().toISOString(),
      pluginsDirectory: this.registryClient.getPluginsDirectory(),
    };
  }

  // Plugin Cache Management endpoints
  @Get('plugins/cache/stats')
  getCacheStatistics() {
    return this.pluginLoader.getCacheStatistics();
  }

  @Delete('plugins/cache')
  clearPluginCache() {
    const clearedCount = this.pluginLoader.clearPluginCache();
    return {
      success: true,
      message: `Cleared ${clearedCount} cache entries`,
      clearedCount,
    };
  }

  @Delete('plugins/cache/:pluginName')
  invalidatePluginCache(@Param('pluginName') pluginName: string) {
    const invalidatedCount = this.pluginLoader.invalidatePluginCache(pluginName);
    return {
      success: true,
      message: `Invalidated ${invalidatedCount} cache entries for plugin ${pluginName}`,
      invalidatedCount,
      pluginName,
    };
  }

  @Delete('plugins/cache/type/:cacheType')
  invalidateCacheByType(@Param('cacheType') cacheType: string) {
    const invalidatedCount = this.pluginLoader.invalidateCacheByType(cacheType);
    return {
      success: true,
      message: `Invalidated ${invalidatedCount} cache entries of type ${cacheType}`,
      invalidatedCount,
      cacheType,
    };
  }

  @Get('plugins/cache/keys')
  getCacheKeys(@Query('pattern') pattern?: string) {
    const regexPattern = pattern ? new RegExp(pattern) : undefined;
    const keys = this.pluginLoader.getCacheKeys(regexPattern);
    return {
      keys,
      count: keys.length,
      pattern: pattern || 'all',
    };
  }

  @Get('plugins/cache/entry/:key')
  getCacheEntryDetails(@Param('key') key: string) {
    const details = this.pluginLoader.getCacheEntryDetails(key);
    if (!details) {
      return {
        exists: false,
        message: `Cache entry not found for key: ${key}`,
      };
    }
    return {
      exists: true,
      key,
      details,
    };
  }
}
