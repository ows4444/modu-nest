import { Module, DynamicModule, Global } from '@nestjs/common';
import { FileAccessService } from './file-access.service';
import { PluginPermissionService } from './plugin-permission.service';
import { RestrictedPluginContextService } from './restricted-plugin-context.service';
import {
  FileAccessConfigService,
  FileAccessConfig,
  FILE_ACCESS_CONFIG,
  DEFAULT_FILE_ACCESS_CONFIG,
} from './file-access.config';

@Global()
@Module({})
export class ModuNestPluginContextModule {
  static forRoot(config?: Partial<FileAccessConfig>): DynamicModule {
    const fileAccessConfig = {
      ...DEFAULT_FILE_ACCESS_CONFIG,
      ...config,
      defaultOptions: {
        ...DEFAULT_FILE_ACCESS_CONFIG.defaultOptions,
        ...config?.defaultOptions,
      },
    };

    return {
      module: ModuNestPluginContextModule,
      providers: [
        {
          provide: FILE_ACCESS_CONFIG,
          useValue: fileAccessConfig,
        },
        FileAccessConfigService,
        FileAccessService,
        PluginPermissionService,
        RestrictedPluginContextService,
      ],
      exports: [
        FileAccessService,
        FileAccessConfigService,
        PluginPermissionService,
        RestrictedPluginContextService,
        FILE_ACCESS_CONFIG,
      ],
      global: false,
    };
  }

  static forRootAsync(options: {
    useFactory: (...args: any[]) => FileAccessConfig | Promise<FileAccessConfig>;
    inject?: any[];
    imports?: any[];
  }): DynamicModule {
    return {
      module: ModuNestPluginContextModule,
      imports: options.imports || [],
      providers: [
        {
          provide: FILE_ACCESS_CONFIG,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        FileAccessConfigService,
        FileAccessService,
        PluginPermissionService,
        RestrictedPluginContextService,
      ],
      exports: [
        FileAccessService,
        FileAccessConfigService,
        PluginPermissionService,
        RestrictedPluginContextService,
        FILE_ACCESS_CONFIG,
      ],
      global: false,
    };
  }

  static forFeature(): DynamicModule {
    return {
      module: ModuNestPluginContextModule,
      providers: [
        {
          provide: FILE_ACCESS_CONFIG,
          useValue: DEFAULT_FILE_ACCESS_CONFIG,
        },
        FileAccessConfigService,
        FileAccessService,
        PluginPermissionService,
        RestrictedPluginContextService,
      ],
      exports: [FileAccessService, FileAccessConfigService, PluginPermissionService, RestrictedPluginContextService],
      global: false,
    };
  }
}
