import { Controller, Get, Param, Query } from '@nestjs/common';
import { PluginMetricsService } from '../plugin-metrics.service';

@Controller('plugins/health')
export class HealthController {
  constructor(private readonly metricsService: PluginMetricsService) {}

  @Get()
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

  @Get(':name')
  getPluginHealthDetailed(@Param('name') pluginName: string) {
    const report = this.metricsService.getPluginHealthReport(pluginName);
    if (!report) {
      return { error: 'Plugin not found or no health data available' };
    }
    return report;
  }
}