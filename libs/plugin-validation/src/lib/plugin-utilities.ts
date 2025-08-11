import crypto from 'crypto';
import { sanitizePluginName } from '@libs/shared-utils';

/**
 * Utility functions for plugin management
 */
export class PluginUtils {
  /**
   * Generate a checksum for plugin content
   */
  static generateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
  }

  /**
   * Sanitize plugin name for file system use
   */
  static sanitizePluginName(name: string): string {
    return sanitizePluginName(name);
  }

  /**
   * Generate plugin file name based on name and version
   */
  static generatePluginFileName(name: string, version: string): string {
    const sanitizedName = this.sanitizePluginName(name);
    return `${sanitizedName}-${version}.zip`;
  }

  /**
   * Extract plugin name from file path
   */
  static extractPluginNameFromPath(filePath: string): string {
    const fileName = filePath.split('/').pop() || filePath;
    return fileName.replace(/(-\d+\.\d+\.\d+.*)?\.zip$/, '');
  }


  /**
   * Create plugin route prefix from plugin name
   */
  static createRoutePrefix(pluginName: string): string {
    return `/plugins/${this.sanitizePluginName(pluginName)}`;
  }

  /**
   * Parse plugin dependencies from manifest
   */
  static parseDependencies(dependencies?: string[]): { name: string; version?: string }[] {
    if (!dependencies) return [];

    return dependencies.map((dep) => {
      const [name, version] = dep.split('@');
      return { name, version };
    });
  }

  /**
   * Generate unique plugin ID
   */
  static generatePluginId(name: string, version: string): string {
    return `${this.sanitizePluginName(name)}@${version}`;
  }
}
