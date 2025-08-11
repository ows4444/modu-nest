import { Controller, Get, Post, Param, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PluginLoaderService } from '../plugin-loader-primary.service';
import { RegistryClientService } from '../registry-client.service';
import { PluginUpdateInfo } from '@plugin/types';

@Controller('plugins')
export class PluginController {
  private readonly logger = new Logger(PluginController.name);

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
    try {
      const startTime = Date.now();
      this.logger.debug('Checking for plugin updates');

      const loadedPlugins = this.pluginLoader.getLoadedPlugins();
      this.logger.debug(`Checking updates for ${loadedPlugins.size} installed plugins`);

      const updates = await this.registryClient.checkPluginUpdates(loadedPlugins);

      const duration = Date.now() - startTime;
      this.logger.log(`Update check completed: found ${updates.length} available updates (${duration}ms)`);

      return updates;
    } catch (error) {
      this.logger.error('Failed to check for plugin updates:', error);

      // Re-throw HttpException as-is, transform other errors
      if (error instanceof HttpException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        {
          message: 'Failed to check for plugin updates',
          details: message,
          timestamp: new Date().toISOString(),
          suggestion: 'Check if the plugin registry is accessible and try again',
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
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
    if (!name?.trim()) {
      throw new HttpException(
        {
          message: 'Plugin name is required',
          details: 'Plugin name parameter cannot be empty',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      this.logger.debug(`Fetching memory stats for plugin: ${name}`);
      const memoryStats = this.pluginLoader.getPluginMemoryStats(name);

      if (!memoryStats) {
        throw new HttpException(
          {
            message: `Plugin '${name}' not found`,
            details: 'No memory statistics available for this plugin',
            pluginName: name,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND
        );
      }

      return memoryStats;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Failed to get memory stats for plugin '${name}':`, error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        {
          message: `Failed to get memory statistics for plugin '${name}'`,
          details: message,
          pluginName: name,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('memory/cleanup')
  async forceMemoryCleanup() {
    try {
      const startTime = Date.now();
      this.logger.log('Starting forced memory cleanup');

      const result = await this.pluginLoader.forceMemoryCleanup();

      const duration = Date.now() - startTime;
      this.logger.log(`Memory cleanup completed successfully (${duration}ms)`);

      return {
        ...result,
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
      };
    } catch (error) {
      this.logger.error('Failed to perform memory cleanup:', error);

      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        {
          message: 'Failed to perform memory cleanup',
          details: message,
          timestamp: new Date().toISOString(),
          suggestion: 'Try restarting the application if memory issues persist',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
