import * as crypto from 'crypto';
import * as semver from 'semver';

/**
 * Utility functions for plugin management
 */
export class PluginUtils {
  /**
   * Generate a checksum for plugin content
   */
  static generateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Compare two semantic versions
   */
  static compareVersions(version1: string, version2: string): number {
    return semver.compare(version1, version2);
  }

  /**
   * Check if a version is valid semantic version
   */
  static isValidVersion(version: string): boolean {
    return semver.valid(version) !== null;
  }

  /**
   * Sanitize plugin name for file system use
   */
  static sanitizePluginName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
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
   * Format file size in human readable format
   */
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Validate plugin name format
   */
  static isValidPluginName(name: string): boolean {
    return /^[a-z0-9-_]+$/.test(name) && name.length >= 2 && name.length <= 50;
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

    return dependencies.map(dep => {
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