import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
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
export class TypeORMPostgreSQLRepository implements IPluginRepository {
  private readonly logger = new Logger(TypeORMPostgreSQLRepository.name);

  constructor(
    @InjectRepository(PluginEntity)
    private readonly pluginRepository: Repository<PluginEntity>,
    @InjectRepository(PluginDownloadEntity)
    private readonly downloadRepository: Repository<PluginDownloadEntity>
  ) {}

  async initialize(): Promise<void> {
    try {
      // PostgreSQL-specific optimizations
      await this.pluginRepository.query('SET synchronous_commit = off');
      await this.pluginRepository.query('SET wal_buffers = 16MB');
      await this.pluginRepository.query('SET checkpoint_completion_target = 0.9');
      this.logger.log('PostgreSQL repository initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize PostgreSQL repository:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    // TypeORM handles connection closing through the DataSource
    this.logger.log('PostgreSQL repository connection closed');
  }

  async savePlugin(metadata: PluginMetadata, filePath: string, fileSize: number, checksum: string): Promise<PluginRecord> {
    try {
      const manifestJson = JSON.stringify(metadata);
      const tags = JSON.stringify(metadata.tags || []);
      const dependencies = JSON.stringify(metadata.dependencies || []);

      // Use UPSERT (ON CONFLICT) for PostgreSQL
      const result = await this.pluginRepository
        .createQueryBuilder()
        .insert()
        .into(PluginEntity)
        .values({
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
        })
        .onConflict('(name) DO UPDATE SET ' +
          'version = EXCLUDED.version, ' +
          'description = EXCLUDED.description, ' +
          'manifest = EXCLUDED.manifest, ' +
          'file_path = EXCLUDED.file_path, ' +
          'file_size = EXCLUDED.file_size, ' +
          'checksum = EXCLUDED.checksum, ' +
          'updated_at = EXCLUDED.updated_at'
        )
        .returning('*')
        .execute();

      const plugin = result.generatedMaps[0] as PluginEntity;
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

      // PostgreSQL-specific optimizations with proper column mapping
      const columnMap: { [key: string]: string } = {
        uploadDate: 'upload_date',
        downloadCount: 'download_count',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      };
      
      const dbColumn = columnMap[sortBy] || sortBy;
      
      queryBuilder
        .orderBy(`plugin.${dbColumn}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
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
      // Use PostgreSQL's ILIKE for case-insensitive search
      const plugins = await this.pluginRepository
        .createQueryBuilder('plugin')
        .where('plugin.status = :status', { status: 'active' })
        .andWhere(
          '(plugin.name ILIKE :query OR plugin.description ILIKE :query OR plugin.author ILIKE :query OR plugin.tags ILIKE :query)',
          { query: `%${query}%` }
        )
        .orderBy('plugin.name', 'ASC')
        .getMany();

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
      // Use a transaction for atomic operations
      await this.pluginRepository.manager.transaction(async transactionalEntityManager => {
        const plugin = await transactionalEntityManager.findOne(PluginEntity, { 
          where: { name, status: 'active' } 
        });

        if (!plugin) {
          throw new Error(`Plugin not found: ${name}`);
        }

        // Update download count and last accessed with atomic increment
        await transactionalEntityManager
          .createQueryBuilder()
          .update(PluginEntity)
          .set({ 
            downloadCount: () => 'download_count + 1',
            lastAccessed: new Date()
          })
          .where('id = :id', { id: plugin.id })
          .execute();

        // Record download history
        await transactionalEntityManager.save(PluginDownloadEntity, {
          pluginId: plugin.id,
          version: plugin.version,
          userAgent,
          ipAddress,
          downloadDate: new Date()
        });
      });

      this.logger.debug(`Download recorded for plugin: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to record download for ${name}:`, error);
      throw error;
    }
  }

  async getStats(): Promise<RepositoryStats> {
    try {
      // Use single optimized query for PostgreSQL
      const statsQuery = await this.pluginRepository
        .createQueryBuilder('plugin')
        .select([
          'COUNT(*) as total_plugins',
          'COALESCE(SUM(plugin.file_size), 0) as total_storage',
          'COALESCE(AVG(plugin.file_size), 0) as average_plugin_size',
          'COALESCE(SUM(plugin.download_count), 0) as total_downloads'
        ])
        .where('plugin.status = :status', { status: 'active' })
        .getRawOne();

      const [mostPopular, oldest, newest] = await Promise.all([
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
        })
      ]);

      return {
        totalPlugins: parseInt(statsQuery.total_plugins) || 0,
        totalStorage: parseInt(statsQuery.total_storage) || 0,
        averagePluginSize: Math.round(parseFloat(statsQuery.average_plugin_size) || 0),
        mostPopularPlugin: mostPopular?.name || 'None',
        oldestPlugin: oldest?.name || 'None',
        newestPlugin: newest?.name || 'None',
        totalDownloads: parseInt(statsQuery.total_downloads) || 0
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
      const downloads = await this.downloadRepository
        .createQueryBuilder('download')
        .innerJoin('download.plugin', 'plugin')
        .where('plugin.name = :pluginName', { pluginName })
        .andWhere('plugin.status = :status', { status: 'active' })
        .orderBy('download.download_date', 'DESC')
        .limit(limit)
        .getMany();

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

      // Use PostgreSQL's efficient bulk insert
      await this.pluginRepository
        .createQueryBuilder()
        .insert()
        .into(PluginEntity)
        .values(entities)
        .onConflict('(name) DO NOTHING') // Skip duplicates
        .execute();

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