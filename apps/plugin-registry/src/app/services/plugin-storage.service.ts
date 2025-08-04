import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { StorageConfig } from '@modu-nest/plugin-types';
import type { PluginMetadata, PluginPackage, StorageStats } from '@modu-nest/plugin-types';
import { PluginDatabaseService, DatabasePluginRecord } from './plugin-database.service';

@Injectable()
export class PluginStorageService implements OnModuleInit {
  private readonly logger = new Logger(PluginStorageService.name);
  private readonly config: StorageConfig;
  private plugins = new Map<string, PluginPackage>(); // Keep in-memory cache for performance

  constructor(private readonly databaseService: PluginDatabaseService) {
    const storageRoot = process.env.REGISTRY_STORAGE_PATH || path.join(process.cwd(), 'registry-storage');

    this.config = {
      pluginsDir: path.join(storageRoot, 'plugins'),
      metadataFile: path.join(storageRoot, 'metadata.json'),
      maxFileSize: parseInt(process.env.MAX_PLUGIN_SIZE || '52428800', 10), // 50MB default
    };
  }

  async onModuleInit(): Promise<void> {
    await this.initializeStorage();
    await this.loadFromDatabase();
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

  /**
   * Load plugins from database into memory cache
   */
  private async loadFromDatabase(): Promise<void> {
    try {
      const dbPlugins = await this.databaseService.getAllPlugins('active');
      this.plugins.clear();
      
      for (const dbPlugin of dbPlugins) {
        const metadata = this.mapDatabaseToMetadata(dbPlugin);
        const pluginPackage: PluginPackage = {
          metadata,
          filePath: path.basename(dbPlugin.file_path),
        };
        this.plugins.set(dbPlugin.name, pluginPackage);
      }
      
      this.logger.log(`Loaded ${this.plugins.size} plugins from database`);
      
      // Migrate from old metadata file if it exists and database is empty
      if (this.plugins.size === 0 && fs.existsSync(this.config.metadataFile)) {
        await this.migrateFromMetadataFile();
      }
    } catch (error) {
      this.logger.error('Failed to load plugins from database:', error);
      throw new Error('Database loading failed');
    }
  }

  /**
   * Migrate from old JSON metadata file to database
   */
  private async migrateFromMetadataFile(): Promise<void> {
    try {
      this.logger.log('Migrating plugins from metadata file to database...');
      const data = await readFile(this.config.metadataFile, 'utf-8');
      const pluginsArray: PluginPackage[] = JSON.parse(data);
      
      for (const plugin of pluginsArray) {
        const filePath = path.join(this.config.pluginsDir, plugin.filePath);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          await this.databaseService.savePlugin(
            plugin.metadata,
            filePath,
            stats.size,
            plugin.metadata.checksum
          );
          this.plugins.set(plugin.metadata.name, plugin);
        }
      }
      
      // Backup and remove old metadata file
      const backupPath = this.config.metadataFile + '.backup';
      fs.renameSync(this.config.metadataFile, backupPath);
      
      this.logger.log(`Migrated ${pluginsArray.length} plugins to database. Old metadata backed up to ${backupPath}`);
    } catch (error) {
      this.logger.error('Failed to migrate from metadata file:', error);
      // Don't throw - continue with empty registry
    }
  }

  /**
   * Map database record to plugin metadata
   */
  private mapDatabaseToMetadata(dbPlugin: DatabasePluginRecord): PluginMetadata {
    const manifest = JSON.parse(dbPlugin.manifest);
    return {
      ...manifest,
      uploadedAt: dbPlugin.upload_date.toISOString(),
      fileSize: dbPlugin.file_size,
      checksum: dbPlugin.checksum,
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

      // Save to database
      await this.databaseService.savePlugin(
        metadata,
        filePath,
        pluginBuffer.length,
        metadata.checksum
      );

      // Update memory cache
      const pluginPackage: PluginPackage = {
        metadata,
        filePath: fileName,
      };
      this.plugins.set(metadata.name, pluginPackage);

      this.logger.log(`Plugin ${metadata.name} v${metadata.version} stored successfully (DB + File)`);
    } catch (error) {
      // Cleanup file if database save failed
      if (fs.existsSync(filePath)) {
        try {
          await fs.promises.unlink(filePath);
        } catch (cleanupError) {
          this.logger.error(`Failed to cleanup file after database error: ${cleanupError}`);
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

    // Fallback to database
    try {
      const dbPlugin = await this.databaseService.getPluginByName(name);
      if (!dbPlugin) {
        return null;
      }

      // Add to memory cache
      const metadata = this.mapDatabaseToMetadata(dbPlugin);
      const pluginPackage: PluginPackage = {
        metadata,
        filePath: path.basename(dbPlugin.file_path),
      };
      this.plugins.set(name, pluginPackage);
      
      return pluginPackage;
    } catch (error) {
      this.logger.error(`Failed to get plugin ${name} from database:`, error);
      return null;
    }
  }

  async getAllPlugins(): Promise<PluginPackage[]> {
    // Return from memory cache for performance
    return Array.from(this.plugins.values());
  }

  /**
   * Get all plugins from database (bypasses cache)
   */
  async getAllPluginsFromDatabase(): Promise<PluginPackage[]> {
    try {
      const dbPlugins = await this.databaseService.getAllPlugins('active');
      return dbPlugins.map(dbPlugin => ({
        metadata: this.mapDatabaseToMetadata(dbPlugin),
        filePath: path.basename(dbPlugin.file_path),
      }));
    } catch (error) {
      this.logger.error('Failed to get all plugins from database:', error);
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
      // Check database in case cache is stale
      const dbPlugin = await this.databaseService.getPluginByName(name);
      if (!dbPlugin) {
        throw new Error(`Plugin ${name} not found`);
      }
    }

    try {
      // Delete from database (this also deletes the file)
      const deleted = await this.databaseService.deletePlugin(name);
      if (!deleted) {
        throw new Error(`Plugin ${name} not found in database`);
      }

      // Remove from memory cache
      this.plugins.delete(name);

      this.logger.log(`Plugin ${name} deleted successfully (DB + File + Cache)`);
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

    // Fallback to database
    try {
      const dbPlugin = await this.databaseService.getPluginByName(name);
      if (!dbPlugin) return false;
      if (version) return dbPlugin.version === version;
      return true;
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

  /**
   * Get comprehensive storage statistics from database
   */
  async getDetailedStorageStats() {
    try {
      const dbStats = await this.databaseService.getDatabaseStats();
      const memoryStats = this.getStorageStats();
      
      return {
        memory: memoryStats,
        database: dbStats,
        cacheHitRate: this.plugins.size > 0 ? 
          (this.plugins.size / dbStats.totalPlugins) * 100 : 0,
      };
    } catch (error) {
      this.logger.error('Failed to get detailed storage stats:', error);
      return {
        memory: this.getStorageStats(),
        database: null,
        cacheHitRate: 0,
      };
    }
  }

  /**
   * Record a plugin download
   */
  async recordDownload(name: string, userAgent?: string, ipAddress?: string): Promise<void> {
    try {
      await this.databaseService.updateDownloadCount(name, userAgent, ipAddress);
    } catch (error) {
      this.logger.error(`Failed to record download for ${name}:`, error);
      // Don't throw - download should still succeed
    }
  }

  /**
   * Search plugins in database
   */
  async searchPlugins(query: string): Promise<PluginPackage[]> {
    try {
      const dbPlugins = await this.databaseService.searchPlugins(query);
      return dbPlugins.map(dbPlugin => ({
        metadata: this.mapDatabaseToMetadata(dbPlugin),
        filePath: path.basename(dbPlugin.file_path),
      }));
    } catch (error) {
      this.logger.error(`Failed to search plugins with query '${query}':`, error);
      return [];
    }
  }

  /**
   * Get database service for advanced operations
   */
  getDatabaseService(): PluginDatabaseService {
    return this.databaseService;
  }
}
