import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { StorageConfig, StorageStats } from '@libs/plugin-core';
import type { PluginMetadata, PluginPackage } from '@libs/plugin-types';
import type { IPluginRepository, PluginRecord } from '../repositories';

export const PLUGIN_REPOSITORY_TOKEN = 'PLUGIN_REPOSITORY';

@Injectable()
export class PluginStorageService implements OnModuleInit {
  private readonly logger = new Logger(PluginStorageService.name);
  private readonly config: StorageConfig;
  private plugins = new Map<string, PluginPackage>(); // Keep in-memory cache for performance

  constructor(
    @Inject(PLUGIN_REPOSITORY_TOKEN)
    private readonly repository: IPluginRepository
  ) {
    const storageRoot = process.env.REGISTRY_STORAGE_PATH || path.join(process.cwd(), 'registry-storage');

    this.config = {
      pluginsDir: path.join(storageRoot, 'plugins'),
      metadataFile: path.join(storageRoot, 'metadata.json'),
      maxFileSize: parseInt(process.env.MAX_PLUGIN_SIZE || '52428800', 10), // 50MB default
    };
  }

  async onModuleInit(): Promise<void> {
    await this.initializeStorage();
    await this.repository.initialize();
    await this.loadFromRepository();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await mkdir(path.dirname(this.config.metadataFile), { recursive: true });
      await mkdir(this.config.pluginsDir, { recursive: true });
      this.logger.log('Storage initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize storage:', error);
      throw new Error('Storage initialization failed');
    }
  }

  private async loadFromRepository(): Promise<void> {
    try {
      const repositoryPlugins = await this.repository.getAllPlugins({ status: 'active' });
      this.plugins.clear();

      for (const repoPlugin of repositoryPlugins) {
        const metadata = this.mapRepositoryRecordToMetadata(repoPlugin);
        const pluginPackage: PluginPackage = {
          metadata,
          filePath: path.basename(repoPlugin.filePath),
        };
        this.plugins.set(repoPlugin.name, pluginPackage);
      }

      this.logger.log(`Loaded ${this.plugins.size} plugins from repository`);

      // Migrate from old metadata file if it exists and repository is empty
      if (this.plugins.size === 0 && fs.existsSync(this.config.metadataFile)) {
        await this.migrateFromMetadataFile();
      }
    } catch (error) {
      this.logger.error('Failed to load plugins from repository:', error);
      throw new Error('Repository loading failed');
    }
  }

  private async migrateFromMetadataFile(): Promise<void> {
    try {
      this.logger.log('Migrating plugins from metadata file to repository...');
      const data = await readFile(this.config.metadataFile, 'utf-8');
      const pluginsArray: PluginPackage[] = JSON.parse(data);

      for (const plugin of pluginsArray) {
        const filePath = path.join(this.config.pluginsDir, plugin.filePath);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          await this.repository.savePlugin(plugin.metadata, filePath, stats.size, plugin.metadata.checksum);
          this.plugins.set(plugin.metadata.name, plugin);
        }
      }

      // Backup and remove old metadata file
      const backupPath = this.config.metadataFile + '.backup';
      fs.renameSync(this.config.metadataFile, backupPath);

      this.logger.log(`Migrated ${pluginsArray.length} plugins to repository. Old metadata backed up to ${backupPath}`);
    } catch (error) {
      this.logger.error('Failed to migrate from metadata file:', error);
      // Don't throw - continue with empty registry
    }
  }

  private mapRepositoryRecordToMetadata(record: PluginRecord): PluginMetadata {
    const manifest = JSON.parse(record.manifest);
    return {
      ...manifest,
      uploadedAt: record.uploadDate.toISOString(),
      fileSize: record.fileSize,
      checksum: record.checksum,
    };
  }

  async storePlugin(metadata: PluginMetadata, pluginBuffer: Buffer): Promise<void> {
    const fileName = `${metadata.name}-${metadata.version}.zip`;
    const filePath = path.join(this.config.pluginsDir, fileName);

    if (pluginBuffer.length > this.config.maxFileSize) {
      throw new Error(`Plugin file too large: ${pluginBuffer.length} bytes (max: ${this.config.maxFileSize})`);
    }

    try {
      // Store file to disk
      await writeFile(filePath, new Uint8Array(pluginBuffer));

      // Save to repository
      await this.repository.savePlugin(metadata, filePath, pluginBuffer.length, metadata.checksum);

      // Update memory cache
      const pluginPackage: PluginPackage = {
        metadata,
        filePath: fileName,
      };
      this.plugins.set(metadata.name, pluginPackage);

      this.logger.log(`Plugin ${metadata.name} v${metadata.version} stored successfully (Repository + File)`);
    } catch (error) {
      // Cleanup file if repository save failed
      if (fs.existsSync(filePath)) {
        try {
          await fs.promises.unlink(filePath);
        } catch (cleanupError) {
          this.logger.error(`Failed to cleanup file after repository error: ${cleanupError}`);
        }
      }

      this.logger.error(`Failed to store plugin ${metadata.name}:`, error);
      throw new Error(`Plugin storage failed: ${(error as Error).message}`);
    }
  }

  async getPlugin(name: string): Promise<PluginPackage | null> {
    // Check memory cache first
    const cached = this.plugins.get(name);
    if (cached) {
      return cached;
    }

    // Fallback to repository
    try {
      const repoPlugin = await this.repository.getPluginByName(name);
      if (!repoPlugin) {
        return null;
      }

      // Add to memory cache
      const metadata = this.mapRepositoryRecordToMetadata(repoPlugin);
      const pluginPackage: PluginPackage = {
        metadata,
        filePath: path.basename(repoPlugin.filePath),
      };
      this.plugins.set(name, pluginPackage);

      return pluginPackage;
    } catch (error) {
      this.logger.error(`Failed to get plugin ${name} from repository:`, error);
      return null;
    }
  }

  async getAllPlugins(): Promise<PluginPackage[]> {
    // Return from memory cache for performance
    return Array.from(this.plugins.values());
  }

  async getAllPluginsFromRepository(): Promise<PluginPackage[]> {
    try {
      const repoPlugins = await this.repository.getAllPlugins({ status: 'active' });
      return repoPlugins.map((repoPlugin) => ({
        metadata: this.mapRepositoryRecordToMetadata(repoPlugin),
        filePath: path.basename(repoPlugin.filePath),
      }));
    } catch (error) {
      this.logger.error('Failed to get all plugins from repository:', error);
      return [];
    }
  }

  async getPluginBuffer(name: string): Promise<Buffer> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    const fullPath = path.join(this.config.pluginsDir, plugin.filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Plugin file ${name} not found on disk`);
    }

    try {
      return await readFile(fullPath);
    } catch (error) {
      this.logger.error(`Failed to read plugin file ${name}:`, error);
      throw new Error(`Failed to read plugin file: ${(error as Error).message}`);
    }
  }

  async deletePlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      // Check repository in case cache is stale
      const repoPlugin = await this.repository.getPluginByName(name);
      if (!repoPlugin) {
        throw new Error(`Plugin ${name} not found`);
      }
    }

    try {
      // Delete from repository
      const deleted = await this.repository.deletePlugin(name);
      if (!deleted) {
        throw new Error(`Plugin ${name} not found in repository`);
      }

      // Delete file if it exists
      if (plugin) {
        const fullPath = path.join(this.config.pluginsDir, plugin.filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          this.logger.log(`File deleted: ${fullPath}`);
        }
      }

      // Remove from memory cache
      this.plugins.delete(name);

      this.logger.log(`Plugin ${name} deleted successfully (Repository + File + Cache)`);
    } catch (error) {
      this.logger.error(`Failed to delete plugin ${name}:`, error);
      throw new Error(`Plugin deletion failed: ${(error as Error).message}`);
    }
  }

  async pluginExists(name: string, version?: string): Promise<boolean> {
    // Check memory cache first
    const plugin = this.plugins.get(name);
    if (plugin) {
      if (version) return plugin.metadata.version === version;
      return true;
    }

    // Fallback to repository
    try {
      return await this.repository.pluginExists(name, version);
    } catch (error) {
      this.logger.error(`Failed to check plugin existence for ${name}:`, error);
      return false;
    }
  }

  getStorageStats(): StorageStats {
    let totalSize = 0;
    for (const plugin of this.plugins.values()) {
      totalSize += plugin.metadata.fileSize;
    }

    return {
      totalPlugins: this.plugins.size,
      totalSize,
      storageLocation: this.config.pluginsDir,
    };
  }

  async getDetailedStorageStats() {
    try {
      const repositoryStats = await this.repository.getStats();
      const memoryStats = this.getStorageStats();

      return {
        memory: memoryStats,
        repository: repositoryStats,
        cacheHitRate: this.plugins.size > 0 ? (this.plugins.size / repositoryStats.totalPlugins) * 100 : 0,
      };
    } catch (error) {
      this.logger.error('Failed to get detailed storage stats:', error);
      return {
        memory: this.getStorageStats(),
        repository: null,
        cacheHitRate: 0,
      };
    }
  }

  async recordDownload(name: string, userAgent?: string, ipAddress?: string): Promise<void> {
    try {
      await this.repository.recordDownload(name, userAgent, ipAddress);

      // Update memory cache if plugin exists
      const plugin = this.plugins.get(name);
      if (plugin) {
        plugin.metadata.uploadedAt = new Date().toISOString(); // This represents last accessed for cache purposes
      }
    } catch (error) {
      this.logger.error(`Failed to record download for ${name}:`, error);
      // Don't throw - download should still succeed
    }
  }

  async searchPlugins(query: string): Promise<PluginPackage[]> {
    try {
      const repoPlugins = await this.repository.searchPlugins(query);
      return repoPlugins.map((repoPlugin) => ({
        metadata: this.mapRepositoryRecordToMetadata(repoPlugin),
        filePath: path.basename(repoPlugin.filePath),
      }));
    } catch (error) {
      this.logger.error(`Failed to search plugins with query '${query}':`, error);
      return [];
    }
  }

  // Repository pass-through methods for advanced operations
  async updatePluginStatus(name: string, status: 'active' | 'deprecated' | 'disabled'): Promise<boolean> {
    try {
      const updated = await this.repository.updatePluginStatus(name, status);

      // Update memory cache
      if (updated) {
        const plugin = this.plugins.get(name);
        if (plugin) {
          // If status is not active, remove from cache
          if (status !== 'active') {
            this.plugins.delete(name);
          }
        }
      }

      return updated;
    } catch (error) {
      this.logger.error(`Failed to update plugin status for ${name}:`, error);
      throw error;
    }
  }

  async getDownloadHistory(pluginName: string, limit?: number) {
    try {
      return await this.repository.getDownloadHistory(pluginName, limit);
    } catch (error) {
      this.logger.error(`Failed to get download history for ${pluginName}:`, error);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      return await this.repository.healthCheck();
    } catch (error) {
      this.logger.error('Repository health check failed:', error);
      return false;
    }
  }

  // Get the underlying repository for advanced operations
  getRepository(): IPluginRepository {
    return this.repository;
  }
}
