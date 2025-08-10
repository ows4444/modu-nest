import { Provider, Scope } from '@nestjs/common';
import { FileAccessService } from './file-access.service';
import { FileAccessConfigService, FileAccessConfig } from './file-access.config';

export const FILE_ACCESS_SERVICE_PLUGIN_SCOPED = Symbol('FILE_ACCESS_SERVICE_PLUGIN_SCOPED');
export const FILE_ACCESS_SERVICE_GLOBAL = Symbol('FILE_ACCESS_SERVICE_GLOBAL');
export const FILE_ACCESS_SERVICE_RESTRICTED = Symbol('FILE_ACCESS_SERVICE_RESTRICTED');

// Plugin-scoped service (creates new instance per plugin)
export const createPluginScopedFileAccessProvider = (): Provider => ({
  provide: FILE_ACCESS_SERVICE_PLUGIN_SCOPED,
  useFactory: (configService: FileAccessConfigService) => {
    return new FileAccessService(configService);
  },
  inject: [FileAccessConfigService],
  scope: Scope.TRANSIENT,
});

// Global service (singleton)
export const createGlobalFileAccessProvider = (): Provider => ({
  provide: FILE_ACCESS_SERVICE_GLOBAL,
  useFactory: (configService: FileAccessConfigService) => {
    return new FileAccessService(configService);
  },
  inject: [FileAccessConfigService],
  scope: Scope.DEFAULT,
});

// Restricted access service
export const createRestrictedFileAccessProvider = (): Provider => ({
  provide: FILE_ACCESS_SERVICE_RESTRICTED,
  useFactory: () => {
    const restrictedConfig: FileAccessConfig = {
      defaultOptions: {
        allowedExtensions: ['.json', '.txt'],
        maxFileSize: 1 * 1024 * 1024, // 1MB
      },
      enablePluginConfiguration: false,
    };

    const restrictedConfigService = new FileAccessConfigService(restrictedConfig);
    return new FileAccessService(restrictedConfigService);
  },
  scope: Scope.DEFAULT,
});

// Factory for creating plugin-specific services
export interface PluginFileAccessServiceFactory {
  createForPlugin(pluginName: string, config?: Partial<FileAccessConfig>): FileAccessService;
}

export const PLUGIN_FILE_ACCESS_SERVICE_FACTORY = Symbol('PLUGIN_FILE_ACCESS_SERVICE_FACTORY');

export const createPluginFileAccessServiceFactory = (): Provider => ({
  provide: PLUGIN_FILE_ACCESS_SERVICE_FACTORY,
  useFactory: (baseConfigService: FileAccessConfigService): PluginFileAccessServiceFactory => {
    const createdServices = new Map<string, FileAccessService>();

    return {
      createForPlugin(pluginName: string, config?: Partial<FileAccessConfig>): FileAccessService {
        if (createdServices.has(pluginName)) {
          return createdServices.get(pluginName)!;
        }

        let configService: FileAccessConfigService;

        if (config) {
          const pluginConfig: FileAccessConfig = {
            ...baseConfigService.getDefaultOptions(),
            ...config,
            defaultOptions: {
              ...baseConfigService.getDefaultOptions(),
              ...config.defaultOptions,
            },
          };
          configService = new FileAccessConfigService(pluginConfig);
        } else {
          configService = baseConfigService;
        }

        const service = new FileAccessService(configService);
        createdServices.set(pluginName, service);
        return service;
      },
    };
  },
  inject: [FileAccessConfigService],
  scope: Scope.DEFAULT,
});

// Utility providers for common configurations
export const FILE_ACCESS_PROVIDERS = {
  pluginScoped: createPluginScopedFileAccessProvider(),
  global: createGlobalFileAccessProvider(),
  restricted: createRestrictedFileAccessProvider(),
  factory: createPluginFileAccessServiceFactory(),
};

// Helper function to create custom providers
export function createCustomFileAccessProvider(
  token: string | symbol,
  config: FileAccessConfig,
  scope: Scope = Scope.DEFAULT
): Provider {
  return {
    provide: token,
    useFactory: () => {
      const configService = new FileAccessConfigService(config);
      return new FileAccessService(configService);
    },
    scope,
  };
}
