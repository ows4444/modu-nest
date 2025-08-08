import { Controller, Get, Post, Param } from '@nestjs/common';
import { PluginLoaderService } from '../plugin-loader.service';
import { RegistryClientService } from '../registry-client.service';
import { PluginUpdateInfo } from '@modu-nest/plugin-types';

@Controller('plugins')
export class PluginController {
  constructor(
    private readonly pluginLoader: PluginLoaderService,
    private readonly registryClient: RegistryClientService
  ) {}

  @Get('installed')
  getInstalledPlugins() {
    const loadedPlugins = this.pluginLoader.getLoadedPlugins();
    return Array.from(loadedPlugins.entries()).map(([pluginName, plugin]) => ({
      ...plugin.manifest,
      name: pluginName,
      status: 'active',
      loadedAt: new Date().toISOString(),
    }));
  }

  @Get('updates')
  async checkForUpdates(): Promise<PluginUpdateInfo[]> {
    const loadedPlugins = this.pluginLoader.getLoadedPlugins();
    return this.registryClient.checkPluginUpdates(loadedPlugins);
  }

  @Get('stats')
  async getPluginStats() {
    return await this.pluginLoader.getPluginStats();
  }

  @Get('cross-plugin-services')
  getCrossPluginServices() {
    return {
      availableServices: this.pluginLoader.getAvailableCrossPluginServices(),
      globalServices: this.pluginLoader.getGlobalCrossPluginServices(),
      statistics: this.pluginLoader.getCrossPluginServiceManager().getStatistics(),
    };
  }

  @Get('memory/:name')
  getPluginMemoryStats(@Param('name') name: string) {
    return this.pluginLoader.getPluginMemoryStats(name);
  }

  @Post('memory/cleanup')
  async forceMemoryCleanup() {
    return await this.pluginLoader.forceMemoryCleanup();
  }
}