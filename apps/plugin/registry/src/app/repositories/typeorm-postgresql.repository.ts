import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PluginMetadata } from '@plugin/types';
import {
  IPluginRepository,
  PluginRecord,
  PluginDownloadRecord,
  PluginSearchOptions,
  RepositoryStats,
} from './plugin-repository.interface';
import { PluginEntity, PluginDownloadEntity } from '../entities';

@Injectable()
export class TypeORMPostgreSQLRepository implements IPluginRepository {
  private readonly logger = new Logger(TypeORMPostgreSQLRepository.name);

  // Query result cache with TTL
  private readonly queryCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes default
  private readonly MAX_CACHE_SIZE = 1000;

  // Connection pool monitoring
  private queryMetrics = {
    totalQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageQueryTime: 0,
    slowQueries: 0,
  };

  constructor(
    @InjectRepository(PluginEntity)
    private readonly pluginRepository: Repository<PluginEntity>,
    @InjectRepository(PluginDownloadEntity)
    private readonly downloadRepository: Repository<PluginDownloadEntity>
  ) {
    // Start cache cleanup timer
    this.startCacheCleanup();
  }

  /**
   * Start cache cleanup timer to prevent memory leaks
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // Cleanup every minute
  }

  /**
   * Clean up expired cache entries and enforce size limits
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let removedCount = 0;

    // Remove expired entries
    for (const [key, entry] of this.queryCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.queryCache.delete(key);
        removedCount++;
      }
    }

    // Enforce maximum cache size by removing oldest entries
    if (this.queryCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.queryCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      const excessCount = this.queryCache.size - this.MAX_CACHE_SIZE;
      for (let i = 0; i < excessCount; i++) {
        this.queryCache.delete(entries[i][0]);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.debug(`Cleaned up ${removedCount} expired/excess cache entries`);
    }
  }

  /**
   * Get cached query result if available and not expired
   */
  private getCachedResult<T>(key: string): T | null {
    const entry = this.queryCache.get(key);
    if (!entry) {
      this.queryMetrics.cacheMisses++;
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.queryCache.delete(key);
      this.queryMetrics.cacheMisses++;
      return null;
    }

    this.queryMetrics.cacheHits++;
    return entry.data as T;
  }

  /**
   * Cache query result with TTL
   */
  private setCachedResult(key: string, data: any, ttl: number = this.CACHE_TTL): void {
    this.queryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Execute query with performance monitoring and caching
   */
  private async executeWithMonitoring<T>(
    queryKey: string,
    queryExecutor: () => Promise<T>,
    cacheTTL: number = this.CACHE_TTL,
    enableCache = true
  ): Promise<T> {
    const startTime = Date.now();
    this.queryMetrics.totalQueries++;

    try {
      // Check cache first
      if (enableCache) {
        const cached = this.getCachedResult<T>(queryKey);
        if (cached !== null) {
          return cached;
        }
      }

      // Execute query
      const result = await queryExecutor();
      const queryTime = Date.now() - startTime;

      // Update metrics
      this.queryMetrics.averageQueryTime =
        (this.queryMetrics.averageQueryTime * (this.queryMetrics.totalQueries - 1) + queryTime) /
        this.queryMetrics.totalQueries;

      if (queryTime > 1000) {
        // Queries slower than 1s
        this.queryMetrics.slowQueries++;
        this.logger.warn(`Slow query detected: ${queryKey} took ${queryTime}ms`);
      }

      // Cache result
      if (enableCache) {
        this.setCachedResult(queryKey, result, cacheTTL);
      }

      return result;
    } catch (error) {
      const queryTime = Date.now() - startTime;
      this.logger.error(`Query failed: ${queryKey} (${queryTime}ms)`, error);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    try {
      // PostgreSQL-specific performance optimizations
      await this.pluginRepository.query('SET synchronous_commit = off');
      await this.pluginRepository.query('SET wal_buffers = 16MB');
      await this.pluginRepository.query('SET checkpoint_completion_target = 0.9');
      await this.pluginRepository.query('SET shared_buffers = 256MB');
      await this.pluginRepository.query('SET effective_cache_size = 1GB');
      await this.pluginRepository.query('SET random_page_cost = 1.1');

      // Create additional performance indexes if they don't exist
      try {
        await this.pluginRepository.query(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plugins_search_text 
          ON plugins USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(author, '')))
        `);

        await this.pluginRepository.query(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plugins_tags_gin 
          ON plugins USING gin(tags::jsonb)
        `);

        await this.pluginRepository.query(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plugins_popularity 
          ON plugins (download_count DESC, upload_date DESC)
        `);

        await this.pluginRepository.query(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plugins_recent_active 
          ON plugins (status, upload_date DESC) WHERE status = 'active'
        `);

        this.logger.log('Database performance indexes created successfully');
      } catch (error) {
        this.logger.warn('Some performance indexes may already exist:', error);
      }
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

  async savePlugin(
    metadata: PluginMetadata,
    filePath: string,
    fileSize: number,
    checksum: string
  ): Promise<PluginRecord> {
    try {
      const manifestJson = JSON.stringify(metadata);
      const tags = JSON.stringify([]);
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
          downloadCount: 0,
        })
        .onConflict(
          '(name) DO UPDATE SET ' +
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
        where: { name, status: 'active' },
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
        where: { checksum },
      });
      return plugin ? this.mapEntityToRecord(plugin) : null;
    } catch (error) {
      this.logger.error(`Failed to get plugin by checksum ${checksum}:`, error);
      return null;
    }
  }

  async getAllPlugins(options: PluginSearchOptions = {}): Promise<PluginRecord[]> {
    const { status = 'active', limit = 100, offset = 0, sortBy = 'uploadDate', sortOrder = 'desc' } = options;
    const cacheKey = `getAllPlugins:${status}:${limit}:${offset}:${sortBy}:${sortOrder}`;

    return this.executeWithMonitoring(
      cacheKey,
      async () => {
        const queryBuilder = this.pluginRepository.createQueryBuilder('plugin');

        if (status !== 'all') {
          queryBuilder.where('plugin.status = :status', { status });
        }

        // PostgreSQL-specific optimizations with proper column mapping
        const columnMap: { [key: string]: string } = {
          uploadDate: 'upload_date',
          downloadCount: 'download_count',
          createdAt: 'created_at',
          updatedAt: 'updated_at',
        };

        const dbColumn = columnMap[sortBy] || sortBy;

        // Use index-optimized queries
        queryBuilder
          .orderBy(`plugin.${dbColumn}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
          .limit(Math.min(limit, 1000)) // Prevent excessive memory usage
          .offset(offset);

        // Optimize for common cases
        if (status === 'active' && sortBy === 'uploadDate') {
          // Use partial index for better performance
          queryBuilder.addSelect('plugin.id');
        }

        const plugins = await queryBuilder.getMany();
        return plugins.map((plugin) => this.mapEntityToRecord(plugin));
      },
      // Cache for shorter time for frequently changing data
      2 * 60 * 1000 // 2 minutes
    );
  }

  async searchPlugins(query: string): Promise<PluginRecord[]> {
    const cacheKey = `searchPlugins:${query.toLowerCase().trim()}`;

    return this.executeWithMonitoring(
      cacheKey,
      async () => {
        const sanitizedQuery = query.trim();

        if (!sanitizedQuery) {
          return [];
        }

        const queryBuilder = this.pluginRepository.createQueryBuilder('plugin');

        queryBuilder.where('plugin.status = :status', { status: 'active' });

        // Use full-text search for better performance on PostgreSQL
        if (sanitizedQuery.length > 2) {
          queryBuilder.andWhere(
            "to_tsvector('english', plugin.name || ' ' || COALESCE(plugin.description, '') || ' ' || COALESCE(plugin.author, '')) @@ plainto_tsquery('english', :query)",
            { query: sanitizedQuery }
          );
          // Order by relevance using ts_rank
          queryBuilder
            .addSelect(
              "ts_rank(to_tsvector('english', plugin.name || ' ' || COALESCE(plugin.description, '') || ' ' || COALESCE(plugin.author, '')), plainto_tsquery('english', :query))",
              'relevance'
            )
            .orderBy('relevance', 'DESC')
            .addOrderBy('plugin.downloadCount', 'DESC'); // Secondary sort by popularity
        } else {
          // For short queries, fall back to ILIKE search
          queryBuilder.andWhere(
            '(plugin.name ILIKE :likeQuery OR plugin.description ILIKE :likeQuery OR plugin.author ILIKE :likeQuery)',
            { likeQuery: `%${sanitizedQuery}%` }
          );
          queryBuilder.orderBy('plugin.downloadCount', 'DESC');
        }

        // Limit search results to prevent performance issues
        queryBuilder.limit(100);

        const plugins = await queryBuilder.getMany();
        return plugins.map((plugin) => this.mapEntityToRecord(plugin));
      },
      // Cache search results for longer since they change less frequently
      10 * 60 * 1000 // 10 minutes
    );
  }

  async deletePlugin(name: string): Promise<boolean> {
    try {
      const result = await this.pluginRepository.delete({ name });
      const deleted = Boolean(result.affected && result.affected > 0);

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
      await this.pluginRepository.manager.transaction(async (transactionalEntityManager) => {
        const plugin = await transactionalEntityManager.findOne(PluginEntity, {
          where: { name, status: 'active' },
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
            lastAccessed: new Date(),
          })
          .where('id = :id', { id: plugin.id })
          .execute();

        // Record download history
        await transactionalEntityManager.save(PluginDownloadEntity, {
          pluginId: plugin.id,
          version: plugin.version,
          userAgent,
          ipAddress,
          downloadDate: new Date(),
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
          'COALESCE(SUM(plugin.download_count), 0) as total_downloads',
        ])
        .where('plugin.status = :status', { status: 'active' })
        .getRawOne();

      const [mostPopular, oldest, newest] = await Promise.all([
        this.pluginRepository.findOne({
          where: { status: 'active' },
          order: { downloadCount: 'DESC' },
        }),
        this.pluginRepository.findOne({
          where: { status: 'active' },
          order: { uploadDate: 'ASC' },
        }),
        this.pluginRepository.findOne({
          where: { status: 'active' },
          order: { uploadDate: 'DESC' },
        }),
      ]);

      return {
        totalPlugins: parseInt(statsQuery.total_plugins) || 0,
        totalStorage: parseInt(statsQuery.total_storage) || 0,
        averagePluginSize: Math.round(parseFloat(statsQuery.average_plugin_size) || 0),
        mostPopularPlugin: mostPopular?.name || 'None',
        oldestPlugin: oldest?.name || 'None',
        newestPlugin: newest?.name || 'None',
        totalDownloads: parseInt(statsQuery.total_downloads) || 0,
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

      return downloads.map((download) => ({
        id: download.id,
        pluginId: download.pluginId,
        version: download.version || 'unknown',
        downloadDate: download.downloadDate,
        userAgent: download.userAgent || undefined,
        ipAddress: download.ipAddress || undefined,
      }));
    } catch (error) {
      this.logger.error(`Failed to get download history for ${pluginName}:`, error);
      return [];
    }
  }

  async updatePluginStatus(name: string, status: 'active' | 'deprecated' | 'disabled'): Promise<boolean> {
    try {
      const result = await this.pluginRepository.update({ name }, { status, updatedAt: new Date() });

      const updated = Boolean(result.affected && result.affected > 0);
      if (updated) {
        this.logger.log(`Plugin status updated: ${name} -> ${status}`);
      }

      return updated;
    } catch (error) {
      this.logger.error(`Failed to update plugin status for ${name}:`, error);
      throw error;
    }
  }

  async bulkInsert(
    plugins: Array<{
      metadata: PluginMetadata;
      filePath: string;
      fileSize: number;
      checksum: string;
    }>
  ): Promise<void> {
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
        tags: JSON.stringify([]),
        dependencies: JSON.stringify(metadata.dependencies || []),
        status: 'active' as const,
        downloadCount: 0,
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
      description: entity.description || '',
      author: entity.author || '',
      license: entity.license || '',
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
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * Get comprehensive query performance metrics
   */
  getQueryMetrics(): {
    totalQueries: number;
    cacheHitRate: number;
    averageQueryTime: number;
    slowQueries: number;
    cacheSize: number;
    cacheMemoryUsage: string;
  } {
    const cacheHitRate =
      this.queryMetrics.totalQueries > 0
        ? (this.queryMetrics.cacheHits / (this.queryMetrics.cacheHits + this.queryMetrics.cacheMisses)) * 100
        : 0;

    // Estimate cache memory usage
    const cacheMemoryUsage = (this.queryCache.size * 1024).toLocaleString() + ' bytes (estimated)';

    return {
      totalQueries: this.queryMetrics.totalQueries,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      averageQueryTime: Math.round(this.queryMetrics.averageQueryTime * 100) / 100,
      slowQueries: this.queryMetrics.slowQueries,
      cacheSize: this.queryCache.size,
      cacheMemoryUsage,
    };
  }

  /**
   * Clear query cache and reset metrics
   */
  clearQueryCache(): void {
    this.queryCache.clear();
    this.queryMetrics = {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageQueryTime: 0,
      slowQueries: 0,
    };
    this.logger.log('Query cache and metrics cleared');
  }

  /**
   * Get database connection pool status
   */
  async getConnectionPoolStatus(): Promise<{
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    waitingClients: number;
  }> {
    try {
      const result = await this.pluginRepository.query(`
        SELECT 
          count(*) filter (where state = 'active') as active_connections,
          count(*) filter (where state = 'idle') as idle_connections,
          count(*) as total_connections,
          0 as waiting_clients
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `);

      return (
        result[0] || {
          activeConnections: 0,
          idleConnections: 0,
          totalConnections: 0,
          waitingClients: 0,
        }
      );
    } catch (error) {
      this.logger.error('Failed to get connection pool status:', error);
      return {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        waitingClients: 0,
      };
    }
  }

  /**
   * Analyze query performance and suggest optimizations
   */
  async analyzeQueryPerformance(): Promise<{
    slowQueries: Array<{ query: string; avg_time: number; calls: number }>;
    indexUsage: Array<{
      table: string;
      index: string;
      scans: number;
      tuples_read: number;
    }>;
    suggestions: string[];
  }> {
    try {
      // Get slow queries from pg_stat_statements if available
      const slowQueriesResult = await this.pluginRepository
        .query(
          `
        SELECT 
          query,
          mean_exec_time as avg_time,
          calls
        FROM pg_stat_statements 
        WHERE query LIKE '%plugins%'
        ORDER BY mean_exec_time DESC 
        LIMIT 10
      `
        )
        .catch(() => []);

      // Get index usage statistics
      const indexUsageResult = await this.pluginRepository
        .query(
          `
        SELECT 
          schemaname,
          tablename as table,
          indexname as index,
          idx_scan as scans,
          idx_tup_read as tuples_read
        FROM pg_stat_user_indexes 
        WHERE tablename = 'plugins'
        ORDER BY idx_scan DESC
      `
        )
        .catch(() => []);

      // Generate optimization suggestions
      const suggestions: string[] = [];

      const metrics = this.getQueryMetrics();
      if (metrics.cacheHitRate < 80) {
        suggestions.push('Consider increasing cache TTL or cache size for better hit rate');
      }

      if (metrics.slowQueries > metrics.totalQueries * 0.1) {
        suggestions.push('High number of slow queries detected - review query optimization');
      }

      if (metrics.averageQueryTime > 100) {
        suggestions.push('Average query time is high - consider adding more indexes');
      }

      const connectionPool = await this.getConnectionPoolStatus();
      if (connectionPool.activeConnections > connectionPool.totalConnections * 0.8) {
        suggestions.push('Connection pool utilization is high - consider increasing pool size');
      }

      return {
        slowQueries: slowQueriesResult,
        indexUsage: indexUsageResult,
        suggestions,
      };
    } catch (error) {
      this.logger.error('Failed to analyze query performance:', error);
      return {
        slowQueries: [],
        indexUsage: [],
        suggestions: ['Query performance analysis failed - check database permissions'],
      };
    }
  }

  /**
   * Optimize database tables (VACUUM ANALYZE)
   */
  async optimizeDatabase(): Promise<{
    tablesOptimized: string[];
    duration: number;
  }> {
    const startTime = Date.now();
    const tablesOptimized: string[] = [];

    try {
      this.logger.log('Starting database optimization...');

      // VACUUM ANALYZE for plugins table
      await this.pluginRepository.query('VACUUM ANALYZE plugins');
      tablesOptimized.push('plugins');

      // VACUUM ANALYZE for plugin_downloads table
      await this.pluginRepository.query('VACUUM ANALYZE plugin_downloads');
      tablesOptimized.push('plugin_downloads');

      // Update table statistics
      await this.pluginRepository.query('ANALYZE');

      const duration = Date.now() - startTime;
      this.logger.log(`Database optimization completed in ${duration}ms`);

      return {
        tablesOptimized,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Database optimization failed:', error);
      return {
        tablesOptimized,
        duration,
      };
    }
  }
}
