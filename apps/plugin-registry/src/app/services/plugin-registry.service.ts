import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import crypto from 'crypto';
import JSZip from 'jszip';
import { PluginValidator, PluginResponseDto } from '@modu-nest/plugin-types';
import { PluginMetadata, CreatePluginDto, RegistryStats, PluginListResponseDto } from '@modu-nest/plugin-types';
import { PluginStorageService } from './plugin-storage.service';
import { PluginValidationCacheService } from './plugin-validation-cache.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePluginValidationDto } from '../dto/plugin.dto';

@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);

  // Security configuration - can be moved to environment variables if needed
  private readonly SECURITY_CONFIG = {
    REGEX_TIMEOUT_MS: parseInt(process.env.PLUGIN_REGEX_TIMEOUT_MS || '5000', 10),
    MAX_CONTENT_SIZE: parseInt(process.env.PLUGIN_MAX_CONTENT_SIZE || '1048576', 10), // 1MB
    MAX_ITERATIONS: parseInt(process.env.PLUGIN_MAX_ITERATIONS || '10000', 10),
    MAX_FILE_SIZE: parseInt(process.env.PLUGIN_MAX_FILE_SIZE || '52428800', 10), // 50MB
  };

  constructor(
    private readonly storageService: PluginStorageService,
    private readonly validationCacheService: PluginValidationCacheService
  ) {
    this.logger.log(
      `Security configuration loaded: timeout=${this.SECURITY_CONFIG.REGEX_TIMEOUT_MS}ms, maxContentSize=${this.SECURITY_CONFIG.MAX_CONTENT_SIZE} bytes`
    );
  }

  async uploadPlugin(pluginBuffer: Buffer): Promise<PluginMetadata> {
    // Security: Check file size before processing to prevent DoS attacks
    if (pluginBuffer.length > this.SECURITY_CONFIG.MAX_FILE_SIZE) {
      throw new BadRequestException(
        `Plugin file size (${pluginBuffer.length} bytes) exceeds maximum allowed size (${this.SECURITY_CONFIG.MAX_FILE_SIZE} bytes)`
      );
    }

    // Calculate checksum early for caching
    const checksum = crypto.createHash('sha256').update(new Uint8Array(pluginBuffer)).digest('hex');
    this.logger.debug(`Processing plugin with checksum: ${checksum.substring(0, 8)}...`);

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

    // Validate manifest using cache
    const manifestValidationResult = await this.validateManifestWithCache(extractedManifest, checksum);
    if (!manifestValidationResult.isValid) {
      throw new BadRequestException(`Invalid plugin manifest: ${manifestValidationResult.errors.join(', ')}`);
    }

    // Log warnings if any
    if (manifestValidationResult.warnings.length > 0) {
      this.logger.warn(`Plugin validation warnings: ${manifestValidationResult.warnings.join(', ')}`);
    }

    // Check if plugin already exists with same version
    if (await this.storageService.pluginExists(extractedManifest.name, extractedManifest.version)) {
      throw new ConflictException(
        `Plugin ${extractedManifest.name} version ${extractedManifest.version} already exists`
      );
    }

    // Validate ZIP structure using cache
    await this.validatePluginStructureWithCache(pluginBuffer, checksum);

    // Perform security validation using cache
    await this.validatePluginSecurityWithCache(pluginBuffer, checksum);

    // Create metadata
    const metadata: PluginMetadata = {
      ...extractedManifest,
      uploadedAt: new Date().toISOString(),
      fileSize: pluginBuffer.length,
      checksum,
    };

    // Store plugin
    await this.storageService.storePlugin(metadata, pluginBuffer);

    this.logger.log(
      `Plugin ${metadata.name} v${metadata.version} uploaded successfully (checksum: ${checksum.substring(0, 8)}...)`
    );
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

  private async validatePluginSecurity(pluginBuffer: Buffer): Promise<void> {
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(pluginBuffer.buffer as ArrayBuffer);

      const unsafeResults: { file: string; imports: string[] }[] = [];

      // Check all TypeScript and JavaScript files for unsafe imports
      for (const [filePath, file] of Object.entries(contents.files)) {
        if (!file.dir && (filePath.endsWith('.ts') || filePath.endsWith('.js'))) {
          const content = await file.async('text');
          const unsafeImports = this.scanForUnsafeImports(content);

          if (unsafeImports.length > 0) {
            unsafeResults.push({
              file: filePath,
              imports: unsafeImports,
            });
          }
        }
      }

      if (unsafeResults.length > 0) {
        const errorMessages = ['Security validation failed - unsafe imports detected:'];
        for (const result of unsafeResults) {
          errorMessages.push(`   ${result.file}: ${result.imports.join(', ')}`);
        }
        errorMessages.push('   Plugins are not allowed to use Node.js system modules for security reasons.');
        errorMessages.push('   Please remove these imports and use NestJS/framework provided alternatives.');

        throw new BadRequestException(errorMessages.join('\n'));
      }

      this.logger.log('Security validation passed - no unsafe imports found');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Failed to validate plugin security');
    }
  }

  // Security: List of unsafe modules that plugins should not use
  private readonly UNSAFE_MODULES = [
    'fs',
    'fs/promises',
    'node:fs',
    'node:fs/promises',
    'child_process',
    'node:child_process',
    'process',
    'node:process',
    'os',
    'node:os',
    'path',
    'node:path',
    'crypto',
    'node:crypto',
    'net',
    'node:net',
    'http',
    'node:http',
    'https',
    'node:https',
    'url',
    'node:url',
    'stream',
    'node:stream',
    'events',
    'node:events',
    'util',
    'node:util',
    'cluster',
    'node:cluster',
    'worker_threads',
    'node:worker_threads',
  ];

  private scanForUnsafeImports(content: string): string[] {
    const unsafeImports: string[] = [];
    const startTime = Date.now();

    // Check content size to prevent excessive memory usage
    if (content.length > this.SECURITY_CONFIG.MAX_CONTENT_SIZE) {
      this.logger.warn(
        `File content exceeds maximum size (${this.SECURITY_CONFIG.MAX_CONTENT_SIZE} bytes) - truncating for security scan`
      );
      content = content.substring(0, this.SECURITY_CONFIG.MAX_CONTENT_SIZE);
    }

    // Security: Use safer regex with timeout protection to prevent ReDoS attacks
    const importRegex = /(?:import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g;
    let match;
    let iterationCount = 0;

    try {
      while ((match = importRegex.exec(content)) !== null) {
        // Check timeout - prevent ReDoS attacks
        if (Date.now() - startTime > this.SECURITY_CONFIG.REGEX_TIMEOUT_MS) {
          this.logger.warn(
            `Import scanning timeout after ${this.SECURITY_CONFIG.REGEX_TIMEOUT_MS}ms - file may be malicious or too complex`
          );
          throw new BadRequestException('File too complex to analyze - security scan timeout');
        }

        // Check iteration count to prevent excessive processing
        if (++iterationCount > this.SECURITY_CONFIG.MAX_ITERATIONS) {
          this.logger.warn(
            `Import scanning exceeded maximum iterations (${this.SECURITY_CONFIG.MAX_ITERATIONS}) - file may be malicious`
          );
          throw new BadRequestException('File too complex to analyze - excessive import statements');
        }

        const moduleName = match[1] || match[2];
        if (moduleName && this.UNSAFE_MODULES.includes(moduleName)) {
          unsafeImports.push(moduleName);
        }

        // Prevent infinite loops with global regex by advancing lastIndex
        if (importRegex.lastIndex === match.index) {
          importRegex.lastIndex++;
        }
      }
    } catch (error) {
      // Re-throw BadRequestException errors (timeout/complexity)
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle other regex errors gracefully
      this.logger.error('Error during import scanning:', error);
      throw new BadRequestException('Failed to analyze file imports - file may be corrupted or malicious');
    }

    const scanDuration = Date.now() - startTime;
    this.logger.debug(
      `Import scanning completed in ${scanDuration}ms, found ${unsafeImports.length} unsafe imports in ${iterationCount} iterations`
    );

    return [...new Set(unsafeImports)]; // Remove duplicates
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

  async downloadPlugin(
    name: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{
    buffer: Buffer;
    metadata: PluginMetadata;
  }> {
    const plugin = await this.storageService.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin ${name} not found`);
    }

    // Record download in database
    await this.storageService.recordDownload(name, userAgent, ipAddress);

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

  /**
   * Get detailed registry statistics including database metrics
   */
  async getDetailedRegistryStats() {
    const detailedStats = await this.storageService.getDetailedStorageStats();
    return {
      ...detailedStats,
      uptime: process.uptime().toString(),
      validation: this.getValidationCacheStats(),
      security: this.getSecurityStats(),
    };
  }

  /**
   * Search plugins by query
   */
  async searchPlugins(query: string): Promise<PluginResponseDto[]> {
    const plugins = await this.storageService.searchPlugins(query);
    return plugins.map((p) => this.mapToResponseDto(p.metadata));
  }

  /**
   * Get database service for advanced operations
   */
  getDatabaseService() {
    return this.storageService.getDatabaseService();
  }

  /**
   * Get security configuration and statistics
   */
  getSecurityStats(): {
    configuration: {
      REGEX_TIMEOUT_MS: number;
      MAX_CONTENT_SIZE: number;
      MAX_ITERATIONS: number;
      MAX_FILE_SIZE: number;
    };
    unsafeModulesCount: number;
    unsafeModules: string[];
  } {
    return {
      configuration: { ...this.SECURITY_CONFIG },
      unsafeModulesCount: this.UNSAFE_MODULES.length,
      unsafeModules: [...this.UNSAFE_MODULES],
    };
  }

  /**
   * Get validation cache statistics
   */
  getValidationCacheStats() {
    return this.validationCacheService.getCacheStats();
  }

  /**
   * Clear validation cache
   */
  clearValidationCache(): void {
    this.validationCacheService.clearCache();
    this.logger.log('Validation cache cleared');
  }

  /**
   * Validate manifest with caching support
   */
  private async validateManifestWithCache(manifest: CreatePluginDto, checksum: string) {
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
  private async validatePluginStructureWithCache(pluginBuffer: Buffer, checksum: string): Promise<void> {
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

    // Perform validation (delegate to existing method)
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
   * Validate plugin security with caching support
   */
  private async validatePluginSecurityWithCache(pluginBuffer: Buffer, checksum: string): Promise<void> {
    // Check cache first
    const cachedResult = this.validationCacheService.getCachedValidation(checksum, 'security');
    if (cachedResult) {
      this.logger.debug(`Using cached security validation for checksum: ${checksum.substring(0, 8)}...`);
      if (!cachedResult.isValid) {
        throw new BadRequestException(cachedResult.errors.join('\n'));
      }
      if (cachedResult.warnings.length > 0) {
        this.logger.warn(`Plugin security warnings: ${cachedResult.warnings.join(', ')}`);
      }
      this.logger.log('Security validation passed - cached result');
      return;
    }

    // Perform validation (delegate to existing method)
    try {
      await this.validatePluginSecurity(pluginBuffer);

      // Cache successful result
      const successResult = { isValid: true, errors: [], warnings: [] };
      this.validationCacheService.setCachedValidation(checksum, successResult, 'security');
    } catch (error) {
      // Cache failed result
      if (error instanceof BadRequestException) {
        const failedResult = {
          isValid: false,
          errors: [error.message],
          warnings: [],
        };
        this.validationCacheService.setCachedValidation(checksum, failedResult, 'security');
      }
      throw error;
    }
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
      module: metadata.module,
      uploadedAt: metadata.uploadedAt,
      fileSize: metadata.fileSize,
      checksum: metadata.checksum,
    };
  }
}
