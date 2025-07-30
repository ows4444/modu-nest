import { Module, OnModuleInit, DynamicModule, Logger } from '@nestjs/common';
import { AppController } from './app.controller';
import { PluginLoaderService } from './plugin-loader.service';
import { RegistryClientService } from './registry-client.service';
import { SharedConfigModule } from '@modu-nest/config';

@Module({
  imports: [
    SharedConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      envFilePath: [__dirname],
      load: [],
    }),
  ],
  controllers: [AppController],
  providers: [PluginLoaderService, RegistryClientService],
})
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
      controllers: [AppController],
      providers: [
        {
          provide: PluginLoaderService,
          useValue: pluginLoaderInstance, // Use the same instance that loaded the plugins
        },
        RegistryClientService
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
