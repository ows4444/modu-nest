import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { AppController } from './app.controller';
import { PluginController } from './controllers/plugin.controller';
import { HealthController } from './controllers/health.controller';
import { PluginRegistryService } from './services/plugin-registry.service';
import { PluginStorageService } from './services/plugin-storage.service';
import { ErrorHandlingInterceptor } from './interceptors/error-handling.interceptor';

@Module({
  imports: [
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
    PluginRegistryService,
    PluginStorageService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ErrorHandlingInterceptor,
    },
  ],
  exports: [PluginRegistryService, PluginStorageService],
})
export class AppModule {}
