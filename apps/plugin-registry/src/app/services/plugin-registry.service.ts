import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import crypto from 'crypto';
import JSZip from 'jszip';
import { PluginValidator, PluginResponseDto } from '@modu-nest/plugin-types';
import { PluginMetadata, CreatePluginDto, RegistryStats, PluginListResponseDto } from '@modu-nest/plugin-types';
import { PluginStorageService } from './plugin-storage.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePluginValidationDto } from '../dto/plugin.dto';

@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);

  constructor(private readonly storageService: PluginStorageService) {}

  async uploadPlugin(pluginBuffer: Buffer): Promise<PluginMetadata> {
    const extractedManifest: CreatePluginDto = await this.extractManifestFromZip(pluginBuffer);

    // Validate manifest with class-validator
    const validationErrors = await validate(plainToInstance(CreatePluginValidationDto, extractedManifest));
    if (validationErrors.length > 0) {
      const errorMessages = validationErrors
        .map((error) => Object.values(error.constraints || {}))
        .flat()
        .join(', ');
      throw new BadRequestException(`Invalid plugin manifest: ${errorMessages}`);
    }

    // Validate manifest
    const validationResult = PluginValidator.validateManifest(extractedManifest);
    if (!validationResult.isValid) {
      throw new BadRequestException(`Invalid plugin manifest: ${validationResult.errors.join(', ')}`);
    }

    // Log warnings if any
    if (validationResult.warnings.length > 0) {
      this.logger.warn(`Plugin validation warnings: ${validationResult.warnings.join(', ')}`);
    }

    // Check if plugin already exists with same version
    if (await this.storageService.pluginExists(extractedManifest.name, extractedManifest.version)) {
      throw new ConflictException(
        `Plugin ${extractedManifest.name} version ${extractedManifest.version} already exists`
      );
    }

    // Validate ZIP structure
    await this.validatePluginStructure(pluginBuffer);

    // Create metadata
    const checksum = crypto.createHash('sha256').update(new Uint8Array(pluginBuffer)).digest('hex');
    const metadata: PluginMetadata = {
      ...extractedManifest,
      uploadedAt: new Date().toISOString(),
      fileSize: pluginBuffer.length,
      checksum,
    };

    // Store plugin
    await this.storageService.storePlugin(metadata, pluginBuffer);

    this.logger.log(`Plugin ${metadata.name} v${metadata.version} uploaded successfully`);
    return metadata;
  }

  private async extractManifestFromZip(pluginBuffer: Buffer): Promise<CreatePluginDto> {
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(pluginBuffer.buffer as ArrayBuffer);
      const manifestFile = contents.file('plugin.manifest.json');
      if (!manifestFile) {
        throw new BadRequestException('Plugin manifest not found in uploaded file');
      }
      const manifestContent = await manifestFile.async('text');
      return JSON.parse(manifestContent);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Invalid plugin file or manifest format');
    }
  }

  private async validatePluginStructure(pluginBuffer: Buffer): Promise<void> {
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(pluginBuffer.buffer as ArrayBuffer);
      const files = Object.keys(contents.files);
      const validationResult = PluginValidator.validatePluginStructure(files);
      if (!validationResult.isValid) {
        throw new BadRequestException(`Invalid plugin structure: ${validationResult.errors.join(', ')}`);
      }

      if (validationResult.warnings.length > 0) {
        this.logger.warn(`Plugin structure warnings: ${validationResult.warnings.join(', ')}`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Failed to validate plugin structure');
    }
  }

  async listPlugins(page?: number, limit?: number): Promise<PluginListResponseDto> {
    const allPlugins = await this.storageService.getAllPlugins();
    const total = allPlugins.length;

    let plugins = allPlugins.map((p) => this.mapToResponseDto(p.metadata));

    // Apply pagination if specified
    if (page !== undefined && limit !== undefined) {
      const startIndex = (page - 1) * limit;
      plugins = plugins.slice(startIndex, startIndex + limit);
    }

    return {
      plugins,
      total,
      ...(page !== undefined && { page }),
      ...(limit !== undefined && { limit }),
    };
  }

  async getPlugin(name: string): Promise<PluginResponseDto> {
    const plugin = await this.storageService.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin ${name} not found`);
    }

    return this.mapToResponseDto(plugin.metadata);
  }

  async downloadPlugin(name: string): Promise<{
    buffer: Buffer;
    metadata: PluginMetadata;
  }> {
    const plugin = await this.storageService.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin ${name} not found`);
    }

    const buffer = await this.storageService.getPluginBuffer(name);
    return {
      buffer,
      metadata: plugin.metadata,
    };
  }

  async deletePlugin(name: string): Promise<void> {
    const plugin = await this.storageService.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin ${name} not found`);
    }

    await this.storageService.deletePlugin(name);
    this.logger.log(`Plugin ${name} deleted successfully`);
  }

  async getRegistryStats(): Promise<RegistryStats> {
    const stats = this.storageService.getStorageStats();
    return {
      ...stats,
      uptime: process.uptime().toString(),
    };
  }

  private mapToResponseDto(metadata: PluginMetadata): PluginResponseDto {
    return {
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
      author: metadata.author,
      license: metadata.license,
      dependencies: metadata.dependencies,
      loadOrder: metadata.loadOrder,
      compatibilityVersion: metadata.compatibilityVersion,
      routes: metadata.routes,
      configuration: metadata.configuration,
      uploadedAt: metadata.uploadedAt,
      fileSize: metadata.fileSize,
      checksum: metadata.checksum,
    };
  }
}
