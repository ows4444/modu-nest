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

    // Perform security validation
    await this.validatePluginSecurity(pluginBuffer);

    // Validate plugin structure and files
    await this.validatePluginFiles(pluginBuffer, extractedManifest.name);

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

  private async validatePluginFiles(pluginBuffer: Buffer, pluginName: string): Promise<void> {
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(pluginBuffer.buffer as ArrayBuffer);
      const files = Object.keys(contents.files);
      
      const errors: string[] = [];
      
      // Check for required src/index.ts
      const hasIndexTs = files.some(f => f === 'src/index.ts' || f === 'index.ts');
      if (!hasIndexTs) {
        errors.push('Missing required file: src/index.ts');
      }
      
      // Check for lib directory structure (new Nx pattern) or flat structure
      const hasLibDir = files.some(f => f.startsWith('src/lib/'));
      
      if (hasLibDir) {
        // New lib structure validation
        const expectedFiles = [
          `src/lib/${pluginName}.module.ts`,
          `src/lib/${pluginName}.service.ts`,
          `src/lib/${pluginName}.controller.ts`,
        ];
        
        for (const expectedFile of expectedFiles) {
          if (!files.includes(expectedFile)) {
            errors.push(`Missing required file: ${expectedFile}`);
          }
        }
        
        // Validate module exports for lib structure
        const indexFile = contents.file('src/index.ts');
        if (indexFile) {
          const indexContent = await indexFile.async('text');
          const moduleExportPattern = new RegExp(`export.*from.*lib/${pluginName}\\.module`, 'i');
          
          if (!moduleExportPattern.test(indexContent)) {
            errors.push(`index.ts must export the plugin module from lib/${pluginName}.module`);
          }
        }
      } else {
        // Flat structure validation
        const expectedFiles = [
          `src/${pluginName}.module.ts`,
          `src/${pluginName}.service.ts`,
          `src/${pluginName}.controller.ts`,
        ];
        
        for (const expectedFile of expectedFiles) {
          if (!files.includes(expectedFile)) {
            errors.push(`Missing required file: ${expectedFile}`);
          }
        }
        
        // Validate module exports for flat structure
        const indexFile = contents.file('src/index.ts');
        if (indexFile) {
          const indexContent = await indexFile.async('text');
          const moduleExportPattern = new RegExp(`export.*from.*${pluginName}\\.module`, 'i');
          
          if (!moduleExportPattern.test(indexContent)) {
            errors.push(`index.ts must export the plugin module`);
          }
        }
      }
      
      if (errors.length > 0) {
        throw new BadRequestException(`Plugin file structure validation failed:\n${errors.join('\n')}`);
      }
      
      this.logger.log('Plugin file structure validation passed');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Failed to validate plugin file structure');
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
    
    // Check for import statements and require calls
    const importRegex = /(?:import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const moduleName = match[1] || match[2];
      if (this.UNSAFE_MODULES.includes(moduleName)) {
        unsafeImports.push(moduleName);
      }
    }
    
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
