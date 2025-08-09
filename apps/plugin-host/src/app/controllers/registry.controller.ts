import { Controller, Get, Post, Param, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { RegistryClientService, RegistryPluginMetadata } from '../registry-client.service';

@Controller('registry')
export class RegistryController {
  private readonly logger = new Logger(RegistryController.name);

  constructor(private readonly registryClient: RegistryClientService) {}

  @Get('plugins')
  async getAvailablePlugins(): Promise<RegistryPluginMetadata[]> {
    try {
      const startTime = Date.now();
      this.logger.debug('Fetching available plugins from registry');
      
      const plugins = await this.registryClient.listAvailablePlugins();
      
      const duration = Date.now() - startTime;
      this.logger.log(`Successfully fetched ${plugins.length} plugins in ${duration}ms`);
      
      return plugins;
    } catch (error) {
      this.logger.error('Failed to fetch available plugins:', error);
      
      // Re-throw HttpException as-is, transform other errors
      if (error instanceof HttpException) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        {
          message: 'Failed to fetch available plugins',
          details: message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  @Get('plugins/:name')
  async getPluginInfo(@Param('name') name: string): Promise<RegistryPluginMetadata> {
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
      const startTime = Date.now();
      this.logger.debug(`Fetching plugin info for: ${name}`);
      
      const pluginInfo = await this.registryClient.getPluginInfo(name);
      
      const duration = Date.now() - startTime;
      this.logger.log(`Successfully fetched info for plugin '${name}' in ${duration}ms`);
      
      return pluginInfo;
    } catch (error) {
      this.logger.error(`Failed to fetch plugin info for '${name}':`, error);
      
      // Re-throw HttpException as-is, transform other errors
      if (error instanceof HttpException) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        {
          message: `Failed to fetch plugin info for '${name}'`,
          details: message,
          pluginName: name,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  @Post('plugins/:name/install')
  async installPlugin(@Param('name') name: string): Promise<{ message: string; pluginName: string; timestamp: string }> {
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
      const startTime = Date.now();
      this.logger.log(`Starting installation of plugin '${name}'`);
      
      await this.registryClient.downloadAndInstallPlugin(name);
      
      const duration = Date.now() - startTime;
      this.logger.log(`Successfully installed plugin '${name}' in ${duration}ms`);
      
      return {
        message: `Plugin '${name}' installed successfully. Restart the application to load the plugin.`,
        pluginName: name,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to install plugin '${name}':`, error);
      
      // Re-throw HttpException as-is, transform other errors
      if (error instanceof HttpException) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        {
          message: `Failed to install plugin '${name}'`,
          details: message,
          pluginName: name,
          timestamp: new Date().toISOString(),
          suggestion: 'Check if the plugin exists in the registry and the registry is accessible',
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  @Post('plugins/:name/update')
  async updatePlugin(@Param('name') name: string): Promise<{ message: string; pluginName: string; timestamp: string }> {
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
      const startTime = Date.now();
      this.logger.log(`Starting update of plugin '${name}'`);
      
      await this.registryClient.downloadAndInstallPlugin(name);
      
      const duration = Date.now() - startTime;
      this.logger.log(`Successfully updated plugin '${name}' in ${duration}ms`);
      
      return {
        message: `Plugin '${name}' updated successfully. Restart the application to load the updated plugin.`,
        pluginName: name,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to update plugin '${name}':`, error);
      
      // Re-throw HttpException as-is, transform other errors
      if (error instanceof HttpException) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        {
          message: `Failed to update plugin '${name}'`,
          details: message,
          pluginName: name,
          timestamp: new Date().toISOString(),
          suggestion: 'Check if the plugin exists in the registry and a newer version is available',
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  @Get('status')
  async getRegistryStatus() {
    try {
      const startTime = Date.now();
      this.logger.debug('Checking registry status');
      
      const isAvailable = await this.registryClient.isRegistryAvailable();
      const registryUrl = this.registryClient.getRegistryUrl();
      const duration = Date.now() - startTime;
      
      const status = {
        available: isAvailable,
        url: registryUrl,
        lastChecked: new Date().toISOString(),
        pluginsDirectory: this.registryClient.getPluginsDirectory(),
        responseTime: `${duration}ms`,
        status: isAvailable ? 'healthy' : 'unhealthy',
      };
      
      this.logger.log(`Registry status check completed: ${isAvailable ? 'available' : 'unavailable'} (${duration}ms)`);
      return status;
    } catch (error) {
      this.logger.error('Failed to check registry status:', error);
      
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        available: false,
        status: 'error',
        error: `Failed to check registry status: ${message}`,
        lastChecked: new Date().toISOString(),
        url: this.registryClient.getRegistryUrl(),
        suggestion: 'Check if the registry service is running and accessible',
      };
    }
  }
}