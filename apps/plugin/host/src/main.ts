import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Environment, ENVIRONMENT_ENV } from '@shared/config';
import { EnvironmentType } from '@shared/const';
import { AppModule } from './app/app.module';
import { BootstrapSwagger } from './bootstrap/swagger.bootstrap';
import helmet from 'helmet';
import { PluginGuardInterceptor } from '@plugin/services';

async function Bootstrap() {
  const dynamicAppModule = await AppModule.register();
  const app = await NestFactory.create<NestExpressApplication>(dynamicAppModule, {
    bufferLogs: true,
  });
  const logger = new Logger(Bootstrap.name);
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalGuards(app.get(PluginGuardInterceptor));

  app.flushLogs();
  const configService = app.get(ConfigService);
  const { port, host, corsOrigins = ['*'] } = configService.getOrThrow<Environment>(ENVIRONMENT_ENV);

  const globalPrefix = configService.get<string>('API_PREFIX') || 'api';
  const isProduction = configService.getOrThrow<string>('NODE_ENV') === EnvironmentType.Production;

  // Security headers configuration
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allows plugin loading
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      frameguard: { action: 'deny' },
      permittedCrossDomainPolicies: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    credentials: true,
  });
  app.setGlobalPrefix(globalPrefix, {
    exclude: [{ method: RequestMethod.GET, path: '/health/*path' }],
  });

  if (isProduction) {
    app.enableShutdownHooks();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  } else {
    BootstrapSwagger(app);
  }
  app.disable('x-powered-by');
  await app.listen(port, host);
  logger.log(`🚀 Application is running on: http://${host}:${port}/${globalPrefix}`);
}

Bootstrap();
