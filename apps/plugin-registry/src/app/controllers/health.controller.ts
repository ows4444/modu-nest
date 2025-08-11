import { Controller, Get } from '@nestjs/common';
import { PluginRegistryService } from '../services/plugin-registry.service';
import type { HealthResponse, RootResponse } from '@libs/plugin-types';
import { RegistryStats } from '@libs/plugin-core';

@Controller()
export class HealthController {
  constructor(private readonly pluginRegistryService: PluginRegistryService) {}

  @Get('health')
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats')
  async getStats(): Promise<RegistryStats> {
    return this.pluginRegistryService.getRegistryStats();
  }

  @Get()
  getRoot(): RootResponse {
    return {
      message: 'Plugin Registry API',
      version: '1.0.0',
    };
  }
}
