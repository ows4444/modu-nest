import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import {
  PluginMetricsService,
  type MetricsExportOptions,
  type MetricsServiceConfiguration,
} from '../plugin-metrics.service';

@Controller('plugins/metrics')
export class MetricsController {
  constructor(private readonly metricsService: PluginMetricsService) {}

  @Get()
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

  @Get(':name')
  getPluginMetricsDetailed(@Param('name') pluginName: string) {
    const snapshot = this.metricsService.getPluginMetricsSnapshot(pluginName);
    if (!snapshot) {
      return { error: 'Plugin not found or no metrics available' };
    }
    return snapshot;
  }

  @Get('system/overview')
  getSystemMetrics() {
    return {
      system: this.metricsService.getSystemMetrics(),
      health: this.metricsService.getSystemHealthSummary(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('performance/top')
  getTopPerformers(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return {
      topPerformers: this.metricsService.getTopPerformers(limitNum),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('performance/worst')
  getWorstPerformers(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return {
      worstPerformers: this.metricsService.getWorstPerformers(limitNum),
      timestamp: new Date().toISOString(),
    };
  }

  @Post(':name/reset')
  resetPluginMetrics(@Param('name') pluginName: string) {
    const success = this.metricsService.resetPluginMetrics(pluginName);
    return {
      success,
      message: success ? `Metrics reset for plugin: ${pluginName}` : 'Plugin not found',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('reset-all')
  resetAllMetrics() {
    this.metricsService.clearAllMetrics();
    return {
      success: true,
      message: 'All plugin metrics have been reset',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('export')
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

  @Get('config')
  getMetricsConfiguration() {
    return {
      configuration: this.metricsService.getConfiguration(),
      alertThresholds: this.metricsService.getAlertThresholds(),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('config')
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

  @Post('alerts/:plugin/:metric')
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

  @Get('alerts/:plugin')
  getPluginAlerts(@Param('plugin') pluginName: string) {
    return {
      pluginName,
      thresholds: this.metricsService.getAlertThresholds(pluginName),
      timestamp: new Date().toISOString(),
    };
  }
}
