import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { AppController } from './app.controller';
import { PluginController } from './controllers/plugin.controller';
import { HealthController } from './controllers/health.controller';
import { PluginRegistryService } from './services/plugin-registry.service';
import { PluginStorageService } from './services/plugin-storage.service';
import { PluginValidationCacheService } from './services/plugin-validation-cache.service';
import { PluginValidationService } from './services/plugin-validation.service';
import { PluginSecurityService } from './services/plugin-security.service';
import { PluginSignatureService } from './services/plugin-signature.service';
import { PluginStorageOrchestratorService } from './services/plugin-storage-orchestrator.service';
import { ErrorHandlingInterceptor } from './interceptors/error-handling.interceptor';
import { SharedConfigModule } from '@modu-nest/config';
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
  controllers: [AppController, PluginController, HealthController],
  providers: [
    PluginStorageService,
    PluginValidationCacheService,
    PluginValidationService,
    PluginSecurityService,
    PluginSignatureService,
    PluginStorageOrchestratorService,
    PluginRegistryService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ErrorHandlingInterceptor,
    },
  ],
  exports: [
    PluginRegistryService,
    PluginStorageService,
    PluginValidationCacheService,
    PluginValidationService,
    PluginSecurityService,
    PluginSignatureService,
    PluginStorageOrchestratorService,
  ],
})
export class AppModule {}
