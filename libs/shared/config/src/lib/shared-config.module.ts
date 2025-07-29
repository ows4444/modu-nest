import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigModuleOptions } from '@nestjs/config';

import { envLoader, getEnvFile } from './env/env.loader';

import { swaggerEnvLoader } from './swagger/swagger.loader';

@Global()
@Module({
  imports: [ConfigModule],
  exports: [ConfigModule],
})
export class SharedConfigModule {
  static forRoot(options: ConfigModuleOptions): DynamicModule {
    return {
      module: SharedConfigModule,
      imports: [
        ConfigModule.forRoot({
          ...options,
          isGlobal: options.isGlobal ?? true,
          load: [envLoader, swaggerEnvLoader, ...(options.load ?? [])],
          envFilePath: getEnvFile(options.envFilePath),
          validationOptions: {
            allowUnknown: true,
            abortEarly: false,
          },
          cache: options.cache ?? true,
        }),
      ],
      exports: [ConfigModule],
    };
  }
}
