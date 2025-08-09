import { Injectable, Inject } from '@nestjs/common';
import { FileAccessPermissions } from '@modu-nest/plugin-types';

export const FILE_ACCESS_CONFIG = Symbol('FILE_ACCESS_CONFIG');
export const FILE_ACCESS_SERVICE_OPTIONS = Symbol('FILE_ACCESS_SERVICE_OPTIONS');

export interface FileAccessServiceOptions {
  allowedExtensions?: string[];
  maxFileSize?: number;
  allowedPaths?: string[];
  blockedPaths?: string[];
}

export interface FileAccessConfig {
  defaultOptions: FileAccessServiceOptions;
  enablePluginConfiguration?: boolean;
}

export const DEFAULT_FILE_ACCESS_CONFIG: FileAccessConfig = {
  defaultOptions: {
    allowedExtensions: ['.json', '.txt', '.md', '.js', '.ts'],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedPaths: ['./plugins', './temp', './uploads'],
    blockedPaths: ['/etc', '/usr', '/bin', '/sbin', '/var', '/boot', '/root', '/home'],
  },
  enablePluginConfiguration: true,
};

@Injectable()
export class FileAccessConfigService {
  constructor(
    @Inject(FILE_ACCESS_CONFIG) private readonly config: FileAccessConfig
  ) {}

  getDefaultOptions(): FileAccessServiceOptions {
    return { ...this.config.defaultOptions };
  }

  isPluginConfigurationEnabled(): boolean {
    return this.config.enablePluginConfiguration ?? true;
  }

  validatePluginPermissions(permissions: FileAccessPermissions): boolean {
    // Basic validation - can be extended
    return (
      !permissions.maxFileSize || 
      permissions.maxFileSize <= (this.config.defaultOptions.maxFileSize || 10 * 1024 * 1024)
    );
  }
}