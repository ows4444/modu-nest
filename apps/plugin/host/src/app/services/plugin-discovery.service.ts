import { Injectable, Logger } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { PluginManifest } from '@plugin/core';

export interface PluginDiscovery {
  name: string;
  version: string;
  path: string;
  manifestPath: string;
  manifest: PluginManifest;
  discoveredAt: Date;
}

export interface PluginDiscoveryError {
  pluginDirectory: string;
  pluginPath: string;
  errorType:
    | 'MANIFEST_NOT_FOUND'
    | 'MANIFEST_PARSE_ERROR'
    | 'MANIFEST_VALIDATION_ERROR'
    | 'FILE_ACCESS_ERROR'
    | 'UNKNOWN_ERROR';
  error: Error;
  timestamp: Date;
  retryCount: number;
  details?: {
    fileExists?: boolean;
    manifestContent?: string;
    validationErrors?: string[];
    stackTrace?: string;
  };
}

export interface PluginDiscoveryResult {
  successful: PluginDiscovery[];
  failed: PluginDiscoveryError[];
  totalAttempted: number;
  discoveryTime: number;
  retryAttempts: number;
  performanceMetrics: {
    averageDiscoveryTime: number;
    slowestPlugin: string | null;
    fastestPlugin: string | null;
  };
}

@Injectable()
export class PluginDiscoveryService {
  private readonly logger = new Logger(PluginDiscoveryService.name);
  private readonly discoveryErrors = new Map<string, PluginDiscoveryError>();
  private readonly discoveryPerformanceMetrics = new Map<string, number>();

  /**
   * Discovers all plugins in the configured plugins directory
   */
  async discoverAllPlugins(): Promise<PluginDiscoveryResult> {
    const startTime = Date.now();
    this.logger.log('Starting plugin discovery process...');

    const pluginsDir = process.env.PLUGINS_DIR || './plugins';

    if (!fs.existsSync(pluginsDir)) {
      this.logger.warn(`Plugins directory not found: ${pluginsDir}`);
      return this.createEmptyResult(Date.now() - startTime);
    }

    const directories = this.getPluginDirectories(pluginsDir);
    this.logger.log(`Found ${directories.length} potential plugin directories`);

    const discoveryPromises = directories.map(async (pluginDir) => {
      const startTime = Date.now();
      try {
        const discovery = await this.discoverSinglePlugin(pluginDir);
        const discoveryTime = Date.now() - startTime;
        this.discoveryPerformanceMetrics.set(discovery.name, discoveryTime);
        return { success: true, discovery, error: null };
      } catch (error) {
        const discoveryTime = Date.now() - startTime;
        const discoveryError = await this.createDiscoveryError(pluginDir, error as Error);
        this.discoveryErrors.set(path.basename(pluginDir), discoveryError);
        this.discoveryPerformanceMetrics.set(path.basename(pluginDir), discoveryTime);
        return { success: false, discovery: null, error: discoveryError };
      }
    });

    const results = await Promise.allSettled(discoveryPromises);
    return this.processDiscoveryResults(results, Date.now() - startTime);
  }

  /**
   * Discovers a single plugin from its directory
   */
  async discoverSinglePlugin(pluginPath: string): Promise<PluginDiscovery> {
    const manifestPath = path.join(pluginPath, 'plugin.manifest.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Plugin manifest not found: ${manifestPath}`);
    }

    const manifest = await this.loadManifest(manifestPath);

    return {
      name: manifest.name,
      version: manifest.version,
      path: pluginPath,
      manifestPath,
      manifest,
      discoveredAt: new Date(),
    };
  }

  /**
   * Loads and validates a plugin manifest
   */
  private async loadManifest(manifestPath: string): Promise<PluginManifest> {
    try {
      const manifestContent = await fs.promises.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent) as PluginManifest;

      this.validateManifest(manifest);
      return manifest;
    } catch (error) {
      throw new Error(`Failed to load manifest from ${manifestPath}: ${(error as Error).message}`);
    }
  }

  /**
   * Validates plugin manifest structure and required fields
   */
  private validateManifest(manifest: PluginManifest): void {
    const requiredFields = ['name', 'version', 'main'];
    const missingFields = requiredFields.filter((field) => !(field in manifest));

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields in manifest: ${missingFields.join(', ')}`);
    }

    if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
      throw new Error('Plugin name must be a non-empty string');
    }

    if (typeof manifest.version !== 'string' || manifest.version.trim() === '') {
      throw new Error('Plugin version must be a non-empty string');
    }
  }

  /**
   * Gets all plugin directories from the plugins root directory
   */
  private getPluginDirectories(pluginsDir: string): string[] {
    try {
      const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(pluginsDir, entry.name));
    } catch (error) {
      this.logger.error(`Failed to read plugins directory: ${pluginsDir}`, error);
      return [];
    }
  }

  /**
   * Creates a discovery error object with enhanced details
   */
  private async createDiscoveryError(pluginPath: string, error: Error): Promise<PluginDiscoveryError> {
    const pluginDirectory = path.basename(pluginPath);
    const manifestPath = path.join(pluginPath, 'plugin.manifest.json');

    let errorType: PluginDiscoveryError['errorType'] = 'UNKNOWN_ERROR';
    const details: PluginDiscoveryError['details'] = {};

    // Determine error type based on error message and file system checks
    if (error.message.includes('manifest not found')) {
      errorType = 'MANIFEST_NOT_FOUND';
      details.fileExists = fs.existsSync(manifestPath);
    } else if (error.message.includes('JSON') || error.message.includes('parse')) {
      errorType = 'MANIFEST_PARSE_ERROR';
      try {
        details.manifestContent = await fs.promises.readFile(manifestPath, 'utf8');
      } catch {
        details.manifestContent = 'Could not read file';
      }
    } else if (error.message.includes('Missing required fields') || error.message.includes('validation')) {
      errorType = 'MANIFEST_VALIDATION_ERROR';
      details.validationErrors = [error.message];
    } else if (error.message.includes('ENOENT') || error.message.includes('EACCES')) {
      errorType = 'FILE_ACCESS_ERROR';
    }

    details.stackTrace = error.stack;

    return {
      pluginDirectory,
      pluginPath,
      errorType,
      error,
      timestamp: new Date(),
      retryCount: 0,
      details,
    };
  }

  /**
   * Processes discovery results and creates summary
   */
  private processDiscoveryResults(results: PromiseSettledResult<any>[], totalTime: number): PluginDiscoveryResult {
    const successful: PluginDiscovery[] = [];
    const failed: PluginDiscoveryError[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        successful.push(result.value.discovery);
      } else if (result.status === 'fulfilled' && result.value.error) {
        failed.push(result.value.error);
      } else if (result.status === 'rejected') {
        // Handle unexpected promise rejections
        this.logger.error('Unexpected promise rejection during discovery', result.reason);
      }
    }

    const times = Array.from(this.discoveryPerformanceMetrics.values());
    const averageDiscoveryTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

    let slowestPlugin: string | null = null;
    let fastestPlugin: string | null = null;

    if (times.length > 0) {
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      for (const [plugin, time] of this.discoveryPerformanceMetrics) {
        if (time === maxTime) slowestPlugin = plugin;
        if (time === minTime) fastestPlugin = plugin;
      }
    }

    return {
      successful,
      failed,
      totalAttempted: results.length,
      discoveryTime: totalTime,
      retryAttempts: 0,
      performanceMetrics: {
        averageDiscoveryTime,
        slowestPlugin,
        fastestPlugin,
      },
    };
  }

  /**
   * Creates an empty discovery result for when no plugins directory exists
   */
  private createEmptyResult(totalTime: number): PluginDiscoveryResult {
    return {
      successful: [],
      failed: [],
      totalAttempted: 0,
      discoveryTime: totalTime,
      retryAttempts: 0,
      performanceMetrics: {
        averageDiscoveryTime: 0,
        slowestPlugin: null,
        fastestPlugin: null,
      },
    };
  }

  /**
   * Gets discovery errors for debugging
   */
  getDiscoveryErrors(): Map<string, PluginDiscoveryError> {
    return new Map(this.discoveryErrors);
  }

  /**
   * Gets performance metrics for analysis
   */
  getPerformanceMetrics(): Map<string, number> {
    return new Map(this.discoveryPerformanceMetrics);
  }

  /**
   * Clears cached discovery errors and metrics
   */
  clearCache(): void {
    this.discoveryErrors.clear();
    this.discoveryPerformanceMetrics.clear();
  }
}
