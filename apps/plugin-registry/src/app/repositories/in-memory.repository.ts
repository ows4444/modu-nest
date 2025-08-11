import { Injectable, Logger } from '@nestjs/common';
import { PluginMetadata } from '@libs/plugin-types';
import {
  IPluginRepository,
  PluginRecord,
  PluginDownloadRecord,
  PluginSearchOptions,
  RepositoryStats,
} from './plugin-repository.interface';

@Injectable()
export class InMemoryRepository implements IPluginRepository {
  private readonly logger = new Logger(InMemoryRepository.name);
  private plugins = new Map<string, PluginRecord>();
  private downloads: PluginDownloadRecord[] = [];
  private nextId = 1;
  private nextDownloadId = 1;

  async initialize(): Promise<void> {
    this.plugins.clear();
    this.downloads = [];
    this.nextId = 1;
    this.nextDownloadId = 1;
    this.logger.log('In-memory repository initialized successfully');
  }

  async close(): Promise<void> {
    this.plugins.clear();
    this.downloads = [];
    this.logger.log('In-memory repository closed');
  }

  async savePlugin(
    metadata: PluginMetadata,
    filePath: string,
    fileSize: number,
    checksum: string
  ): Promise<PluginRecord> {
    try {
      const now = new Date();
      const manifestJson = JSON.stringify(metadata);
      const tags = JSON.stringify((metadata as any).tags || []);
      const dependencies = JSON.stringify(metadata.dependencies || []);

      const existingPlugin = this.plugins.get(metadata.name);
      const id = existingPlugin ? existingPlugin.id : this.nextId++;

      const plugin: PluginRecord = {
        id,
        name: metadata.name,
        version: metadata.version,
        description: metadata.description || '',
        author: metadata.author || '',
        license: metadata.license || '',
        manifest: manifestJson,
        filePath,
        fileSize,
        checksum,
        uploadDate: now,
        lastAccessed: now,
        downloadCount: existingPlugin ? existingPlugin.downloadCount : 0,
        status: 'active',
        tags,
        dependencies,
        createdAt: existingPlugin ? existingPlugin.createdAt : now,
        updatedAt: now,
      };

      this.plugins.set(metadata.name, plugin);
      this.logger.log(`Plugin saved: ${metadata.name} v${metadata.version}`);
      return plugin;
    } catch (error) {
      this.logger.error(`Failed to save plugin ${metadata.name}:`, error);
      throw error;
    }
  }

  async getPluginByName(name: string): Promise<PluginRecord | null> {
    try {
      const plugin = this.plugins.get(name);
      return plugin && plugin.status === 'active' ? plugin : null;
    } catch (error) {
      this.logger.error(`Failed to get plugin by name ${name}:`, error);
      return null;
    }
  }

  async getPluginByChecksum(checksum: string): Promise<PluginRecord | null> {
    try {
      for (const plugin of this.plugins.values()) {
        if (plugin.checksum === checksum) {
          return plugin;
        }
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to get plugin by checksum ${checksum}:`, error);
      return null;
    }
  }

  async getAllPlugins(options: PluginSearchOptions = {}): Promise<PluginRecord[]> {
    try {
      const { status = 'active', limit = 100, offset = 0, sortBy = 'uploadDate', sortOrder = 'desc' } = options;

      let plugins = Array.from(this.plugins.values());

      // Filter by status
      if (status !== 'all') {
        plugins = plugins.filter((plugin) => plugin.status === status);
      }

      // Sort
      plugins.sort((a, b) => {
        const aValue = a[sortBy as keyof PluginRecord] as any;
        const bValue = b[sortBy as keyof PluginRecord] as any;

        if (sortOrder === 'desc') {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        } else {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        }
      });

      // Apply pagination
      return plugins.slice(offset, offset + limit);
    } catch (error) {
      this.logger.error('Failed to get all plugins:', error);
      return [];
    }
  }

  async searchPlugins(query: string): Promise<PluginRecord[]> {
    try {
      const lowerQuery = query.toLowerCase();
      const plugins = Array.from(this.plugins.values()).filter((plugin) => {
        if (plugin.status !== 'active') return false;

        return (
          plugin.name.toLowerCase().includes(lowerQuery) ||
          plugin.description.toLowerCase().includes(lowerQuery) ||
          plugin.author.toLowerCase().includes(lowerQuery) ||
          plugin.tags.toLowerCase().includes(lowerQuery)
        );
      });

      return plugins.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      this.logger.error(`Failed to search plugins with query '${query}':`, error);
      return [];
    }
  }

  async deletePlugin(name: string): Promise<boolean> {
    try {
      const deleted = this.plugins.delete(name);

      if (deleted) {
        // Remove related downloads
        this.downloads = this.downloads.filter((download) => {
          const plugin = Array.from(this.plugins.values()).find((p) => p.id === download.pluginId);
          return plugin !== undefined;
        });

        this.logger.log(`Plugin deleted: ${name}`);
      }

      return deleted;
    } catch (error) {
      this.logger.error(`Failed to delete plugin ${name}:`, error);
      throw error;
    }
  }

  async recordDownload(name: string, userAgent?: string, ipAddress?: string): Promise<void> {
    try {
      const plugin = this.plugins.get(name);

      if (!plugin || plugin.status !== 'active') {
        throw new Error(`Plugin not found: ${name}`);
      }

      // Update plugin statistics
      plugin.downloadCount++;
      plugin.lastAccessed = new Date();

      // Record download history
      const downloadRecord: PluginDownloadRecord = {
        id: this.nextDownloadId++,
        pluginId: plugin.id,
        version: plugin.version,
        downloadDate: new Date(),
        userAgent,
        ipAddress,
      };

      this.downloads.push(downloadRecord);
      this.logger.debug(`Download recorded for plugin: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to record download for ${name}:`, error);
      throw error;
    }
  }

  async getStats(): Promise<RepositoryStats> {
    try {
      const activePlugins = Array.from(this.plugins.values()).filter((p) => p.status === 'active');

      if (activePlugins.length === 0) {
        return {
          totalPlugins: 0,
          totalStorage: 0,
          averagePluginSize: 0,
          mostPopularPlugin: 'None',
          oldestPlugin: 'None',
          newestPlugin: 'None',
          totalDownloads: 0,
        };
      }

      const totalStorage = activePlugins.reduce((sum, plugin) => sum + plugin.fileSize, 0);
      const totalDownloads = activePlugins.reduce((sum, plugin) => sum + plugin.downloadCount, 0);
      const averagePluginSize = Math.round(totalStorage / activePlugins.length);

      const mostPopular = activePlugins.reduce((max, plugin) =>
        plugin.downloadCount > max.downloadCount ? plugin : max
      );

      const oldest = activePlugins.reduce((oldest, plugin) =>
        plugin.uploadDate < oldest.uploadDate ? plugin : oldest
      );

      const newest = activePlugins.reduce((newest, plugin) =>
        plugin.uploadDate > newest.uploadDate ? plugin : newest
      );

      return {
        totalPlugins: activePlugins.length,
        totalStorage,
        averagePluginSize,
        mostPopularPlugin: mostPopular.name,
        oldestPlugin: oldest.name,
        newestPlugin: newest.name,
        totalDownloads,
      };
    } catch (error) {
      this.logger.error('Failed to get repository stats:', error);
      throw error;
    }
  }

  async pluginExists(name: string, version?: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(name);
      if (!plugin || plugin.status !== 'active') {
        return false;
      }

      if (version) {
        return plugin.version === version;
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to check plugin existence for ${name}:`, error);
      return false;
    }
  }

  async getDownloadHistory(pluginName: string, limit = 100): Promise<PluginDownloadRecord[]> {
    try {
      const plugin = this.plugins.get(pluginName);

      if (!plugin || plugin.status !== 'active') {
        return [];
      }

      const pluginDownloads = this.downloads
        .filter((download) => download.pluginId === plugin.id)
        .sort((a, b) => b.downloadDate.getTime() - a.downloadDate.getTime())
        .slice(0, limit);

      return pluginDownloads;
    } catch (error) {
      this.logger.error(`Failed to get download history for ${pluginName}:`, error);
      return [];
    }
  }

  async updatePluginStatus(name: string, status: 'active' | 'deprecated' | 'disabled'): Promise<boolean> {
    try {
      const plugin = this.plugins.get(name);

      if (!plugin) {
        return false;
      }

      plugin.status = status;
      plugin.updatedAt = new Date();

      this.logger.log(`Plugin status updated: ${name} -> ${status}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to update plugin status for ${name}:`, error);
      throw error;
    }
  }

  async bulkInsert(
    plugins: Array<{ metadata: PluginMetadata; filePath: string; fileSize: number; checksum: string }>
  ): Promise<void> {
    try {
      for (const { metadata, filePath, fileSize, checksum } of plugins) {
        await this.savePlugin(metadata, filePath, fileSize, checksum);
      }

      this.logger.log(`Bulk inserted ${plugins.length} plugins`);
    } catch (error) {
      this.logger.error('Failed to bulk insert plugins:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple check to ensure the in-memory structure is working
      return this.plugins instanceof Map;
    } catch (error) {
      this.logger.error('Repository health check failed:', error);
      return false;
    }
  }

  // Additional utility methods for testing
  getPluginCount(): number {
    return this.plugins.size;
  }

  getDownloadCount(): number {
    return this.downloads.length;
  }

  clear(): void {
    this.plugins.clear();
    this.downloads = [];
    this.nextId = 1;
    this.nextDownloadId = 1;
  }
}
