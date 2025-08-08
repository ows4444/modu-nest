import { Controller, Get, Post, Param } from '@nestjs/common';
import { RegistryClientService, RegistryPluginMetadata } from '../registry-client.service';

@Controller('registry')
export class RegistryController {
  constructor(private readonly registryClient: RegistryClientService) {}

  @Get('plugins')
  async getAvailablePlugins(): Promise<RegistryPluginMetadata[]> {
    try {
      return await this.registryClient.listAvailablePlugins();
    } catch (error) {
      throw new Error(`Failed to fetch available plugins: ${(error as Error).message}`);
    }
  }

  @Get('plugins/:name')
  async getPluginInfo(@Param('name') name: string): Promise<RegistryPluginMetadata> {
    try {
      return await this.registryClient.getPluginInfo(name);
    } catch (error) {
      throw new Error(`Failed to fetch plugin info for ${name}: ${(error as Error).message}`);
    }
  }

  @Post('plugins/:name/install')
  async installPlugin(@Param('name') name: string): Promise<{ message: string }> {
    try {
      await this.registryClient.downloadAndInstallPlugin(name);
      return { message: `Plugin ${name} installed successfully. Restart the application to load the plugin.` };
    } catch (error) {
      throw new Error(`Failed to install plugin ${name}: ${(error as Error).message}`);
    }
  }

  @Post('plugins/:name/update')
  async updatePlugin(@Param('name') name: string): Promise<{ message: string }> {
    try {
      await this.registryClient.downloadAndInstallPlugin(name);
      return { message: `Plugin ${name} updated successfully. Restart the application to load the updated plugin.` };
    } catch (error) {
      throw new Error(`Failed to update plugin ${name}: ${(error as Error).message}`);
    }
  }

  @Get('status')
  async getRegistryStatus() {
    try {
      const isAvailable = await this.registryClient.isRegistryAvailable();
      const registryUrl = this.registryClient.getRegistryUrl();

      return {
        available: isAvailable,
        url: registryUrl,
        lastChecked: new Date().toISOString(),
        pluginsDirectory: this.registryClient.getPluginsDirectory(),
      };
    } catch (error) {
      return {
        available: false,
        error: `Failed to check registry status: ${(error as Error).message}`,
        lastChecked: new Date().toISOString(),
      };
    }
  }
}