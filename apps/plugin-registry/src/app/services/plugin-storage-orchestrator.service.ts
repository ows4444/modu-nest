import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import crypto from 'crypto';
import { PluginMetadata, CreatePluginDto, PluginListResponseDto, PluginResponseDto } from '@libs/plugin-types';
import { PluginStorageService } from './plugin-storage.service';
import { RegistryStats } from '@libs/plugin-core';

@Injectable()
export class PluginStorageOrchestratorService {
  private readonly logger = new Logger(PluginStorageOrchestratorService.name);

  constructor(private readonly storageService: PluginStorageService) {}

  /**
   * Check if plugin already exists with same version
   */
  async checkPluginExists(name: string, version: string): Promise<void> {
    if (await this.storageService.pluginExists(name, version)) {
      throw new ConflictException(`Plugin ${name} version ${version} already exists`);
    }
  }

  /**
   * Create plugin metadata from manifest and buffer
   */
  createPluginMetadata(manifest: CreatePluginDto, pluginBuffer: Buffer): PluginMetadata {
    const checksum = crypto.createHash('sha256').update(new Uint8Array(pluginBuffer)).digest('hex');

    return {
      ...manifest,
      uploadedAt: new Date().toISOString(),
      fileSize: pluginBuffer.length,
      checksum,
    };
  }

  /**
   * Store plugin with metadata and buffer
   */
  async storePlugin(metadata: PluginMetadata, pluginBuffer: Buffer): Promise<void> {
    await this.storageService.storePlugin(metadata, pluginBuffer);
    this.logger.log(
      `Plugin ${metadata.name} v${metadata.version} stored successfully (checksum: ${metadata.checksum.substring(
        0,
        8
      )}...)`
    );
  }

  /**
   * List all plugins with optional pagination
   */
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

  /**
   * Get single plugin by name
   */
  async getPlugin(name: string): Promise<PluginResponseDto> {
    const plugin = await this.storageService.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin ${name} not found`);
    }

    return this.mapToResponseDto(plugin.metadata);
  }

  /**
   * Download plugin with tracking
   */
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

  /**
   * Delete plugin
   */
  async deletePlugin(name: string): Promise<void> {
    const plugin = await this.storageService.getPlugin(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin ${name} not found`);
    }

    await this.storageService.deletePlugin(name);
    this.logger.log(`Plugin ${name} deleted successfully`);
  }

  /**
   * Get registry statistics
   */
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
   * Note: Direct database access - consider using repository methods instead
   */
  getDatabaseService() {
    // TODO: Implement proper database service access or remove this method
    throw new Error('Direct database access not implemented. Use repository methods instead.');
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
