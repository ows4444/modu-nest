import { Module, OnModuleInit, DynamicModule, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppController } from './app.controller';
import { PluginLoaderService } from './plugin-loader.service';
import { RegistryClientService } from './registry-client.service';
import { SharedConfigModule } from '@modu-nest/config';
import { PluginGuardRegistryService, PluginGuardInterceptor } from '@modu-nest/plugin-types';

@Module({})
export class AppModule implements OnModuleInit {
  private static readonly logger = new Logger(AppModule.name);
  private readonly instanceLogger = new Logger(AppModule.name);

  static async register(): Promise<DynamicModule> {
    this.logger.debug('Registering AppModule with dynamic plugins...');
    const pluginLoaderInstance = new PluginLoaderService();
    const guardRegistryInstance = new PluginGuardRegistryService();

    // Set the guard registry before loading plugins
    pluginLoaderInstance.setGuardRegistry(guardRegistryInstance);

    const pluginModules = await pluginLoaderInstance.scanAndLoadAllPlugins();

    this.logger.log(`Found ${pluginModules.length} plugins to import`);

    // Set up guard interceptor with allowed guards
    const guardInterceptor = new PluginGuardInterceptor(new Reflector(), guardRegistryInstance);
    guardInterceptor.setAllowedGuards(pluginLoaderInstance.getAllowedGuards());

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
      controllers: [AppController],
      providers: [
        {
          provide: PluginLoaderService,
          useValue: pluginLoaderInstance, // Use the same instance that loaded the plugins
        },
        {
          provide: PluginGuardRegistryService,
          useValue: guardRegistryInstance, // Use the same instance that registered the guards
        },
        {
          provide: PluginGuardInterceptor,
          useValue: guardInterceptor, // Use the configured interceptor with allowed guards
        },
        RegistryClientService,
        Reflector,
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
