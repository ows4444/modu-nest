import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { FileAccessPermissions } from '@plugin/core';
import { FileAccessConfigService, FileAccessServiceOptions } from './file-access.config';

export interface PluginFileAccessConfig extends FileAccessPermissions {
  pluginName: string;
}

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  normalizedPath?: string;
}

@Injectable()
export class FileAccessService {
  private readonly defaultOptions: FileAccessServiceOptions;
  private readonly pluginConfigurations = new Map<string, PluginFileAccessConfig>();

  constructor(private readonly configService: FileAccessConfigService) {
    this.defaultOptions = this.configService.getDefaultOptions();
    console.log(`FileAccessService initialized with default options: ${JSON.stringify(this.defaultOptions)}`);
  }

  configurePlugin(pluginName: string, permissions: FileAccessPermissions): void {
    if (!this.configService.isPluginConfigurationEnabled()) {
      throw new ForbiddenException('Plugin configuration is disabled');
    }

    if (!this.configService.validatePluginPermissions(permissions)) {
      throw new BadRequestException(`Invalid permissions for plugin ${pluginName}`);
    }

    this.pluginConfigurations.set(pluginName, {
      pluginName,
      ...permissions,
    });
  }

  removePluginConfiguration(pluginName: string): void {
    this.pluginConfigurations.delete(pluginName);
  }

  private getPluginConfig(pluginName?: string): FileAccessServiceOptions & Partial<FileAccessPermissions> {
    if (!pluginName) {
      return this.defaultOptions;
    }

    const pluginConfig = this.pluginConfigurations.get(pluginName);
    if (!pluginConfig) {
      return this.defaultOptions;
    }

    return {
      allowedExtensions: pluginConfig.allowedExtensions || this.defaultOptions.allowedExtensions,
      maxFileSize: pluginConfig.maxFileSize || this.defaultOptions.maxFileSize,
      canRead: pluginConfig.canRead,
      canWrite: pluginConfig.canWrite,
      canDelete: pluginConfig.canDelete,
      canList: pluginConfig.canList,
    };
  }

  validateFilePath(filePath: string, pluginName?: string): FileValidationResult {
    const config = this.getPluginConfig(pluginName);

    try {
      const normalizedPath = path.normalize(filePath);

      // Check for path traversal attempts
      if (normalizedPath.includes('..')) {
        return {
          isValid: false,
          error: 'Path traversal detected',
        };
      }

      // Check against blocked paths
      const absolutePath = path.resolve(normalizedPath);

      // Check file extension
      const ext = path.extname(normalizedPath).toLowerCase();
      if (config.allowedExtensions?.length && !config.allowedExtensions.includes(ext)) {
        return {
          isValid: false,
          error: `File extension ${ext} not allowed`,
        };
      }

      return {
        isValid: true,
        normalizedPath: absolutePath,
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Invalid path: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async validateFileSize(filePath: string, pluginName?: string): Promise<boolean> {
    const config = this.getPluginConfig(pluginName);
    try {
      const stats = await fs.stat(filePath);
      return stats.size <= (config.maxFileSize || this.defaultOptions.maxFileSize!);
    } catch {
      return false;
    }
  }

  async readFile(filePath: string, pluginName?: string): Promise<string> {
    const config = this.getPluginConfig(pluginName);

    // Check if plugin has read permission
    if (config.canRead === false) {
      throw new ForbiddenException(`Read access denied for plugin ${pluginName}`);
    }

    const validation = this.validateFilePath(filePath, pluginName);
    if (!validation.isValid) {
      throw new ForbiddenException(
        `File access denied${pluginName ? ` for plugin ${pluginName}` : ''}: ${validation.error}`
      );
    }

    const sizeValid = await this.validateFileSize(validation.normalizedPath!, pluginName);
    if (!sizeValid) {
      throw new BadRequestException(`File too large${pluginName ? ` for plugin ${pluginName}` : ''}`);
    }

    try {
      return await fs.readFile(validation.normalizedPath!, 'utf8');
    } catch (error) {
      throw new BadRequestException(
        `Failed to read file${pluginName ? ` for plugin ${pluginName}` : ''}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async writeFile(filePath: string, content: string, pluginName?: string): Promise<void> {
    const config = this.getPluginConfig(pluginName);

    // Check if plugin has write permission
    if (config.canWrite === false) {
      throw new ForbiddenException(`Write access denied for plugin ${pluginName}`);
    }

    const validation = this.validateFilePath(filePath, pluginName);
    if (!validation.isValid) {
      throw new ForbiddenException(
        `File write denied${pluginName ? ` for plugin ${pluginName}` : ''}: ${validation.error}`
      );
    }

    if (Buffer.byteLength(content, 'utf8') > (config.maxFileSize || this.defaultOptions.maxFileSize!)) {
      throw new BadRequestException(`Content too large${pluginName ? ` for plugin ${pluginName}` : ''}`);
    }

    try {
      await fs.mkdir(path.dirname(validation.normalizedPath!), {
        recursive: true,
      });
      await fs.writeFile(validation.normalizedPath!, content, 'utf8');
    } catch (error) {
      throw new BadRequestException(
        `Failed to write file${pluginName ? ` for plugin ${pluginName}` : ''}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async deleteFile(filePath: string, pluginName?: string): Promise<void> {
    const config = this.getPluginConfig(pluginName);

    // Check if plugin has delete permission
    if (config.canDelete === false) {
      throw new ForbiddenException(`Delete access denied for plugin ${pluginName}`);
    }

    const validation = this.validateFilePath(filePath, pluginName);
    if (!validation.isValid) {
      throw new ForbiddenException(
        `File deletion denied${pluginName ? ` for plugin ${pluginName}` : ''}: ${validation.error}`
      );
    }

    try {
      await fs.unlink(validation.normalizedPath!);
    } catch (error) {
      throw new BadRequestException(
        `Failed to delete file${pluginName ? ` for plugin ${pluginName}` : ''}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async fileExists(filePath: string, pluginName?: string): Promise<boolean> {
    const validation = this.validateFilePath(filePath, pluginName);
    if (!validation.isValid) {
      return false;
    }

    try {
      await fs.access(validation.normalizedPath!);
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(dirPath: string, pluginName?: string): Promise<string[]> {
    const config = this.getPluginConfig(pluginName);

    // Check if plugin has list permission
    if (config.canList === false) {
      throw new ForbiddenException(`List access denied for plugin ${pluginName}`);
    }

    const validation = this.validateFilePath(dirPath, pluginName);
    if (!validation.isValid) {
      throw new ForbiddenException(
        `Directory access denied${pluginName ? ` for plugin ${pluginName}` : ''}: ${validation.error}`
      );
    }

    try {
      const files = await fs.readdir(validation.normalizedPath!);
      return files.filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return !config.allowedExtensions?.length || config.allowedExtensions.includes(ext);
      });
    } catch (error) {
      throw new BadRequestException(
        `Failed to list files${pluginName ? ` for plugin ${pluginName}` : ''}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
