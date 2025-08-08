import { Module, OnModuleInit, DynamicModule, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PluginController } from './controllers/plugin.controller';
import { MetricsController } from './controllers/metrics.controller';
import { HealthController } from './controllers/health.controller';
import { CacheController } from './controllers/cache.controller';
import { RegistryController } from './controllers/registry.controller';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginMetricsService } from './plugin-metrics.service';
import { RegistryClientService } from './registry-client.service';
import { CrossPluginServiceManager } from './cross-plugin-service-manager';
import { SharedConfigModule } from '@modu-nest/config';
import {
  PluginGuardInterceptor,
  PluginGuardRegistryService,
  PluginPermissionInterceptor,
  DefaultPluginPermissionService,
  PLUGIN_PERMISSION_SERVICE,
} from '@modu-nest/plugin-types';

@Module({})
export class AppModule implements OnModuleInit {
  private static readonly logger = new Logger(AppModule.name);
  private readonly instanceLogger = new Logger(AppModule.name);

  static async register(): Promise<DynamicModule> {
    this.logger.debug('Registering AppModule with dynamic plugins...');
    const pluginLoaderInstance = new PluginLoaderService();

    const pluginModules = await pluginLoaderInstance.scanAndLoadAllPlugins();

    this.logger.log(`Found ${pluginModules.length} plugins to import`);

    // Add shared configuration module
    const baseImports = [
      SharedConfigModule.forRoot({
        isGlobal: true,
        expandVariables: true,
        envFilePath: [__dirname],
        load: [],
      }),
    ];

    return {
      module: AppModule,
      imports: [...baseImports, ...pluginModules],
      controllers: [
        AppController,
        PluginController,
        MetricsController,
        HealthController,
        CacheController,
        RegistryController,
      ],
      providers: [
        {
          provide: PluginLoaderService,
          useValue: pluginLoaderInstance,
        },
        PluginMetricsService,
        RegistryClientService,
        CrossPluginServiceManager,
        PluginGuardRegistryService,
        PluginGuardInterceptor,
        {
          provide: PLUGIN_PERMISSION_SERVICE,
          useClass: DefaultPluginPermissionService,
        },
        {
          provide: APP_GUARD,
          useClass: PluginPermissionInterceptor,
        },
      ],
    };
  }

  constructor(
    private pluginLoader: PluginLoaderService,
    private metricsService: PluginMetricsService,
    private guardRegistry: PluginGuardRegistryService,
    private guardInterceptor: PluginGuardInterceptor
  ) {}

  async onModuleInit() {
    this.instanceLogger.log('AppModule initialized - plugins should be loaded');

    // Set up metrics service in plugin loader
    this.pluginLoader.setMetricsService(this.metricsService);

    // Set up guard registry in plugin loader
    this.pluginLoader.setGuardRegistry(this.guardRegistry);

    const loadedPlugins = this.pluginLoader.getLoadedPlugins();
    this.instanceLogger.log(`Active plugins: ${Array.from(loadedPlugins.keys()).join(', ')}`);

    // Register guards and set up plugin guard system
    await this.setupPluginGuardSystem();

    loadedPlugins.forEach((plugin, name) => {
      this.instanceLogger.log(
        `Plugin ${name}: ${plugin.manifest.description || 'No description'} (v${plugin.manifest.version || '1.0.0'})`
      );
    });
  }

  private async setupPluginGuardSystem() {
    this.instanceLogger.log('Setting up plugin guard system...');

    // Get guard statistics from the plugin loader
    const guardStats = this.pluginLoader.getGuardStatistics();
    this.instanceLogger.log(
      `Guard system: ${guardStats.totalGuards} total guards ` + `across ${guardStats.totalPlugins} plugins`
    );

    // Set up guard registry with plugins and their allowed guards
    const allowedGuards = this.createAllowedGuardsMap();
    this.guardInterceptor.setAllowedGuards(allowedGuards);

    this.instanceLogger.log('Plugin guard system setup completed');
  }

  private createAllowedGuardsMap(): Map<string, string[]> {
    const allowedGuards = new Map<string, string[]>();
    const loadedPlugins = this.pluginLoader.getLoadedPlugins();

    for (const [pluginName, plugin] of loadedPlugins) {
      const guards: string[] = [];

      // Add plugin's own guards (both local and external)
      if (plugin.manifest.module.guards) {
        for (const guard of plugin.manifest.module.guards) {
          guards.push(guard.name);
        }
      }

      // Add exported guards from dependencies
      if (plugin.manifest.dependencies) {
        for (const depName of plugin.manifest.dependencies) {
          const depPlugin = loadedPlugins.get(depName);
          if (depPlugin && depPlugin.manifest.module.guards) {
            for (const guard of depPlugin.manifest.module.guards) {
              // Add all exported guards from dependency plugins
              if (guard.scope === 'local' && (guard as unknown as Record<string, unknown>).exported === true) {
                guards.push(guard.name);
              }
            }
          }
        }
      }

      allowedGuards.set(pluginName, [...new Set(guards)]); // Remove duplicates
      this.instanceLogger.debug(`Plugin '${pluginName}' allowed guards: [${guards.join(', ')}]`);
    }

    return allowedGuards;
  }
}
