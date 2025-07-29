import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { StorageConfig } from '@modu-nest/plugin-types';
import type { PluginMetadata, PluginPackage, StorageStats } from '@modu-nest/plugin-types';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);

@Injectable()
export class PluginStorageService implements OnModuleInit {
  private readonly logger = new Logger(PluginStorageService.name);
  private readonly config: StorageConfig;
  private plugins = new Map<string, PluginPackage>();

  constructor() {
    const storageRoot = process.env.REGISTRY_STORAGE_PATH || path.join(process.cwd(), 'registry-storage');
    
    this.config = {
      pluginsDir: path.join(storageRoot, 'plugins'),
      metadataFile: path.join(storageRoot, 'metadata.json'),
      maxFileSize: parseInt(process.env.MAX_PLUGIN_SIZE || '52428800', 10), // 50MB default
    };
  }

  async onModuleInit(): Promise<void> {
    await this.initializeStorage();
    await this.loadMetadata();
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

  private async loadMetadata(): Promise<void> {
    try {
      if (fs.existsSync(this.config.metadataFile)) {
        const data = await readFile(this.config.metadataFile, 'utf-8');
        const pluginsArray: PluginPackage[] = JSON.parse(data);
        this.plugins = new Map(pluginsArray.map(p => [p.metadata.name, p]));
        this.logger.log(`Loaded ${this.plugins.size} plugins from metadata`);
      } else {
        this.logger.log('No existing metadata file found, starting with empty registry');
      }
    } catch (error) {
      this.logger.error('Failed to load metadata:', error);
      throw new Error('Metadata loading failed');
    }
  }

  private async saveMetadata(): Promise<void> {
    try {
      const pluginsArray = Array.from(this.plugins.values());
      await writeFile(this.config.metadataFile, JSON.stringify(pluginsArray, null, 2));
      this.logger.debug('Metadata saved successfully');
    } catch (error) {
      this.logger.error('Failed to save metadata:', error);
      throw new Error('Metadata saving failed');
    }
  }

  async storePlugin(metadata: PluginMetadata, pluginBuffer: Buffer): Promise<void> {
    const fileName = `${metadata.name}-${metadata.version}.zip`;
    const filePath = path.join(this.config.pluginsDir, fileName);

    if (pluginBuffer.length > this.config.maxFileSize) {
      throw new Error(`Plugin file too large: ${pluginBuffer.length} bytes (max: ${this.config.maxFileSize})`);
    }

    try {
      await writeFile(filePath, pluginBuffer as any);
      
      const pluginPackage: PluginPackage = {
        metadata,
        filePath: fileName
      };

      this.plugins.set(metadata.name, pluginPackage);
      await this.saveMetadata();

      this.logger.log(`Plugin ${metadata.name} v${metadata.version} stored successfully`);
    } catch (error) {
      this.logger.error(`Failed to store plugin ${metadata.name}:`, error);
      throw new Error(`Plugin storage failed: ${(error as Error).message}`);
    }
  }

  async getPlugin(name: string): Promise<PluginPackage | null> {
    return this.plugins.get(name) || null;
  }

  async getAllPlugins(): Promise<PluginPackage[]> {
    return Array.from(this.plugins.values());
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
      throw new Error(`Plugin ${name} not found`);
    }

    const fullPath = path.join(this.config.pluginsDir, plugin.filePath);
    
    try {
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }

      this.plugins.delete(name);
      await this.saveMetadata();
      
      this.logger.log(`Plugin ${name} deleted successfully`);
    } catch (error) {
      this.logger.error(`Failed to delete plugin ${name}:`, error);
      throw new Error(`Plugin deletion failed: ${(error as Error).message}`);
    }
  }

  async pluginExists(name: string, version?: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    if (version) return plugin.metadata.version === version;
    return true;
  }

  getStorageStats(): StorageStats {
    let totalSize = 0;
    for (const plugin of this.plugins.values()) {
      totalSize += plugin.metadata.fileSize;
    }

    return {
      totalPlugins: this.plugins.size,
      totalSize,
      storageLocation: this.config.pluginsDir
    };
  }
}