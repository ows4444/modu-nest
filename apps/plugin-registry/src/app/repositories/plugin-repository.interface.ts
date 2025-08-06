import { PluginMetadata } from '@modu-nest/plugin-types';

export interface PluginSearchOptions {
  query?: string;
  status?: 'active' | 'deprecated' | 'disabled' | 'all';
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'uploadDate' | 'downloadCount' | 'version';
  sortOrder?: 'asc' | 'desc';
}

export interface PluginRecord {
  id: number;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  manifest: string; // JSON string
  filePath: string;
  fileSize: number;
  checksum: string;
  uploadDate: Date;
  lastAccessed: Date;
  downloadCount: number;
  status: 'active' | 'deprecated' | 'disabled';
  tags: string; // JSON array string
  dependencies: string; // JSON array string
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginDownloadRecord {
  id: number;
  pluginId: number;
  version: string;
  downloadDate: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface RepositoryStats {
  totalPlugins: number;
  totalStorage: number;
  averagePluginSize: number;
  mostPopularPlugin: string;
  oldestPlugin: string;
  newestPlugin: string;
  totalDownloads: number;
}

export interface IPluginRepository {
  /**
   * Initialize the repository (create tables, connections, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Close the repository connection
   */
  close(): Promise<void>;

  /**
   * Save or update a plugin
   */
  savePlugin(metadata: PluginMetadata, filePath: string, fileSize: number, checksum: string): Promise<PluginRecord>;

  /**
   * Get a plugin by name
   */
  getPluginByName(name: string): Promise<PluginRecord | null>;

  /**
   * Get a plugin by checksum
   */
  getPluginByChecksum(checksum: string): Promise<PluginRecord | null>;

  /**
   * Get all plugins with optional filtering
   */
  getAllPlugins(options?: PluginSearchOptions): Promise<PluginRecord[]>;

  /**
   * Search plugins by query
   */
  searchPlugins(query: string): Promise<PluginRecord[]>;

  /**
   * Delete a plugin
   */
  deletePlugin(name: string): Promise<boolean>;

  /**
   * Update download count and record download history
   */
  recordDownload(name: string, userAgent?: string, ipAddress?: string): Promise<void>;

  /**
   * Get repository statistics
   */
  getStats(): Promise<RepositoryStats>;

  /**
   * Check if a plugin exists
   */
  pluginExists(name: string, version?: string): Promise<boolean>;

  /**
   * Get download history for a plugin
   */
  getDownloadHistory(pluginName: string, limit?: number): Promise<PluginDownloadRecord[]>;

  /**
   * Update plugin status
   */
  updatePluginStatus(name: string, status: 'active' | 'deprecated' | 'disabled'): Promise<boolean>;

  /**
   * Bulk operations for performance
   */
  bulkInsert(
    plugins: Array<{ metadata: PluginMetadata; filePath: string; fileSize: number; checksum: string }>
  ): Promise<void>;

  /**
   * Health check for the repository
   */
  healthCheck(): Promise<boolean>;
}
