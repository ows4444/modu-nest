import { Controller, Get } from '@nestjs/common';
import { PluginRegistryService } from '../services/plugin-registry.service';

@Controller()
export class HealthController {
  constructor(private readonly pluginRegistryService: PluginRegistryService) {}

  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  }

  @Get('stats')
  async getStats() {
    return this.pluginRegistryService.getRegistryStats();
  }

  @Get()
  getRoot(): { message: string; version: string } {
    return {
      message: 'Plugin Registry API',
      version: '1.0.0'
    };
  }
}