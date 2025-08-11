import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SharedConfigModule } from '@libs/shared-config';
import { StandardErrorHandlingInterceptor } from '../interceptors/error-handling.interceptor';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';

export interface CoreAppModuleOptions {
  /**
   * Enable global error handling interceptor
   * @default true
   */
  enableErrorHandling?: boolean;

  /**
   * Enable global exception filter
   * @default true
   */
  enableGlobalFilter?: boolean;

  /**
   * Additional providers to register globally
   */
  providers?: Provider[];

  /**
   * Additional imports for the module
   */
  imports?: any[];
}

/**
 * Core application module that provides common functionality
 * shared between plugin-host and plugin-registry apps
 */
@Global()
@Module({})
export class CoreAppModule {
  static forRoot(options: CoreAppModuleOptions = {}): DynamicModule {
    const { enableErrorHandling = true, enableGlobalFilter = true, providers = [], imports = [] } = options;

    const coreProviders: Provider[] = [];

    if (enableErrorHandling) {
      coreProviders.push({
        provide: APP_INTERCEPTOR,
        useClass: StandardErrorHandlingInterceptor,
      });
    }

    if (enableGlobalFilter) {
      coreProviders.push({
        provide: APP_FILTER,
        useClass: GlobalExceptionFilter,
      });
    }

    return {
      module: CoreAppModule,
      imports: [SharedConfigModule.forRoot({ isGlobal: true }), ...imports],
      providers: [...coreProviders, ...providers],
      exports: [SharedConfigModule],
    };
  }
}
