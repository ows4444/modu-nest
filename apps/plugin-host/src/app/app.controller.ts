import { Controller, Get, Post, Param } from '@nestjs/common';
import { PluginLoaderService } from './plugin-loader.service';
import { RegistryClientService, RegistryPluginMetadata } from './registry-client.service';
import { LoadedPlugin, PluginUpdateInfo } from '@modu-nest/plugin-types';

@Controller()
export class AppController {
  constructor(
    private readonly pluginLoader: PluginLoaderService,
    private readonly registryClient: RegistryClientService
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
  getPluginStats() {
    return this.pluginLoader.getPluginStats();
  }

  @Get('plugins/cross-plugin-services')
  getCrossPluginServices() {
    return {
      availableServices: this.pluginLoader.getAvailableCrossPluginServices(),
      globalServices: this.pluginLoader.getGlobalCrossPluginServices(),
      statistics: this.pluginLoader.getCrossPluginServiceManager().getStatistics(),
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

}
