import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Database } from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { PluginManifest } from '@modu-nest/plugin-types';

export interface DatabasePluginRecord {
  id: number;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  manifest: string; // JSON string
  file_path: string;
  file_size: number;
  checksum: string;
  upload_date: Date;
  last_accessed: Date;
  download_count: number;
  status: 'active' | 'deprecated' | 'disabled';
  tags: string; // JSON array string
  dependencies: string; // JSON array string
  created_at: Date;
  updated_at: Date;
}

export interface DatabaseStats {
  totalPlugins: number;
  totalStorage: number;
  averagePluginSize: number;
  mostPopularPlugin: string;
  oldestPlugin: string;
  newestPlugin: string;
  totalDownloads: number;
  databaseSize: number;
}

export interface BackupInfo {
  filename: string;
  size: number;
  created: Date;
  type: 'full' | 'incremental';
}

@Injectable()
export class PluginDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginDatabaseService.name);
  private db: Database | null = null;
  private dbPath: string;
  private backupDir: string;

  // Configuration from environment variables
  private readonly config = {
    dbPath: process.env.PLUGIN_DB_PATH || path.join(process.cwd(), 'data', 'plugins.db'),
    backupDir: process.env.PLUGIN_BACKUP_DIR || path.join(process.cwd(), 'data', 'backups'),
    autoBackupInterval: parseInt(process.env.PLUGIN_AUTO_BACKUP_INTERVAL || '86400000', 10), // 24 hours
    maxBackups: parseInt(process.env.PLUGIN_MAX_BACKUPS || '30', 10),
    enableWAL: process.env.PLUGIN_DB_WAL_MODE === 'true',
    connectionTimeout: parseInt(process.env.PLUGIN_DB_TIMEOUT || '30000', 10),
  };

  private backupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.dbPath = this.config.dbPath;
    this.backupDir = this.config.backupDir;
  }

  async onModuleInit(): Promise<void> {
    await this.initializeDatabase();
    await this.runMigrations();
    
    // Start automatic backup schedule
    if (this.config.autoBackupInterval > 0) {
      this.startAutoBackup();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
    }
    await this.closeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        this.logger.log(`Created data directory: ${dataDir}`);
      }

      // Ensure backup directory exists
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
        this.logger.log(`Created backup directory: ${this.backupDir}`);
      }

      // Open database connection
      this.db = new Database(this.dbPath, (err) => {
        if (err) {
          this.logger.error('Failed to open database:', err);
          throw err;
        }
        this.logger.log(`Database opened: ${this.dbPath}`);
      });

      // Configure database settings
      await this.executeQuery('PRAGMA foreign_keys = ON');
      await this.executeQuery('PRAGMA journal_mode = WAL');
      await this.executeQuery('PRAGMA synchronous = NORMAL');
      await this.executeQuery('PRAGMA cache_size = 10000');
      await this.executeQuery('PRAGMA temp_store = MEMORY');

      this.logger.log('Database initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async runMigrations(): Promise<void> {
    try {
      // Create migrations table if it doesn't exist
      await this.executeQuery(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL UNIQUE,
          name TEXT NOT NULL,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const migrations = [
        {
          version: 1,
          name: 'initial_schema',
          sql: `
            CREATE TABLE IF NOT EXISTS plugins (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              version TEXT NOT NULL,
              description TEXT,
              author TEXT,
              license TEXT,
              manifest TEXT NOT NULL,
              file_path TEXT NOT NULL,
              file_size INTEGER NOT NULL,
              checksum TEXT NOT NULL UNIQUE,
              upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
              last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
              download_count INTEGER DEFAULT 0,
              status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'disabled')),
              tags TEXT DEFAULT '[]',
              dependencies TEXT DEFAULT '[]',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);
            CREATE INDEX IF NOT EXISTS idx_plugins_checksum ON plugins(checksum);
            CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
            CREATE INDEX IF NOT EXISTS idx_plugins_upload_date ON plugins(upload_date);
          `
        },
        {
          version: 2,
          name: 'add_plugin_versions_table',
          sql: `
            CREATE TABLE IF NOT EXISTS plugin_versions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              plugin_id INTEGER NOT NULL,
              version TEXT NOT NULL,
              manifest TEXT NOT NULL,
              file_path TEXT NOT NULL,
              file_size INTEGER NOT NULL,
              checksum TEXT NOT NULL UNIQUE,
              upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
              is_latest BOOLEAN DEFAULT 0,
              FOREIGN KEY (plugin_id) REFERENCES plugins (id) ON DELETE CASCADE,
              UNIQUE(plugin_id, version)
            );

            CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin_id ON plugin_versions(plugin_id);
            CREATE INDEX IF NOT EXISTS idx_plugin_versions_version ON plugin_versions(version);
            CREATE INDEX IF NOT EXISTS idx_plugin_versions_latest ON plugin_versions(is_latest);
          `
        },
        {
          version: 3,
          name: 'add_download_history_table',
          sql: `
            CREATE TABLE IF NOT EXISTS download_history (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              plugin_id INTEGER NOT NULL,
              version TEXT,
              download_date DATETIME DEFAULT CURRENT_TIMESTAMP,
              user_agent TEXT,
              ip_address TEXT,
              FOREIGN KEY (plugin_id) REFERENCES plugins (id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_download_history_plugin_id ON download_history(plugin_id);
            CREATE INDEX IF NOT EXISTS idx_download_history_date ON download_history(download_date);
          `
        }
      ];

      for (const migration of migrations) {
        const existing = await this.queryOne<{ version: number }>(
          'SELECT version FROM migrations WHERE version = ?',
          [migration.version]
        );

        if (!existing) {
          this.logger.log(`Running migration ${migration.version}: ${migration.name}`);
          
          // Execute migration SQL (multiple statements)
          const statements = migration.sql.split(';').filter(stmt => stmt.trim());
          for (const statement of statements) {
            if (statement.trim()) {
              await this.executeQuery(statement);
            }
          }

          // Record migration
          await this.executeQuery(
            'INSERT INTO migrations (version, name) VALUES (?, ?)',
            [migration.version, migration.name]
          );

          this.logger.log(`Migration ${migration.version} completed`);
        }
      }

      this.logger.log('All migrations completed successfully');
    } catch (error) {
      this.logger.error('Migration failed:', error);
      throw error;
    }
  }

  async savePlugin(manifest: PluginManifest, filePath: string, fileSize: number, checksum: string): Promise<DatabasePluginRecord> {
    try {
      const now = new Date();
      const manifestJson = JSON.stringify(manifest);
      const tags = JSON.stringify(manifest.tags || []);
      const dependencies = JSON.stringify(manifest.dependencies || []);

      await this.executeQuery(
        `INSERT INTO plugins (
          name, version, description, author, license, manifest,
          file_path, file_size, checksum, upload_date, last_accessed,
          tags, dependencies, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          version = excluded.version,
          description = excluded.description,
          manifest = excluded.manifest,
          file_path = excluded.file_path,
          file_size = excluded.file_size,
          checksum = excluded.checksum,
          updated_at = excluded.updated_at`,
        [
          manifest.name,
          manifest.version,
          manifest.description || '',
          manifest.author || '',
          manifest.license || '',
          manifestJson,
          filePath,
          fileSize,
          checksum,
          now,
          now,
          tags,
          dependencies,
          now,
          now
        ]
      );

      // Get the inserted/updated record
      const plugin = await this.getPluginByName(manifest.name);
      if (!plugin) {
        throw new Error(`Failed to retrieve saved plugin: ${manifest.name}`);
      }

      this.logger.log(`Plugin saved to database: ${manifest.name} v${manifest.version}`);
      return plugin;
    } catch (error) {
      this.logger.error(`Failed to save plugin ${manifest.name}:`, error);
      throw error;
    }
  }

  async getPluginByName(name: string): Promise<DatabasePluginRecord | null> {
    return this.queryOne<DatabasePluginRecord>(
      'SELECT * FROM plugins WHERE name = ? AND status = "active"',
      [name]
    );
  }

  async getPluginByChecksum(checksum: string): Promise<DatabasePluginRecord | null> {
    return this.queryOne<DatabasePluginRecord>(
      'SELECT * FROM plugins WHERE checksum = ?',
      [checksum]
    );
  }

  async getAllPlugins(status: 'active' | 'deprecated' | 'disabled' | 'all' = 'active'): Promise<DatabasePluginRecord[]> {
    const whereClause = status === 'all' ? '' : 'WHERE status = ?';
    const params = status === 'all' ? [] : [status];
    
    return this.queryAll<DatabasePluginRecord>(
      `SELECT * FROM plugins ${whereClause} ORDER BY upload_date DESC`,
      params
    );
  }

  async searchPlugins(query: string): Promise<DatabasePluginRecord[]> {
    return this.queryAll<DatabasePluginRecord>(
      `SELECT * FROM plugins 
       WHERE status = 'active' AND (
         name LIKE ? OR 
         description LIKE ? OR 
         author LIKE ? OR
         tags LIKE ?
       )
       ORDER BY name ASC`,
      [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]
    );
  }

  async deletePlugin(name: string): Promise<boolean> {
    try {
      const plugin = await this.getPluginByName(name);
      if (!plugin) {
        return false;
      }

      // Delete file if it exists
      if (fs.existsSync(plugin.file_path)) {
        fs.unlinkSync(plugin.file_path);
        this.logger.log(`File deleted: ${plugin.file_path}`);
      }

      // Delete from database
      await this.executeQuery(
        'DELETE FROM plugins WHERE name = ?',
        [name]
      );

      this.logger.log(`Plugin deleted from database: ${name}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete plugin ${name}:`, error);
      throw error;
    }
  }

  async updateDownloadCount(name: string, userAgent?: string, ipAddress?: string): Promise<void> {
    try {
      const plugin = await this.getPluginByName(name);
      if (!plugin) {
        throw new Error(`Plugin not found: ${name}`);
      }

      // Update download count and last accessed
      await this.executeQuery(
        'UPDATE plugins SET download_count = download_count + 1, last_accessed = ? WHERE name = ?',
        [new Date(), name]
      );

      // Record download history
      await this.executeQuery(
        'INSERT INTO download_history (plugin_id, version, user_agent, ip_address) VALUES (?, ?, ?, ?)',
        [plugin.id, plugin.version, userAgent || null, ipAddress || null]
      );

      this.logger.debug(`Download recorded for plugin: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to update download count for ${name}:`, error);
      throw error;
    }
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    try {
      const totalPlugins = await this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM plugins WHERE status = "active"');
      const totalStorage = await this.queryOne<{ total: number }>('SELECT SUM(file_size) as total FROM plugins WHERE status = "active"');
      const avgSize = await this.queryOne<{ avg: number }>('SELECT AVG(file_size) as avg FROM plugins WHERE status = "active"');
      const mostPopular = await this.queryOne<{ name: string }>('SELECT name FROM plugins WHERE status = "active" ORDER BY download_count DESC LIMIT 1');
      const oldest = await this.queryOne<{ name: string }>('SELECT name FROM plugins WHERE status = "active" ORDER BY upload_date ASC LIMIT 1');
      const newest = await this.queryOne<{ name: string }>('SELECT name FROM plugins WHERE status = "active" ORDER BY upload_date DESC LIMIT 1');
      const totalDownloads = await this.queryOne<{ total: number }>('SELECT SUM(download_count) as total FROM plugins WHERE status = "active"');

      // Get database file size
      const dbStats = fs.statSync(this.dbPath);

      return {
        totalPlugins: totalPlugins?.count || 0,
        totalStorage: totalStorage?.total || 0,
        averagePluginSize: Math.round(avgSize?.avg || 0),
        mostPopularPlugin: mostPopular?.name || 'None',
        oldestPlugin: oldest?.name || 'None',
        newestPlugin: newest?.name || 'None',
        totalDownloads: totalDownloads?.total || 0,
        databaseSize: dbStats.size,
      };
    } catch (error) {
      this.logger.error('Failed to get database stats:', error);
      throw error;
    }
  }

  async createBackup(type: 'full' | 'incremental' = 'full'): Promise<BackupInfo> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `plugin-registry-${type}-${timestamp}.db`;
      const backupPath = path.join(this.backupDir, backupFilename);

      if (type === 'full') {
        // Full backup - copy entire database
        await this.executeQuery('BEGIN IMMEDIATE');
        fs.copyFileSync(this.dbPath, backupPath);
        await this.executeQuery('COMMIT');
      } else {
        // Incremental backup - dump only recent changes
        // For SQLite, we'll do a full backup as incremental is complex
        fs.copyFileSync(this.dbPath, backupPath);
      }

      const backupStats = fs.statSync(backupPath);
      const backupInfo: BackupInfo = {
        filename: backupFilename,
        size: backupStats.size,
        created: new Date(),
        type,
      };

      // Clean up old backups
      await this.cleanupOldBackups();

      this.logger.log(`Database backup created: ${backupFilename} (${backupStats.size} bytes)`);
      return backupInfo;
    } catch (error) {
      this.logger.error('Failed to create backup:', error);
      throw error;
    }
  }

  async restoreBackup(backupFilename: string): Promise<void> {
    try {
      const backupPath = path.join(this.backupDir, backupFilename);
      
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupFilename}`);
      }

      // Close current database connection
      await this.closeDatabase();

      // Replace current database with backup
      fs.copyFileSync(backupPath, this.dbPath);
      
      // Reinitialize database connection
      await this.initializeDatabase();

      this.logger.log(`Database restored from backup: ${backupFilename}`);
    } catch (error) {
      this.logger.error(`Failed to restore backup ${backupFilename}:`, error);
      throw error;
    }
  }

  async listBackups(): Promise<BackupInfo[]> {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return [];
      }

      const files = fs.readdirSync(this.backupDir);
      const backups: BackupInfo[] = [];

      for (const file of files) {
        if (file.endsWith('.db')) {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          const type = file.includes('-full-') ? 'full' : 'incremental';
          
          backups.push({
            filename: file,
            size: stats.size,
            created: stats.mtime,
            type,
          });
        }
      }

      return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
    } catch (error) {
      this.logger.error('Failed to list backups:', error);
      throw error;
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      
      if (backups.length > this.config.maxBackups) {
        const backupsToDelete = backups.slice(this.config.maxBackups);
        
        for (const backup of backupsToDelete) {
          const backupPath = path.join(this.backupDir, backup.filename);
          fs.unlinkSync(backupPath);
          this.logger.log(`Old backup deleted: ${backup.filename}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old backups:', error);
    }
  }

  private startAutoBackup(): void {
    this.backupTimer = setInterval(async () => {
      try {
        await this.createBackup('full');
        this.logger.log('Automatic backup completed');
      } catch (error) {
        this.logger.error('Automatic backup failed:', error);
      }
    }, this.config.autoBackupInterval);
    
    this.logger.log(`Automatic backup scheduled every ${this.config.autoBackupInterval / 1000 / 60} minutes`);
  }

  private async closeDatabase(): Promise<void> {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) {
            this.logger.error('Error closing database:', err);
            reject(err);
          } else {
            this.logger.log('Database connection closed');
            this.db = null;
            resolve();
          }
        });
      });
    }
  }

  private async executeQuery(sql: string, params: any[] = []): Promise<any> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes, lastID: this.lastID });
        }
      });
    });
  }

  private async queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T || null);
        }
      });
    });
  }

  private async queryAll<T>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[] || []);
        }
      });
    });
  }
}