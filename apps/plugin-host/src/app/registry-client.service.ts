import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosInstance, AxiosError } from 'axios';
import fs from 'fs';
import { writeFile, mkdir, readFile } from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import FormData from 'form-data';
import { PluginManifest, LoadedPlugin, PluginUpdateInfo } from '@modu-nest/plugin-types';

// Registry-specific interfaces
export interface RegistryPluginMetadata extends PluginManifest {
  uploadedAt: string;
  fileSize: number;
  checksum: string;
}

export interface RegistryClientConfig {
  registryUrl: string;
  timeout: number;
  pluginsDir: string;
}

@Injectable()
export class RegistryClientService {
  private readonly logger = new Logger(RegistryClientService.name);
  private readonly httpClient: AxiosInstance;
  private readonly config: RegistryClientConfig;

  constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();

    this.httpClient = axios.create({
      baseURL: this.config.registryUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
    this.logger.log(`Registry client initialized with URL: ${this.config.registryUrl}`);
  }

  private loadConfiguration(): RegistryClientConfig {
    return {
      registryUrl: process.env.PLUGIN_REGISTRY_URL || 'http://localhost:3001',
      timeout: parseInt(process.env.REGISTRY_TIMEOUT || '30000', 10),
      pluginsDir: process.env.PLUGINS_DIR || path.join(__dirname, 'assets', 'plugins'),
    };
  }

  private validateConfiguration(): void {
    if (!this.config.registryUrl) {
      throw new Error('Registry URL is required');
    }

    try {
      new URL(this.config.registryUrl);
    } catch {
      throw new Error(`Invalid registry URL: ${this.config.registryUrl}`);
    }

    if (this.config.timeout <= 0 || this.config.timeout > 300000) {
      throw new Error(`Invalid timeout value: ${this.config.timeout}. Must be between 1 and 300000ms`);
    }

    if (!path.isAbsolute(this.config.pluginsDir)) {
      this.config.pluginsDir = path.resolve(this.config.pluginsDir);
    }

    this.logger.debug(`Configuration validated: ${JSON.stringify(this.config)}`);
  }

  private setupInterceptors(): void {
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          this.logger.error(`Registry API error: ${error.response.status} - ${error.response.statusText}`);
        } else if (error.request) {
          this.logger.error('Registry connection error: No response received');
        } else {
          this.logger.error(`Registry request error: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  async listAvailablePlugins(): Promise<RegistryPluginMetadata[]> {
    try {
      this.logger.debug('Fetching available plugins from registry');
      const pluginListResponse = await this.httpClient.get<RegistryPluginMetadata[]>('/api/plugins');
      this.logger.log(`Found ${pluginListResponse.data.length} plugins in registry`);
      return pluginListResponse.data;
    } catch (error) {
      this.handleRegistryError('Failed to fetch plugins from registry', error);
      throw new HttpException('Failed to connect to plugin registry', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async getPluginInfo(name: string): Promise<RegistryPluginMetadata> {
    if (!name?.trim()) {
      throw new HttpException('Plugin name is required', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.debug(`Fetching plugin info for: ${name}`);
      const pluginInfoResponse = await this.httpClient.get<RegistryPluginMetadata>(`/api/plugins/${name}`);
      return pluginInfoResponse.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new HttpException(`Plugin ${name} not found in registry`, HttpStatus.NOT_FOUND);
      }
      this.handleRegistryError(`Failed to get plugin info for ${name}`, error);
      throw new HttpException(`Failed to retrieve plugin ${name}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private handleRegistryError(message: string, error: unknown): void {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      this.logger.error(`${message}: ${status} ${statusText}`, error.stack);
    } else {
      this.logger.error(`${message}:`, error);
    }
  }

  async downloadAndInstallPlugin(name: string): Promise<void> {
    if (!name?.trim()) {
      throw new HttpException('Plugin name is required', HttpStatus.BAD_REQUEST);
    }

    const pluginDir = path.join(this.config.pluginsDir, name);

    try {
      this.logger.log(`Downloading plugin ${name} from registry...`);

      // Get plugin info first
      const pluginInfoResponse = await this.httpClient.get(`/api/plugins/${name}`);
      this.logger.debug(`Plugin info: ${pluginInfoResponse.data.name} v${pluginInfoResponse.data.version}`);

      // Download the plugin file
      const pluginDownloadResponse = await this.httpClient.get(`/api/plugins/${name}/download`, {
        responseType: 'arraybuffer',
        headers: {
          'Content-Type': undefined,
          Accept: 'application/zip, application/octet-stream, */*',
        },
      });

      const pluginBuffer = Buffer.from(pluginDownloadResponse.data);
      this.logger.debug(`Downloaded ${pluginBuffer.length} bytes`);

      await this.extractPluginToDirectory(pluginBuffer, pluginDir, name);

      this.logger.log(`Plugin ${name} installed successfully to ${pluginDir}`);
    } catch (error) {
      this.handleRegistryError(`Failed to download and install plugin ${name}`, error);

      // Cleanup on failure
      await this.cleanupPluginDirectory(pluginDir);

      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new HttpException(`Plugin ${name} not found in registry`, HttpStatus.NOT_FOUND);
      }

      throw new HttpException(`Failed to install plugin ${name} from registry`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private async extractPluginToDirectory(pluginBuffer: Buffer, pluginDir: string, pluginName: string): Promise<void> {
    try {
      // Ensure plugin directory exists
      await mkdir(pluginDir, { recursive: true });

      const zip = new JSZip();
      const contents = await zip.loadAsync(pluginBuffer.buffer as ArrayBuffer);

      // Validate plugin structure
      const manifestFile = contents.file('plugin.manifest.json');
      if (!manifestFile) {
        throw new Error('Plugin manifest not found in downloaded package');
      }

      // Extract all files from the zip
      for (const [filename, zipObject] of Object.entries(contents.files)) {
        if (!zipObject.dir && this.isValidPluginFile(filename)) {
          const content = await zipObject.async('uint8array');
          const filePath = path.join(pluginDir, filename);

          // Ensure directory exists
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, content);

          this.logger.debug(`Extracted: ${filename}`);
        }
      }

      // Verify installation
      await this.validatePluginInstallation(pluginDir, pluginName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to extract plugin: ${message}`);
    }
  }

  private isValidPluginFile(filename: string): boolean {
    const allowedExtensions = ['.js', '.json', '.md', '.txt'];
    const allowedDirs = ['dist/', 'src/', 'lib/'];

    // Allow files in root or specific directories
    if (!filename.includes('/')) {
      return allowedExtensions.some((ext) => filename.endsWith(ext));
    }

    return allowedDirs.some((dir) => filename.startsWith(dir));
  }

  private async validatePluginInstallation(pluginDir: string, pluginName: string): Promise<void> {
    const manifestPath = path.join(pluginDir, 'plugin.manifest.json');
    const indexPath = path.join(pluginDir, 'index.js');

    if (!fs.existsSync(manifestPath)) {
      throw new Error('Plugin manifest not found after installation');
    }

    if (!fs.existsSync(indexPath)) {
      throw new Error('Plugin entry point (index.js) not found after installation');
    }

    // Validate manifest content
    const manifestContent = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    if (manifest.name !== pluginName) {
      throw new Error(`Plugin name mismatch: expected ${pluginName}, got ${manifest.name}`);
    }

    this.logger.debug(`Plugin ${pluginName} installation validated`);
  }

  private async cleanupPluginDirectory(pluginDir: string): Promise<void> {
    try {
      if (fs.existsSync(pluginDir)) {
        await fs.promises.rm(pluginDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up plugin directory: ${pluginDir}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup plugin directory ${pluginDir}:`, error);
    }
  }

  async checkPluginUpdates(installedPlugins: Map<string, LoadedPlugin>): Promise<PluginUpdateInfo[]> {
    try {
      this.logger.debug('Checking for plugin updates...');
      const availablePlugins = await this.listAvailablePlugins();
      const updates: PluginUpdateInfo[] = [];

      for (const [pluginName, installedPlugin] of installedPlugins) {
        const registryPlugin = availablePlugins.find((p) => p.name === pluginName);
        if (registryPlugin && this.isUpdateAvailable(installedPlugin.manifest.version, registryPlugin.version)) {
          updates.push({
            name: pluginName,
            currentVersion: installedPlugin.manifest.version,
            availableVersion: registryPlugin.version,
          });
        }
      }

      this.logger.log(`Found ${updates.length} plugin updates available`);
      return updates;
    } catch (error) {
      this.handleRegistryError('Failed to check plugin updates', error);
      return [];
    }
  }

  private isUpdateAvailable(currentVersion: string, availableVersion: string): boolean {
    // Simple version comparison (could be enhanced with semver)
    return currentVersion !== availableVersion;
  }

  async uploadPlugin(pluginPath: string): Promise<RegistryPluginMetadata> {
    if (!pluginPath?.trim()) {
      throw new HttpException('Plugin path is required', HttpStatus.BAD_REQUEST);
    }

    if (!fs.existsSync(pluginPath)) {
      throw new HttpException(`Plugin file not found: ${pluginPath}`, HttpStatus.NOT_FOUND);
    }

    try {
      this.logger.log(`Uploading plugin from ${pluginPath}...`);

      const pluginBuffer = await readFile(pluginPath);
      const formData = new FormData();
      formData.append('plugin', pluginBuffer, {
        filename: path.basename(pluginPath),
        contentType: 'application/zip',
      });

      const uploadResponse = await this.httpClient.post<RegistryPluginMetadata>('/api/plugins', formData, {
        headers: {
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      this.logger.log(`Plugin uploaded successfully: ${uploadResponse.data.name} v${uploadResponse.data.version}`);
      return uploadResponse.data;
    } catch (error) {
      this.handleRegistryError('Failed to upload plugin to registry', error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 409) {
          throw new HttpException('Plugin version already exists', HttpStatus.CONFLICT);
        }
        if (error.response?.status === 400) {
          throw new HttpException('Invalid plugin file or manifest', HttpStatus.BAD_REQUEST);
        }
      }

      throw new HttpException('Failed to upload plugin to registry', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async isRegistryAvailable(): Promise<boolean> {
    try {
      await this.httpClient.get('/api/health');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug('Registry unavailable:', message);
      return false;
    }
  }

  getRegistryUrl(): string {
    return this.config.registryUrl;
  }

  getPluginsDirectory(): string {
    return this.config.pluginsDir;
  }
}
