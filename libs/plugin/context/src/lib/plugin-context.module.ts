import { Module, DynamicModule, Global } from '@nestjs/common';
import { FileAccessService } from './file-access.service';
import { PluginPermissionService } from './plugin-permission.service';
import { RestrictedPluginContextService } from './restricted-plugin-context.service';
import { NetworkAccessService } from './network-access.service';
import { DatabaseAccessService } from './database-access.service';
import { PluginContextService } from './plugin-context.service';
import { FileAccessConfigService, FILE_ACCESS_CONFIG, DEFAULT_FILE_ACCESS_CONFIG } from './file-access.config';
import {
  PluginContextConfigService,
  GlobalPluginContextConfig,
  PLUGIN_CONTEXT_CONFIG,
  DEFAULT_GLOBAL_CONTEXT_CONFIG,
} from './plugin-context.config';

@Global()
@Module({})
export class ModuNestPluginContextModule {
  static forRoot(config?: Partial<GlobalPluginContextConfig>): DynamicModule {
    const pluginContextConfig = {
      ...DEFAULT_GLOBAL_CONTEXT_CONFIG,
      ...config,
    };

    // Legacy file access config for backward compatibility
    const fileAccessConfig = {
      ...DEFAULT_FILE_ACCESS_CONFIG,
      defaultOptions: {
        ...DEFAULT_FILE_ACCESS_CONFIG.defaultOptions,
      },
    };

    return {
      module: ModuNestPluginContextModule,
      providers: [
        {
          provide: PLUGIN_CONTEXT_CONFIG,
          useValue: pluginContextConfig,
        },
        {
          provide: FILE_ACCESS_CONFIG,
          useValue: fileAccessConfig,
        },
        PluginContextConfigService,
        FileAccessConfigService,
        FileAccessService,
        NetworkAccessService,
        DatabaseAccessService,
        PluginPermissionService,
        RestrictedPluginContextService,
        PluginContextService,
      ],
      exports: [
        PluginContextService,
        PluginContextConfigService,
        FileAccessService,
        NetworkAccessService,
        DatabaseAccessService,
        FileAccessConfigService,
        PluginPermissionService,
        RestrictedPluginContextService,
        PLUGIN_CONTEXT_CONFIG,
        FILE_ACCESS_CONFIG,
      ],
      global: false,
    };
  }

  static forRootAsync(options: {
    useFactory: (...args: any[]) => GlobalPluginContextConfig | Promise<GlobalPluginContextConfig>;
    inject?: any[];
    imports?: any[];
  }): DynamicModule {
    return {
      module: ModuNestPluginContextModule,
      imports: options.imports || [],
      providers: [
        {
          provide: PLUGIN_CONTEXT_CONFIG,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        {
          provide: FILE_ACCESS_CONFIG,
          useValue: DEFAULT_FILE_ACCESS_CONFIG,
        },
        PluginContextConfigService,
        FileAccessConfigService,
        FileAccessService,
        NetworkAccessService,
        DatabaseAccessService,
        PluginPermissionService,
        RestrictedPluginContextService,
        PluginContextService,
      ],
      exports: [
        PluginContextService,
        PluginContextConfigService,
        FileAccessService,
        NetworkAccessService,
        DatabaseAccessService,
        FileAccessConfigService,
        PluginPermissionService,
        RestrictedPluginContextService,
        PLUGIN_CONTEXT_CONFIG,
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
          provide: PLUGIN_CONTEXT_CONFIG,
          useValue: DEFAULT_GLOBAL_CONTEXT_CONFIG,
        },
        {
          provide: FILE_ACCESS_CONFIG,
          useValue: DEFAULT_FILE_ACCESS_CONFIG,
        },
        PluginContextConfigService,
        FileAccessConfigService,
        FileAccessService,
        NetworkAccessService,
        DatabaseAccessService,
        PluginPermissionService,
        RestrictedPluginContextService,
        PluginContextService,
      ],
      exports: [
        PluginContextService,
        PluginContextConfigService,
        FileAccessService,
        NetworkAccessService,
        DatabaseAccessService,
        FileAccessConfigService,
        PluginPermissionService,
        RestrictedPluginContextService,
      ],
      global: false,
    };
  }
}
