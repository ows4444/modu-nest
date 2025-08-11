import { Injectable, Logger } from '@nestjs/common';
import { PluginManifest } from '@libs/plugin-types';
import { FileAccessService } from './file-access.service';
import { PluginPermissionService, PluginAccessContext } from './plugin-permission.service';

export interface PluginContextConfig {
  pluginName: string;
  manifest: PluginManifest;
  sandbox?: {
    enabled: boolean;
    restrictedModules?: string[];
    allowedGlobals?: string[];
  };
}

@Injectable()
export class RestrictedPluginContextService {
  private readonly logger = new Logger(RestrictedPluginContextService.name);
  private readonly pluginContexts = new Map<string, PluginContextConfig>();

  constructor(
    private readonly fileAccessService: FileAccessService,
    private readonly permissionService: PluginPermissionService
  ) {}

  createPluginContext(config: PluginContextConfig): PluginContextInterface {
    this.pluginContexts.set(config.pluginName, config);
    this.permissionService.registerPlugin(config.pluginName, config.manifest);

    this.logger.debug(`Created restricted context for plugin: ${config.pluginName}`);

    return {
      pluginName: config.pluginName,
      manifest: config.manifest,

      // File system access with manifest-based restrictions
      fileSystem: {
        readFile: async (filePath: string) => {
          this.validateFileOperation(config.pluginName, 'read', filePath);
          return await this.fileAccessService.readFile(filePath, config.pluginName);
        },

        writeFile: async (filePath: string, content: string) => {
          this.validateFileOperation(config.pluginName, 'write', filePath);
          return await this.fileAccessService.writeFile(filePath, content, config.pluginName);
        },

        deleteFile: async (filePath: string) => {
          this.validateFileOperation(config.pluginName, 'delete', filePath);
          return await this.fileAccessService.deleteFile(filePath, config.pluginName);
        },

        listFiles: async (dirPath: string) => {
          this.validateFileOperation(config.pluginName, 'list', dirPath);
          return await this.fileAccessService.listFiles(dirPath, config.pluginName);
        },

        fileExists: async (filePath: string) => {
          return await this.fileAccessService.fileExists(filePath, config.pluginName);
        },
      },

      // Service access with permissions
      services: {
        getService: <T>(serviceName: string): T => {
          this.validateServiceAccess(config.pluginName, serviceName);
          return this.getRestrictedService<T>(config.pluginName, serviceName);
        },

        hasServiceAccess: (serviceName: string): boolean => {
          const context: PluginAccessContext = {
            pluginName: config.pluginName,
            manifest: config.manifest,
            requestedPermission: `service:${serviceName}`,
          };
          const result = this.permissionService.validateServiceAccess(context);
          return result.granted;
        },
      },

      // Module access with restrictions
      modules: {
        importModule: async <T>(moduleName: string): Promise<T> => {
          this.validateModuleAccess(config.pluginName, moduleName);
          return await this.getRestrictedModule<T>(config.pluginName, moduleName);
        },

        hasModuleAccess: (moduleName: string): boolean => {
          const context: PluginAccessContext = {
            pluginName: config.pluginName,
            manifest: config.manifest,
            requestedPermission: `module:${moduleName}`,
          };
          const result = this.permissionService.validateModuleAccess(context);
          return result.granted;
        },
      },

      // Logger with plugin context
      logger: {
        log: (message: string, context?: string) => {
          this.logger.log(`[${config.pluginName}] ${message}`, context);
        },
        error: (message: string, trace?: string, context?: string) => {
          this.logger.error(`[${config.pluginName}] ${message}`, trace, context);
        },
        warn: (message: string, context?: string) => {
          this.logger.warn(`[${config.pluginName}] ${message}`, context);
        },
        debug: (message: string, context?: string) => {
          this.logger.debug(`[${config.pluginName}] ${message}`, context);
        },
        verbose: (message: string, context?: string) => {
          this.logger.verbose(`[${config.pluginName}] ${message}`, context);
        },
      },

      // Configuration access
      config: {
        get: <T>(key: string): T | undefined => {
          return config.manifest.config?.[key] as T;
        },

        has: (key: string): boolean => {
          return key in (config.manifest.config || {});
        },

        getAll: () => {
          return config.manifest.config || {};
        },
      },
    };
  }

  private validateFileOperation(
    pluginName: string,
    operation: 'read' | 'write' | 'delete' | 'list',
    resourcePath?: string
  ): void {
    const context: PluginAccessContext = {
      pluginName,
      manifest: this.pluginContexts.get(pluginName)!.manifest,
      requestedPermission: `file:${operation}`,
      resourcePath,
      operation,
    };

    this.permissionService.enforcePermission(context);
  }

  private validateServiceAccess(pluginName: string, serviceName: string): void {
    const context: PluginAccessContext = {
      pluginName,
      manifest: this.pluginContexts.get(pluginName)!.manifest,
      requestedPermission: `service:${serviceName}`,
    };

    this.permissionService.enforcePermission(context);
  }

  private validateModuleAccess(pluginName: string, moduleName: string): void {
    const context: PluginAccessContext = {
      pluginName,
      manifest: this.pluginContexts.get(pluginName)!.manifest,
      requestedPermission: `module:${moduleName}`,
    };

    this.permissionService.enforcePermission(context);
  }

  private getRestrictedService<T>(pluginName: string, serviceName: string): T {
    // Implementation would depend on your DI container
    // This is a placeholder for service resolution with restrictions
    throw new Error(`Service resolution not implemented: ${serviceName}`);
  }

  private async getRestrictedModule<T>(pluginName: string, moduleName: string): Promise<T> {
    // Implementation would depend on your module loading strategy
    // This is a placeholder for restricted module loading
    throw new Error(`Module loading not implemented: ${moduleName}`);
  }

  removePluginContext(pluginName: string): void {
    this.pluginContexts.delete(pluginName);
    this.permissionService.unregisterPlugin(pluginName);
    this.logger.debug(`Removed context for plugin: ${pluginName}`);
  }
}

export interface PluginContextInterface {
  readonly pluginName: string;
  readonly manifest: PluginManifest;

  fileSystem: {
    readFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<void>;
    deleteFile(filePath: string): Promise<void>;
    listFiles(dirPath: string): Promise<string[]>;
    fileExists(filePath: string): Promise<boolean>;
  };

  services: {
    getService<T>(serviceName: string): T;
    hasServiceAccess(serviceName: string): boolean;
  };

  modules: {
    importModule<T>(moduleName: string): Promise<T>;
    hasModuleAccess(moduleName: string): boolean;
  };

  logger: {
    log(message: string, context?: string): void;
    error(message: string, trace?: string, context?: string): void;
    warn(message: string, context?: string): void;
    debug(message: string, context?: string): void;
    verbose(message: string, context?: string): void;
  };

  config: {
    get<T>(key: string): T | undefined;
    has(key: string): boolean;
    getAll(): Record<string, any>;
  };
}
