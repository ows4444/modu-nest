import { OnModuleInit, DynamicModule, Logger } from '@nestjs/common';
import { AppController } from './app.controller';
import { PluginLoaderService } from './plugin-loader.service';
import { RegistryClientService } from './registry-client.service';
import { PluginGuardRegistryService } from '@modu-nest/plugin-types';
import { SharedConfigModule } from '@modu-nest/config';

export class AppModule implements OnModuleInit {
  private static readonly logger = new Logger(AppModule.name);
  private readonly instanceLogger = new Logger(AppModule.name);

  static async register(): Promise<DynamicModule> {
    this.logger.debug('Registering AppModule with dynamic plugins...');
    
    // Create and configure guard registry
    const guardRegistryInstance = new PluginGuardRegistryService();
    
    // Create plugin loader and inject dependencies
    const pluginLoaderInstance = new PluginLoaderService();
    pluginLoaderInstance.setGuardRegistry(guardRegistryInstance);
    
    // Load plugins
    const pluginModules = await pluginLoaderInstance.scanAndLoadAllPlugins();
    this.logger.log(`Loaded ${pluginModules.length} plugin modules`);

    return {
      module: AppModule,
      imports: [
        SharedConfigModule.forRoot({
          isGlobal: true,
          expandVariables: true,
          envFilePath: [__dirname],
          load: [],
        }),
        ...pluginModules,
      ],
      controllers: [AppController],
      providers: [
        {
          provide: PluginGuardRegistryService,
          useValue: guardRegistryInstance,
        },
        {
          provide: PluginLoaderService,
          useValue: pluginLoaderInstance,
        },
        RegistryClientService,
      ],
    };
  }

  constructor(private pluginLoader: PluginLoaderService) {}

  async onModuleInit() {
    this.instanceLogger.log('AppModule initialized - plugins should be loaded');

    const loadedPlugins = this.pluginLoader.getLoadedPlugins();
    this.instanceLogger.log(`Active plugins: ${Array.from(loadedPlugins.keys()).join(', ')}`);

    loadedPlugins.forEach((plugin, name) => {
      this.instanceLogger.log(
        `Plugin ${name}: ${plugin.manifest.description || 'No description'} (v${plugin.manifest.version || '1.0.0'})`
      );
    });
  }
}
