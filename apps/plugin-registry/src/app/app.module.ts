import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { AppController } from './app.controller';
import { PluginController } from './controllers/plugin.controller';
import { HealthController } from './controllers/health.controller';
import { PluginVersionController } from './controllers/plugin-version.controller';
import { PluginTrustController } from './controllers/plugin-trust.controller';
import { PluginRegistryService } from './services/plugin-registry.service';
import { PluginStorageService } from './services/plugin-storage.service';
import { PluginValidationCacheService } from './services/plugin-validation-cache.service';
import { PluginValidationService } from './services/plugin-validation.service';
import { PluginSecurityService } from './services/plugin-security.service';
import { PluginSignatureService } from './services/plugin-signature.service';
import { PluginRateLimitingService } from './services/plugin-rate-limiting.service';
import { PluginBundleOptimizationService } from './services/plugin-bundle-optimization.service';
import { PluginStorageOrchestratorService } from './services/plugin-storage-orchestrator.service';
import { PluginVersionManager } from './services/plugin-version-manager';
import { PluginTrustManager } from './services/plugin-trust-manager';
import { SecurityEventLoggerService } from './services/security-event-logger.service';
import { PluginRegistryMetricsService } from './services/plugin-registry-metrics.service';
import { ErrorHandlingInterceptor } from './interceptors/error-handling.interceptor';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { SharedConfigModule } from '@libs/shared-config';
import { RepositoryModule } from './modules/repository.module';

@Module({
  imports: [
    SharedConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      envFilePath: [__dirname],
      load: [],
    }),

    // Repository module with automatic database type detection
    RepositoryModule.forRoot(),

    MulterModule.register({
      limits: {
        fileSize: parseInt(process.env.MAX_PLUGIN_SIZE || '52428800', 10), // 50MB default
        fieldSize: 1024 * 1024, // 1MB field size
      },
      fileFilter: (_req, file, cb) => {
        // Only accept ZIP files
        if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
          cb(null, true);
        } else {
          cb(new Error('Only ZIP files are allowed'), false);
        }
      },
    }),
  ],
  controllers: [AppController, PluginController, HealthController, PluginVersionController, PluginTrustController],
  providers: [
    PluginStorageService,
    PluginValidationCacheService,
    PluginValidationService,
    PluginSecurityService,
    PluginSignatureService,
    PluginRateLimitingService,
    PluginBundleOptimizationService,
    PluginStorageOrchestratorService,
    PluginVersionManager,
    PluginTrustManager,
    SecurityEventLoggerService,
    PluginRegistryMetricsService,
    PluginRegistryService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ErrorHandlingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
  exports: [
    PluginRegistryService,
    PluginStorageService,
    PluginValidationCacheService,
    PluginValidationService,
    PluginSecurityService,
    PluginSignatureService,
    PluginRateLimitingService,
    PluginBundleOptimizationService,
    PluginStorageOrchestratorService,
    PluginVersionManager,
    PluginTrustManager,
  ],
})
export class AppModule {}
