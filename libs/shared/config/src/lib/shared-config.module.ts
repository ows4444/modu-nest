import { DynamicModule, Global, Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigModuleOptions } from '@nestjs/config';

import { envLoader, getEnvFile } from './env/env.loader';
import { optimizedEnvLoader, getEnvFile as getOptimizedEnvFile } from './env/optimized-env.loader';

import { swaggerEnvLoader } from './swagger/swagger.loader';
import { ConfigCacheService, configCache } from './config-cache.service';

/**
 * Performance monitoring for config loading
 */
class ConfigPerformanceMonitor {
  private static readonly logger = new Logger('ConfigPerformanceMonitor');
  private static startTime: number;

  static startTiming() {
    this.startTime = Date.now();
  }

  static endTiming(operation: string) {
    const duration = Date.now() - this.startTime;
    this.logger.log(`${operation} completed in ${duration}ms`);
    return duration;
  }
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ConfigCacheService],
  exports: [ConfigModule, ConfigCacheService],
})
export class SharedConfigModule implements OnModuleInit {
  private static configInstance: DynamicModule | null = null;
  private readonly logger = new Logger(SharedConfigModule.name);

  async onModuleInit() {
    // Start periodic cache cleanup
    configCache.startPeriodicCleanup();
    
    this.logger.log('SharedConfigModule initialized with optimized caching');
    this.logger.debug(`Cache stats: ${JSON.stringify(configCache.getStats())}`);
  }

  /**
   * Optimized configuration loading with singleton pattern and caching
   */
  static forRoot(options: ConfigModuleOptions & { useOptimizedLoader?: boolean }): DynamicModule {
    // Return cached instance if already created (singleton pattern)
    if (SharedConfigModule.configInstance) {
      return SharedConfigModule.configInstance;
    }

    ConfigPerformanceMonitor.startTiming();

    const useOptimized = options.useOptimizedLoader ?? true;
    const envLoaderToUse = useOptimized ? optimizedEnvLoader : envLoader;
    const envFileGetter = useOptimized ? getOptimizedEnvFile : getEnvFile;

    SharedConfigModule.configInstance = {
      module: SharedConfigModule,
      imports: [
        ConfigModule.forRoot({
          ...options,
          isGlobal: options.isGlobal ?? true,
          load: [envLoaderToUse, swaggerEnvLoader, ...(options.load ?? [])],
          envFilePath: envFileGetter(options.envFilePath),
          validationOptions: {
            allowUnknown: true,
            abortEarly: false,
            ...options.validationOptions,
          },
          cache: options.cache ?? true,
          expandVariables: options.expandVariables ?? true,
        }),
      ],
      exports: [ConfigModule, ConfigCacheService],
    };

    ConfigPerformanceMonitor.endTiming('SharedConfigModule.forRoot');

    return SharedConfigModule.configInstance;
  }

  /**
   * Force recreation of config module (useful for testing)
   */
  static reset(): void {
    SharedConfigModule.configInstance = null;
    configCache.clear();
  }

  /**
   * Get configuration loading performance metrics
   */
  static getPerformanceMetrics() {
    return {
      cacheStats: configCache.getStats(),
      instanceCreated: !!SharedConfigModule.configInstance,
    };
  }
}
