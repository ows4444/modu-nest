import { Injectable, Logger, DynamicModule } from '@nestjs/common';
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';

interface PluginManifest {
  name: string;
  entryPoint: string;
  version: string;
  description: string;
}

interface LoadedPlugin {
  manifest: PluginManifest;
  module: unknown;
  instance: unknown;
}

@Injectable()
export class PluginLoaderService {
  private readonly logger = new Logger(PluginLoaderService.name);
  private loadedPlugins = new Map<string, LoadedPlugin>();

  getLoadedPlugins(): Map<string, LoadedPlugin> {
    return this.loadedPlugins;
  }

  isPluginLoaded(pluginName: string): boolean {
    return this.loadedPlugins.has(pluginName);
  }

  async scanAndLoadAllPlugins(): Promise<DynamicModule[]> {
    this.logger.log('Scanning assets/plugins folder for available plugins...');
    const pluginsPath = path.resolve(__dirname, 'assets', 'plugins');
    const dynamicModules: DynamicModule[] = [];

    try {
      if (!fs.existsSync(pluginsPath)) {
        this.logger.warn(`Plugins directory not found: ${pluginsPath}`);
        return dynamicModules;
      }

      const pluginDirs = fs
        .readdirSync(pluginsPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      this.logger.log(`Found plugin directories: ${pluginDirs.join(', ')}`);

      for (const pluginDir of pluginDirs) {
        try {
          const pluginPath = path.join(pluginsPath, pluginDir);
          const distPath = path.join(pluginPath, 'dist');
          const manifestPath = path.join(pluginPath, 'plugin.manifest.json');

          if (!fs.existsSync(distPath) || !fs.existsSync(manifestPath)) {
            this.logger.warn(`Skipping ${pluginDir}: missing dist folder or manifest`);
            continue;
          }

          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const indexPath = path.join(distPath, 'index.js');

          if (!fs.existsSync(indexPath)) {
            this.logger.warn(`Skipping ${pluginDir}: missing index.js in dist`);
            continue;
          }

          const pluginModule = await import(/* webpackIgnore: true */ indexPath);
          const dynamicModule = await this.createDynamicModuleFromPlugin(manifest, pluginModule);

          if (dynamicModule) {
            dynamicModules.push(dynamicModule);
            this.loadedPlugins.set(manifest.name, {
              manifest,
              module: dynamicModule,
              instance: pluginModule,
            });
          }
        } catch (error) {
          this.logger.error(`Failed to load plugin ${pluginDir}:`, error);
        }
      }

      this.logger.log(`Successfully loaded ${dynamicModules.length} plugins`);
      return dynamicModules;
    } catch (error) {
      this.logger.error('Failed to scan plugins folder:', error);
      return dynamicModules;
    }
  }

  private async createDynamicModuleFromPlugin(
    manifest: PluginManifest,
    pluginModule: any
  ): Promise<DynamicModule | null> {
    try {
      const entryPointClass = pluginModule[manifest.entryPoint];

      if (!entryPointClass) {
        this.logger.error(`Entry point ${manifest.entryPoint} not found in plugin ${manifest.name}`);
        return null;
      }

      const controllers: any[] = [];
      const providers: any[] = [];
      const exports: any[] = [];

      Object.keys(pluginModule).forEach((key) => {
        const exportedItem = pluginModule[key];
        if (typeof exportedItem === 'function') {
          if (key.toLowerCase().includes('controller')) {
            controllers.push(exportedItem);
            this.logger.log(`Found controller: ${key}`);
          } else if (key.toLowerCase().includes('service')) {
            providers.push(exportedItem);
            exports.push(exportedItem);
            this.logger.log(`Found service: ${key}`);
          }
        }
      });

      const dynamicModule: DynamicModule = {
        module: entryPointClass,
        controllers,
        providers,
        exports,
      };

      this.logger.log(
        `Created dynamic module for ${manifest.name} with ${controllers.length} controllers and ${providers.length} providers`
      );
      return dynamicModule;
    } catch (error) {
      this.logger.error(`Failed to create dynamic module for ${manifest.name}:`, error);
      return null;
    }
  }

  async loadAndRegisterPluginModule(pluginName: string, pluginModule: any): Promise<void> {
    this.logger.log(`Loading and registering plugin module: ${pluginName}`);

    try {
      // Get the main plugin class (assuming it's exported as MyPlugin)
      const PluginClass = pluginModule.MyPlugin;

      if (!PluginClass) {
        throw new Error(`Plugin class not found in module: ${pluginName}`);
      }

      // Log what's available in the plugin module
      this.logger.log(`Available exports: ${Object.keys(pluginModule)}`);
      this.logger.log(`Plugin class: ${PluginClass.name}`);

      // Get the controller and service from exports
      const MyPluginController = pluginModule.MyPluginController;
      const MyPluginService = pluginModule.MyPluginService;

      // Create a dynamic module from the plugin exports
      const dynamicModule: DynamicModule = {
        module: PluginClass,
        controllers: MyPluginController ? [MyPluginController] : [],
        providers: MyPluginService ? [MyPluginService] : [],
        exports: MyPluginService ? [MyPluginService] : [],
      };

      this.loadedPlugins.set(pluginName, {
        manifest: { name: pluginName, entryPoint: 'MyPlugin', version: '1.0.0', description: 'Dynamic plugin' },
        module: dynamicModule,
        instance: PluginClass,
      });

      this.logger.log(`Successfully loaded plugin module: ${pluginName}`);
      this.logger.log(`Plugin controllers: ${dynamicModule.controllers?.length || 0}`);
      this.logger.log(`Plugin providers: ${dynamicModule.providers?.length || 0}`);
    } catch (error) {
      this.logger.error(`Failed to load plugin module ${pluginName}:`, error);
      throw error;
    }
  }

  registerPlugin(pluginName: string, pluginModule: unknown): void {
    this.logger.log(`Registering plugin: ${pluginName}`);

    this.loadedPlugins.set(pluginName, {
      manifest: { name: pluginName, entryPoint: 'MyPlugin', version: '1.0.0', description: 'Dynamic plugin' },
      module: pluginModule,
      instance: null,
    });

    this.logger.log(`Successfully registered plugin: ${pluginName}`);
  }
}
