import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Environment, ENVIRONMENT_ENV } from '@modu-nest/config';
import { EnvironmentType } from '@modu-nest/const';
import { AppModule } from './app/app.module';
import { BootstrapSwagger } from './bootstrap/swagger.bootstrap';
//import { PluginGuardInterceptor } from '@modu-nest/plugin-types';

async function Bootstrap() {
  const dynamicAppModule = await AppModule.register();
  const app = await NestFactory.create<NestExpressApplication>(dynamicAppModule, {
    bufferLogs: true,
  });
  const logger = new Logger(Bootstrap.name);
  app.useGlobalPipes(new ValidationPipe());
  //app.useGlobalGuards(app.get(PluginGuardInterceptor));

  app.flushLogs();
  const configService = app.get(ConfigService);
  const { port, host, corsOrigins = ['*'] } = configService.getOrThrow<Environment>(ENVIRONMENT_ENV);

  const globalPrefix = configService.get<string>('API_PREFIX') || 'api';

  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    credentials: true,
  });
  app.setGlobalPrefix(globalPrefix, {
    exclude: [{ method: RequestMethod.GET, path: '/health/*path' }],
  });

  const isProduction = configService.getOrThrow<string>('NODE_ENV') === EnvironmentType.Production;

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
