import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import JSZip from 'jszip';
import { PluginValidator } from '@modu-nest/plugin-types';
import { CreatePluginDto } from '@modu-nest/plugin-types';
import { PluginValidationCacheService } from './plugin-validation-cache.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePluginValidationDto } from '../dto/plugin.dto';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class PluginValidationService {
  private readonly logger = new Logger(PluginValidationService.name);

  constructor(private readonly validationCacheService: PluginValidationCacheService) {}

  /**
   * Extract and validate plugin manifest from ZIP buffer
   */
  async extractAndValidateManifest(pluginBuffer: Buffer): Promise<CreatePluginDto> {
    const manifest = await this.extractManifestFromZip(pluginBuffer);
    
    // Validate manifest with class-validator
    const validationErrors = await validate(plainToInstance(CreatePluginValidationDto, manifest));
    if (validationErrors.length > 0) {
      const errorMessages = validationErrors
        .map((error) => Object.values(error.constraints || {}))
        .flat()
        .join(', ');
      throw new BadRequestException(`Invalid plugin manifest: ${errorMessages}`);
    }

    return manifest;
  }

  /**
   * Validate plugin manifest with caching support
   */
  async validateManifestWithCache(manifest: CreatePluginDto, checksum: string): Promise<ValidationResult> {
    // Check cache first
    const cachedResult = this.validationCacheService.getCachedValidation(checksum, 'manifest');
    if (cachedResult) {
      this.logger.debug(`Using cached manifest validation for checksum: ${checksum.substring(0, 8)}...`);
      return cachedResult;
    }

    // Perform validation
    const validationResult = PluginValidator.validateManifest(manifest);

    // Cache the result
    this.validationCacheService.setCachedValidation(checksum, validationResult, 'manifest');

    return validationResult;
  }

  /**
   * Validate plugin structure with caching support
   */
  async validatePluginStructureWithCache(pluginBuffer: Buffer, checksum: string): Promise<void> {
    // Check cache first
    const cachedResult = this.validationCacheService.getCachedValidation(checksum, 'structure');
    if (cachedResult) {
      this.logger.debug(`Using cached structure validation for checksum: ${checksum.substring(0, 8)}...`);
      if (!cachedResult.isValid) {
        throw new BadRequestException(`Invalid plugin structure: ${cachedResult.errors.join(', ')}`);
      }
      if (cachedResult.warnings.length > 0) {
        this.logger.warn(`Plugin structure warnings: ${cachedResult.warnings.join(', ')}`);
      }
      return;
    }

    // Perform validation
    try {
      await this.validatePluginStructure(pluginBuffer);

      // Cache successful result
      const successResult = { isValid: true, errors: [], warnings: [] };
      this.validationCacheService.setCachedValidation(checksum, successResult, 'structure');
    } catch (error) {
      // Cache failed result
      if (error instanceof BadRequestException) {
        const failedResult = {
          isValid: false,
          errors: [error.message.replace('Invalid plugin structure: ', '')],
          warnings: [],
        };
        this.validationCacheService.setCachedValidation(checksum, failedResult, 'structure');
      }
      throw error;
    }
  }

  /**
   * Get validation cache statistics
   */
  getValidationCacheStats(): any {
    return this.validationCacheService.getCacheStats();
  }

  /**
   * Clear validation cache
   */
  clearValidationCache(): void {
    this.validationCacheService.clearCache();
    this.logger.log('Validation cache cleared');
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
}