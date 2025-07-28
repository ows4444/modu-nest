import { Module, OnModuleInit, DynamicModule, Logger } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PluginLoaderService } from './plugin-loader.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, PluginLoaderService],
})
export class AppModule implements OnModuleInit {
  private static readonly logger = new Logger(AppModule.name);
  private readonly instanceLogger = new Logger(AppModule.name);

  static async register(): Promise<DynamicModule> {
    this.logger.log('Registering AppModule with dynamic plugins...');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pluginLoaderInstance = new PluginLoaderService(null as any);
    const pluginModules = await pluginLoaderInstance.scanAndLoadAllPlugins();

    this.logger.log(`Found ${pluginModules.length} plugins to import`);

    return {
      module: AppModule,
      imports: pluginModules,
      controllers: [AppController],
      providers: [AppService, PluginLoaderService],
    };
  }

  constructor(private pluginLoader: PluginLoaderService) {}

  async onModuleInit() {
    this.instanceLogger.log('AppModule initialized - plugins should be loaded');
    
    const loadedPlugins = this.pluginLoader.getLoadedPlugins();
    this.instanceLogger.log(`Active plugins: ${Array.from(loadedPlugins.keys()).join(', ')}`);
    
    loadedPlugins.forEach((plugin, name) => {
      this.instanceLogger.log(`Plugin ${name}: ${plugin.manifest.description} (v${plugin.manifest.version})`);
    });
  }
}
