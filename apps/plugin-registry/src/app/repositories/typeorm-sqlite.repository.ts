import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { PluginMetadata } from '@modu-nest/plugin-types';
import { 
  IPluginRepository, 
  PluginRecord, 
  PluginDownloadRecord, 
  PluginSearchOptions, 
  RepositoryStats 
} from './plugin-repository.interface';
import { PluginEntity, PluginDownloadEntity } from '../entities';

@Injectable()
export class TypeORMSQLiteRepository implements IPluginRepository {
  private readonly logger = new Logger(TypeORMSQLiteRepository.name);

  constructor(
    @InjectRepository(PluginEntity)
    private readonly pluginRepository: Repository<PluginEntity>,
    @InjectRepository(PluginDownloadEntity)
    private readonly downloadRepository: Repository<PluginDownloadEntity>
  ) {}

  async initialize(): Promise<void> {
    try {
      await this.pluginRepository.query('PRAGMA foreign_keys = ON');
      await this.pluginRepository.query('PRAGMA journal_mode = WAL');
      await this.pluginRepository.query('PRAGMA synchronous = NORMAL');
      await this.pluginRepository.query('PRAGMA cache_size = 10000');
      await this.pluginRepository.query('PRAGMA temp_store = MEMORY');
      this.logger.log('SQLite repository initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SQLite repository:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    // TypeORM handles connection closing through the DataSource
    this.logger.log('SQLite repository connection closed');
  }

  async savePlugin(metadata: PluginMetadata, filePath: string, fileSize: number, checksum: string): Promise<PluginRecord> {
    try {
      const manifestJson = JSON.stringify(metadata);
      const tags = JSON.stringify(metadata.tags || []);
      const dependencies = JSON.stringify(metadata.dependencies || []);

      const plugin = await this.pluginRepository.save({
        name: metadata.name,
        version: metadata.version,
        description: metadata.description || '',
        author: metadata.author || '',
        license: metadata.license || '',
        manifest: manifestJson,
        filePath,
        fileSize,
        checksum,
        uploadDate: new Date(),
        lastAccessed: new Date(),
        tags,
        dependencies,
        status: 'active' as const,
        downloadCount: 0
      });

      this.logger.log(`Plugin saved: ${metadata.name} v${metadata.version}`);
      return this.mapEntityToRecord(plugin);
    } catch (error) {
      this.logger.error(`Failed to save plugin ${metadata.name}:`, error);
      throw error;
    }
  }

  async getPluginByName(name: string): Promise<PluginRecord | null> {
    try {
      const plugin = await this.pluginRepository.findOne({
        where: { name, status: 'active' }
      });
      return plugin ? this.mapEntityToRecord(plugin) : null;
    } catch (error) {
      this.logger.error(`Failed to get plugin by name ${name}:`, error);
      return null;
    }
  }

  async getPluginByChecksum(checksum: string): Promise<PluginRecord | null> {
    try {
      const plugin = await this.pluginRepository.findOne({
        where: { checksum }
      });
      return plugin ? this.mapEntityToRecord(plugin) : null;
    } catch (error) {
      this.logger.error(`Failed to get plugin by checksum ${checksum}:`, error);
      return null;
    }
  }

  async getAllPlugins(options: PluginSearchOptions = {}): Promise<PluginRecord[]> {
    try {
      const {
        status = 'active',
        limit = 100,
        offset = 0,
        sortBy = 'uploadDate',
        sortOrder = 'desc'
      } = options;

      const queryBuilder = this.pluginRepository.createQueryBuilder('plugin');

      if (status !== 'all') {
        queryBuilder.where('plugin.status = :status', { status });
      }

      queryBuilder
        .orderBy(`plugin.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
        .limit(limit)
        .offset(offset);

      const plugins = await queryBuilder.getMany();
      return plugins.map(plugin => this.mapEntityToRecord(plugin));
    } catch (error) {
      this.logger.error('Failed to get all plugins:', error);
      return [];
    }
  }

  async searchPlugins(query: string): Promise<PluginRecord[]> {
    try {
      const plugins = await this.pluginRepository.find({
        where: [
          { name: Like(`%${query}%`), status: 'active' },
          { description: Like(`%${query}%`), status: 'active' },
          { author: Like(`%${query}%`), status: 'active' },
          { tags: Like(`%${query}%`), status: 'active' }
        ],
        order: { name: 'ASC' }
      });

      return plugins.map(plugin => this.mapEntityToRecord(plugin));
    } catch (error) {
      this.logger.error(`Failed to search plugins with query '${query}':`, error);
      return [];
    }
  }

  async deletePlugin(name: string): Promise<boolean> {
    try {
      const result = await this.pluginRepository.delete({ name });
      const deleted = result.affected && result.affected > 0;
      
      if (deleted) {
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
      const plugin = await this.pluginRepository.findOne({ 
        where: { name, status: 'active' } 
      });

      if (!plugin) {
        throw new Error(`Plugin not found: ${name}`);
      }

      // Update download count and last accessed
      await this.pluginRepository.update(
        { id: plugin.id },
        { 
          downloadCount: () => 'downloadCount + 1',
          lastAccessed: new Date()
        }
      );

      // Record download history
      await this.downloadRepository.save({
        pluginId: plugin.id,
        version: plugin.version,
        userAgent,
        ipAddress,
        downloadDate: new Date()
      });

      this.logger.debug(`Download recorded for plugin: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to record download for ${name}:`, error);
      throw error;
    }
  }

  async getStats(): Promise<RepositoryStats> {
    try {
      const [
        totalPluginsResult,
        totalStorageResult,
        avgSizeResult,
        mostPopularResult,
        oldestResult,
        newestResult,
        totalDownloadsResult
      ] = await Promise.all([
        this.pluginRepository.count({ where: { status: 'active' } }),
        this.pluginRepository
          .createQueryBuilder('plugin')
          .select('SUM(plugin.fileSize)', 'total')
          .where('plugin.status = :status', { status: 'active' })
          .getRawOne(),
        this.pluginRepository
          .createQueryBuilder('plugin')
          .select('AVG(plugin.fileSize)', 'avg')
          .where('plugin.status = :status', { status: 'active' })
          .getRawOne(),
        this.pluginRepository.findOne({
          where: { status: 'active' },
          order: { downloadCount: 'DESC' }
        }),
        this.pluginRepository.findOne({
          where: { status: 'active' },
          order: { uploadDate: 'ASC' }
        }),
        this.pluginRepository.findOne({
          where: { status: 'active' },
          order: { uploadDate: 'DESC' }
        }),
        this.pluginRepository
          .createQueryBuilder('plugin')
          .select('SUM(plugin.downloadCount)', 'total')
          .where('plugin.status = :status', { status: 'active' })
          .getRawOne()
      ]);

      return {
        totalPlugins: totalPluginsResult,
        totalStorage: parseInt(totalStorageResult?.total) || 0,
        averagePluginSize: Math.round(parseFloat(avgSizeResult?.avg) || 0),
        mostPopularPlugin: mostPopularResult?.name || 'None',
        oldestPlugin: oldestResult?.name || 'None',
        newestPlugin: newestResult?.name || 'None',
        totalDownloads: parseInt(totalDownloadsResult?.total) || 0
      };
    } catch (error) {
      this.logger.error('Failed to get repository stats:', error);
      throw error;
    }
  }

  async pluginExists(name: string, version?: string): Promise<boolean> {
    try {
      const where: any = { name, status: 'active' };
      if (version) {
        where.version = version;
      }

      const count = await this.pluginRepository.count({ where });
      return count > 0;
    } catch (error) {
      this.logger.error(`Failed to check plugin existence for ${name}:`, error);
      return false;
    }
  }

  async getDownloadHistory(pluginName: string, limit = 100): Promise<PluginDownloadRecord[]> {
    try {
      const plugin = await this.pluginRepository.findOne({
        where: { name: pluginName, status: 'active' }
      });

      if (!plugin) {
        return [];
      }

      const downloads = await this.downloadRepository.find({
        where: { pluginId: plugin.id },
        order: { downloadDate: 'DESC' },
        take: limit
      });

      return downloads.map(download => ({
        id: download.id,
        pluginId: download.pluginId,
        version: download.version,
        downloadDate: download.downloadDate,
        userAgent: download.userAgent || undefined,
        ipAddress: download.ipAddress || undefined
      }));
    } catch (error) {
      this.logger.error(`Failed to get download history for ${pluginName}:`, error);
      return [];
    }
  }

  async updatePluginStatus(name: string, status: 'active' | 'deprecated' | 'disabled'): Promise<boolean> {
    try {
      const result = await this.pluginRepository.update(
        { name },
        { status, updatedAt: new Date() }
      );
      
      const updated = result.affected && result.affected > 0;
      if (updated) {
        this.logger.log(`Plugin status updated: ${name} -> ${status}`);
      }
      
      return updated;
    } catch (error) {
      this.logger.error(`Failed to update plugin status for ${name}:`, error);
      throw error;
    }
  }

  async bulkInsert(plugins: Array<{ metadata: PluginMetadata; filePath: string; fileSize: number; checksum: string }>): Promise<void> {
    try {
      const entities = plugins.map(({ metadata, filePath, fileSize, checksum }) => ({
        name: metadata.name,
        version: metadata.version,
        description: metadata.description || '',
        author: metadata.author || '',
        license: metadata.license || '',
        manifest: JSON.stringify(metadata),
        filePath,
        fileSize,
        checksum,
        uploadDate: new Date(),
        lastAccessed: new Date(),
        tags: JSON.stringify(metadata.tags || []),
        dependencies: JSON.stringify(metadata.dependencies || []),
        status: 'active' as const,
        downloadCount: 0
      }));

      await this.pluginRepository.save(entities);
      this.logger.log(`Bulk inserted ${plugins.length} plugins`);
    } catch (error) {
      this.logger.error('Failed to bulk insert plugins:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pluginRepository.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.error('Repository health check failed:', error);
      return false;
    }
  }

  private mapEntityToRecord(entity: PluginEntity): PluginRecord {
    return {
      id: entity.id,
      name: entity.name,
      version: entity.version,
      description: entity.description,
      author: entity.author,
      license: entity.license,
      manifest: entity.manifest,
      filePath: entity.filePath,
      fileSize: entity.fileSize,
      checksum: entity.checksum,
      uploadDate: entity.uploadDate,
      lastAccessed: entity.lastAccessed,
      downloadCount: entity.downloadCount,
      status: entity.status,
      tags: entity.tags,
      dependencies: entity.dependencies,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }
}