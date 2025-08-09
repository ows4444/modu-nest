import crypto from 'crypto';
import semver from 'semver';
import { sanitizePluginName, isValidPluginName } from '@modu-nest/shared/utils';
import { formatFileSize } from '@modu-nest/shared/utils';

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
   * @deprecated Use PluginVersionUtils.compareVersionStrings from same library for more detailed comparison
   */
  static compareVersions(version1: string, version2: string): number {
    return semver.compare(version1, version2);
  }

  /**
   * Check if a version is valid semantic version
   * @deprecated Use PluginVersionUtils.isValidVersion from same library for consistency
   */
  static isValidVersion(version: string): boolean {
    return semver.valid(version) !== null;
  }

  /**
   * Sanitize plugin name for file system use
   * @deprecated Use sanitizePluginName from @modu-nest/shared/utils instead
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
   * Format file size in human readable format
   * @deprecated Use formatFileSize from @modu-nest/shared/utils instead
   */
  static formatFileSize(bytes: number): string {
    return formatFileSize(bytes);
  }

  /**
   * Validate plugin name format
   * @deprecated Use isValidPluginName from @modu-nest/shared/utils instead
   */
  static isValidPluginName(name: string): boolean {
    return isValidPluginName(name);
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
