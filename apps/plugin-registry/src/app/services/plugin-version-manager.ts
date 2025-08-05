/**
 * Plugin Version Manager Service
 * 
 * Provides comprehensive version management capabilities for plugins including:
 * - Multiple version storage and retrieval
 * - Semantic version comparison and validation
 * - Version rollback and promotion capabilities
 * - Version lifecycle management
 * - Compatibility and migration support
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PluginEntity } from '../entities/plugin.entity';
import { PluginVersionEntity } from '../entities/plugin-version.entity';
import { PluginEventEmitter } from '@modu-nest/plugin-types';
import * as semver from 'semver';

export interface PluginVersionInfo {
  name: string;
  version: string;
  status: PluginVersionStatus;
  isActive: boolean;
  uploadDate: Date;
  fileSize: number;
  checksum: string;
  downloadCount: number;
  rollbackTarget?: boolean;
}

export interface VersionRollbackOptions {
  preserveCurrentVersion?: boolean;
  rollbackReason?: string;
  performBackup?: boolean;
  validateCompatibility?: boolean;
}

export interface VersionPromotionResult {
  success: boolean;
  previousActiveVersion?: string;
  newActiveVersion: string;
  affectedDependents?: string[];
  warnings?: string[];
}

export enum PluginVersionStatus {
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  DISABLED = 'disabled',
  ARCHIVED = 'archived',
  ROLLBACK_TARGET = 'rollback_target'
}

export interface VersionCompatibilityCheck {
  isCompatible: boolean;
  compatibilityIssues: string[];
  migrationRequired: boolean;
  deprecatedFeatures: string[];
  breakingChanges: string[];
}

@Injectable()
export class PluginVersionManager {
  private readonly logger = new Logger(PluginVersionManager.name);

  constructor(
    @InjectRepository(PluginEntity)
    private readonly pluginRepository: Repository<PluginEntity>,
    @InjectRepository(PluginVersionEntity)
    private readonly versionRepository: Repository<PluginVersionEntity>,
    private readonly eventEmitter: PluginEventEmitter
  ) {}

  /**
   * Get all versions of a plugin sorted by semantic version (latest first)
   */
  async getPluginVersions(pluginName: string): Promise<PluginVersionInfo[]> {
    this.logger.debug(`Getting all versions for plugin: ${pluginName}`);

    const versions = await this.versionRepository.find({
      where: { pluginName },
      order: { uploadDate: 'DESC' }
    });

    // Sort by semantic version (latest first)
    const sortedVersions = versions.sort((a, b) => {
      const versionA = semver.coerce(a.version);
      const versionB = semver.coerce(b.version);
      
      if (!versionA || !versionB) {
        // Fallback to string comparison if semantic version parsing fails
        return b.version.localeCompare(a.version);
      }
      
      return semver.rcompare(versionA, versionB);
    });

    return sortedVersions.map(version => ({
      name: version.pluginName,
      version: version.version,
      status: version.status as PluginVersionStatus,
      isActive: version.isActive,
      uploadDate: version.uploadDate,
      fileSize: version.fileSize,
      checksum: version.checksum,
      downloadCount: version.downloadCount,
      rollbackTarget: version.status === PluginVersionStatus.ROLLBACK_TARGET
    }));
  }

  /**
   * Get the active version of a plugin
   */
  async getActiveVersion(pluginName: string): Promise<PluginVersionInfo | null> {
    this.logger.debug(`Getting active version for plugin: ${pluginName}`);

    const activeVersion = await this.versionRepository.findOne({
      where: { 
        pluginName, 
        isActive: true,
        status: PluginVersionStatus.ACTIVE
      }
    });

    if (!activeVersion) {
      return null;
    }

    return {
      name: activeVersion.pluginName,
      version: activeVersion.version,
      status: activeVersion.status as PluginVersionStatus,
      isActive: activeVersion.isActive,
      uploadDate: activeVersion.uploadDate,
      fileSize: activeVersion.fileSize,
      checksum: activeVersion.checksum,
      downloadCount: activeVersion.downloadCount
    };
  }

  /**
   * Get a specific version of a plugin
   */
  async getPluginVersion(pluginName: string, version: string): Promise<PluginVersionEntity | null> {
    this.logger.debug(`Getting version ${version} for plugin: ${pluginName}`);

    return await this.versionRepository.findOne({
      where: { pluginName, version }
    });
  }

  /**
   * Add a new version of a plugin
   */
  async addPluginVersion(
    pluginData: Partial<PluginEntity>,
    makeActive = true
  ): Promise<PluginVersionEntity> {
    this.logger.log(`Adding new version ${pluginData.version} for plugin: ${pluginData.name}`);

    // Check if this version already exists
    const existingVersion = await this.getPluginVersion(pluginData.name!, pluginData.version!);
    if (existingVersion) {
      throw new Error(`Version ${pluginData.version} already exists for plugin ${pluginData.name}`);
    }

    // Validate semantic version
    if (!semver.valid(pluginData.version)) {
      this.logger.warn(`Invalid semantic version ${pluginData.version}, but allowing it`);
    }

    // Create new version entity
    const newVersion = new PluginVersionEntity();
    newVersion.pluginName = pluginData.name!;
    newVersion.version = pluginData.version!;
    newVersion.description = pluginData.description || '';
    newVersion.author = pluginData.author || '';
    newVersion.license = pluginData.license || '';
    newVersion.manifest = pluginData.manifest!;
    newVersion.filePath = pluginData.filePath!;
    newVersion.fileSize = pluginData.fileSize!;
    newVersion.checksum = pluginData.checksum!;
    newVersion.uploadDate = pluginData.uploadDate || new Date();
    newVersion.tags = pluginData.tags || '[]';
    newVersion.dependencies = pluginData.dependencies || '[]';
    newVersion.status = PluginVersionStatus.ACTIVE;
    newVersion.isActive = false; // Will be set in promote step
    newVersion.downloadCount = 0;

    const savedVersion = await this.versionRepository.save(newVersion);

    // Make this version active if requested
    if (makeActive) {
      await this.promoteVersion(pluginData.name!, pluginData.version!);
    }

    // Emit version added event
    this.eventEmitter.emit('plugin-version-added', {
      pluginName: pluginData.name!,
      version: pluginData.version!,
      isActive: makeActive,
      uploadDate: savedVersion.uploadDate
    });

    this.logger.log(`Successfully added version ${pluginData.version} for plugin: ${pluginData.name}`);
    return savedVersion;
  }

  /**
   * Promote a specific version to be the active version
   */
  async promoteVersion(pluginName: string, version: string): Promise<VersionPromotionResult> {
    this.logger.log(`Promoting version ${version} to active for plugin: ${pluginName}`);

    // Get the version to promote
    const targetVersion = await this.getPluginVersion(pluginName, version);
    if (!targetVersion) {
      throw new Error(`Version ${version} not found for plugin ${pluginName}`);
    }

    // Get current active version
    const currentActive = await this.getActiveVersion(pluginName);
    
    // Start transaction
    await this.versionRepository.manager.transaction(async manager => {
      // Deactivate all current versions
      await manager.update(
        PluginVersionEntity,
        { pluginName, isActive: true },
        { isActive: false }
      );

      // Activate the target version
      await manager.update(
        PluginVersionEntity,
        { pluginName, version },
        { 
          isActive: true,
          status: PluginVersionStatus.ACTIVE
        }
      );

      // Update the main plugin entity if it exists
      const mainPlugin = await manager.findOne(PluginEntity, { where: { name: pluginName } });
      if (mainPlugin) {
        mainPlugin.version = version;
        mainPlugin.description = targetVersion.description;
        mainPlugin.author = targetVersion.author;
        mainPlugin.license = targetVersion.license;
        mainPlugin.manifest = targetVersion.manifest;
        mainPlugin.filePath = targetVersion.filePath;
        mainPlugin.fileSize = targetVersion.fileSize;
        mainPlugin.checksum = targetVersion.checksum;
        mainPlugin.tags = targetVersion.tags;
        mainPlugin.dependencies = targetVersion.dependencies;
        mainPlugin.updatedAt = new Date();
        await manager.save(mainPlugin);
      }
    });

    const result: VersionPromotionResult = {
      success: true,
      previousActiveVersion: currentActive?.version,
      newActiveVersion: version,
      affectedDependents: await this.findDependentPlugins(pluginName),
      warnings: []
    };

    // Check for compatibility issues
    if (currentActive && currentActive.version !== version) {
      const compatibility = await this.checkVersionCompatibility(
        pluginName, 
        currentActive.version, 
        version
      );
      
      if (!compatibility.isCompatible) {
        result.warnings = compatibility.compatibilityIssues;
      }
    }

    // Emit version promoted event
    this.eventEmitter.emit('plugin-version-promoted', {
      pluginName,
      fromVersion: currentActive?.version,
      toVersion: version,
      promotionDate: new Date()
    });

    this.logger.log(`Successfully promoted version ${version} for plugin: ${pluginName}`);
    return result;
  }

  /**
   * Rollback to a previous version
   */
  async rollbackToVersion(
    pluginName: string, 
    targetVersion: string,
    options: VersionRollbackOptions = {}
  ): Promise<VersionPromotionResult> {
    this.logger.log(`Rolling back plugin ${pluginName} to version ${targetVersion}`);

    const {
      preserveCurrentVersion = true,
      rollbackReason = 'Manual rollback',
      performBackup = true,
      validateCompatibility = true
    } = options;

    // Get current active version
    const currentActive = await this.getActiveVersion(pluginName);
    if (!currentActive) {
      throw new Error(`No active version found for plugin ${pluginName}`);
    }

    // Validate target version exists
    const targetVersionEntity = await this.getPluginVersion(pluginName, targetVersion);
    if (!targetVersionEntity) {
      throw new Error(`Target version ${targetVersion} not found for plugin ${pluginName}`);
    }

    // Compatibility check
    if (validateCompatibility) {
      const compatibility = await this.checkVersionCompatibility(
        pluginName,
        currentActive.version,
        targetVersion
      );

      if (!compatibility.isCompatible && compatibility.breakingChanges.length > 0) {
        this.logger.warn(`Rollback may cause compatibility issues: ${compatibility.breakingChanges.join(', ')}`);
      }
    }

    // Mark current version as rollback target if preserving
    if (preserveCurrentVersion) {
      await this.versionRepository.update(
        { pluginName, version: currentActive.version },
        { status: PluginVersionStatus.ROLLBACK_TARGET }
      );
    }

    // Promote target version
    const result = await this.promoteVersion(pluginName, targetVersion);

    // Emit rollback event
    this.eventEmitter.emit('plugin-version-rollback', {
      pluginName,
      fromVersion: currentActive.version,
      toVersion: targetVersion,
      rollbackReason,
      rollbackDate: new Date()
    });

    this.logger.log(`Successfully rolled back plugin ${pluginName} from ${currentActive.version} to ${targetVersion}`);
    return result;
  }

  /**
   * Archive old versions (keep only the latest N versions)
   */
  async archiveOldVersions(pluginName: string, keepLatest = 5): Promise<string[]> {
    this.logger.log(`Archiving old versions for plugin ${pluginName}, keeping latest ${keepLatest}`);

    const versions = await this.getPluginVersions(pluginName);
    
    // Filter out active and rollback target versions
    const archivableVersions = versions.filter(v => 
      !v.isActive && 
      v.status !== PluginVersionStatus.ROLLBACK_TARGET
    );

    // Skip if we have fewer versions than the keep limit
    if (archivableVersions.length <= keepLatest) {
      return [];
    }

    // Get versions to archive (oldest ones)
    const versionsToArchive = archivableVersions
      .slice(keepLatest)
      .map(v => v.version);

    // Archive the versions
    if (versionsToArchive.length > 0) {
      await this.versionRepository
        .createQueryBuilder()
        .update(PluginVersionEntity)
        .set({ status: PluginVersionStatus.ARCHIVED })
        .where('pluginName = :pluginName', { pluginName })
        .andWhere('version IN (:...versions)', { versions: versionsToArchive })
        .execute();
    }

    this.logger.log(`Archived ${versionsToArchive.length} versions for plugin ${pluginName}`);
    return versionsToArchive;
  }

  /**
   * Delete a specific version (permanent removal)
   */
  async deleteVersion(pluginName: string, version: string, force = false): Promise<void> {
    this.logger.log(`Deleting version ${version} for plugin: ${pluginName}`);

    const versionEntity = await this.getPluginVersion(pluginName, version);
    if (!versionEntity) {
      throw new Error(`Version ${version} not found for plugin ${pluginName}`);
    }

    // Prevent deletion of active version unless forced
    if (versionEntity.isActive && !force) {
      throw new Error(`Cannot delete active version ${version}. Use force=true to override.`);
    }

    await this.versionRepository.remove(versionEntity);

    // Emit version deleted event
    this.eventEmitter.emit('plugin-version-deleted', {
      pluginName,
      version,
      deletionDate: new Date(),
      forced: force
    });

    this.logger.log(`Successfully deleted version ${version} for plugin: ${pluginName}`);
  }

  /**
   * Check compatibility between two versions
   */
  async checkVersionCompatibility(
    pluginName: string,
    fromVersion: string,
    toVersion: string
  ): Promise<VersionCompatibilityCheck> {
    this.logger.debug(`Checking compatibility from ${fromVersion} to ${toVersion} for plugin: ${pluginName}`);

    const fromVersionEntity = await this.getPluginVersion(pluginName, fromVersion);
    const toVersionEntity = await this.getPluginVersion(pluginName, toVersion);

    if (!fromVersionEntity || !toVersionEntity) {
      return {
        isCompatible: false,
        compatibilityIssues: ['One or both versions not found'],
        migrationRequired: false,
        deprecatedFeatures: [],
        breakingChanges: ['Version not found']
      };
    }

    const issues: string[] = [];
    const breakingChanges: string[] = [];
    const deprecatedFeatures: string[] = [];

    // Parse manifests
    const fromManifest = JSON.parse(fromVersionEntity.manifest);
    const toManifest = JSON.parse(toVersionEntity.manifest);

    // Check semantic version compatibility
    const fromSemver = semver.coerce(fromVersion);
    const toSemver = semver.coerce(toVersion);

    if (fromSemver && toSemver) {
      const majorChange = semver.major(toSemver) !== semver.major(fromSemver);
      if (majorChange) {
        breakingChanges.push('Major version change detected');
      }

      const isDowngrade = semver.lt(toSemver, fromSemver);
      if (isDowngrade) {
        issues.push('Downgrading to older version may cause compatibility issues');
      }
    }

    // Check dependency changes
    const fromDeps = JSON.parse(fromVersionEntity.dependencies || '[]');
    const toDeps = JSON.parse(toVersionEntity.dependencies || '[]');
    
    const removedDeps = fromDeps.filter((dep: string) => !toDeps.includes(dep));
    const addedDeps = toDeps.filter((dep: string) => !fromDeps.includes(dep));

    if (removedDeps.length > 0) {
      breakingChanges.push(`Removed dependencies: ${removedDeps.join(', ')}`);
    }

    if (addedDeps.length > 0) {
      issues.push(`New dependencies required: ${addedDeps.join(', ')}`);
    }

    // Check for API changes in manifest
    if (fromManifest.module && toManifest.module) {
      // Check for removed exports
      const fromExports = fromManifest.module.exports || [];
      const toExports = toManifest.module.exports || [];
      
      const removedExports = fromExports.filter((exp: string) => !toExports.includes(exp));
      if (removedExports.length > 0) {
        breakingChanges.push(`Removed exports: ${removedExports.join(', ')}`);
      }
    }

    const isCompatible = breakingChanges.length === 0;
    const migrationRequired = breakingChanges.length > 0 || issues.length > 2;

    return {
      isCompatible,
      compatibilityIssues: [...issues, ...breakingChanges],
      migrationRequired,
      deprecatedFeatures,
      breakingChanges
    };
  }

  /**
   * Find plugins that depend on the given plugin
   */
  private async findDependentPlugins(pluginName: string): Promise<string[]> {
    const allVersions = await this.versionRepository.find();
    const dependents: string[] = [];

    for (const version of allVersions) {
      const dependencies = JSON.parse(version.dependencies || '[]');
      if (dependencies.includes(pluginName)) {
        if (!dependents.includes(version.pluginName)) {
          dependents.push(version.pluginName);
        }
      }
    }

    return dependents;
  }

  /**
   * Get version statistics for a plugin
   */
  async getVersionStatistics(pluginName: string): Promise<{
    totalVersions: number;
    activeVersion: string | null;
    newestVersion: string;
    oldestVersion: string;
    totalDownloads: number;
    averageFileSize: number;
  }> {
    const versions = await this.getPluginVersions(pluginName);
    
    if (versions.length === 0) {
      throw new Error(`No versions found for plugin ${pluginName}`);
    }

    const activeVersion = versions.find(v => v.isActive);
    const totalDownloads = versions.reduce((sum, v) => sum + v.downloadCount, 0);
    const averageFileSize = versions.reduce((sum, v) => sum + v.fileSize, 0) / versions.length;

    return {
      totalVersions: versions.length,
      activeVersion: activeVersion?.version || null,
      newestVersion: versions[0].version,
      oldestVersion: versions[versions.length - 1].version,
      totalDownloads,
      averageFileSize: Math.round(averageFileSize)
    };
  }
}