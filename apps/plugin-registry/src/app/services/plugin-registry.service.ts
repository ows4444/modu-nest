import { Injectable, Logger } from '@nestjs/common';
import {
  PluginResponseDto,
  PluginMetadata,
  PluginManifest,
  CreatePluginDto,
  RegistryStats,
  PluginListResponseDto,
  PluginEventEmitter,
  IPluginEventSubscriber,
  PluginManifestError,
  handlePluginError,
  PluginErrorMetrics,
  PluginError,
  PluginRegistryError,
} from '@modu-nest/plugin-types';
import { PluginValidationService } from './plugin-validation.service';
import { PluginSecurityService } from './plugin-security.service';
import { PluginSignatureService } from './plugin-signature.service';
import { PluginBundleOptimizationService } from './plugin-bundle-optimization.service';
import { PluginStorageOrchestratorService } from './plugin-storage-orchestrator.service';
import { PluginVersionManager, VersionRollbackOptions } from './plugin-version-manager';
import { PluginTrustManager, TrustLevel, TrustLevelAssignment, TrustLevelChangeRequest } from './plugin-trust-manager';

@Injectable()
export class PluginRegistryService implements IPluginEventSubscriber {
  private readonly logger = new Logger(PluginRegistryService.name);
  private eventEmitter: PluginEventEmitter;
  private errorMetrics = PluginErrorMetrics.getInstance();

  /**
   * Convert a standard Error or unknown to a PluginError for type compatibility
   */
  private toPluginError(error: unknown, operation = 'registry-operation', pluginName?: string): PluginError {
    if (error instanceof PluginError) {
      return error;
    }
    if (error instanceof Error) {
      return new PluginRegistryError(operation, error.message || 'Unknown error occurred', pluginName);
    }
    return new PluginRegistryError(operation, String(error) || 'Unknown error occurred', pluginName);
  }

  constructor(
    private readonly validationService: PluginValidationService,
    private readonly securityService: PluginSecurityService,
    private readonly signatureService: PluginSignatureService,
    private readonly bundleOptimizationService: PluginBundleOptimizationService,
    private readonly storageOrchestrator: PluginStorageOrchestratorService,
    private readonly versionManager: PluginVersionManager,
    private readonly trustManager: PluginTrustManager
  ) {
    this.eventEmitter = new PluginEventEmitter();
    this.subscribeToEvents(this.eventEmitter);
    this.logger.log('PluginRegistryService initialized with modular services and event system');
  }

  async uploadPlugin(pluginBuffer: Buffer): Promise<PluginMetadata> {
    let pluginName = 'unknown';
    let checksum = '';

    try {
      // Security: Check file size before processing to prevent DoS attacks
      this.securityService.validateFileSize(pluginBuffer);

      // Extract and validate manifest
      const extractedManifest: CreatePluginDto = await this.validationService.extractAndValidateManifest(pluginBuffer);
      pluginName = extractedManifest.name;

      // Create temporary metadata for initial processing
      let metadata = this.storageOrchestrator.createPluginMetadata(extractedManifest, pluginBuffer);
      checksum = metadata.checksum;

      // Emit upload started event
      this.eventEmitter.emitPluginUploadStarted(pluginName, pluginBuffer.length, checksum);

      this.logger.debug(`Processing plugin with checksum: ${checksum.substring(0, 8)}...`);

      // Emit validation started event
      this.eventEmitter.emitPluginValidationStarted(pluginName, 'manifest');

      // Validate manifest using cache
      const manifestValidationResult = await this.validationService.validateManifestWithCache(
        extractedManifest,
        checksum
      );

      // Emit validation completed event
      this.eventEmitter.emitPluginValidationCompleted(
        pluginName,
        'manifest',
        manifestValidationResult.isValid,
        manifestValidationResult.warnings,
        manifestValidationResult.errors,
        manifestValidationResult.cacheHit
      );

      if (!manifestValidationResult.isValid) {
        const error = new PluginManifestError(
          pluginName,
          manifestValidationResult.errors,
          manifestValidationResult.warnings
        );
        this.errorMetrics.recordError(this.toPluginError(error, 'manifest-validation', pluginName), {
          pluginName,
          operation: 'manifest-validation',
        });
        handlePluginError(this.toPluginError(error, 'uploadPlugin', pluginName), {
          pluginName,
          operation: 'uploadPlugin',
        });
      }

      // Log warnings if any
      if (manifestValidationResult.warnings.length > 0) {
        this.logger.warn(`Plugin validation warnings: ${manifestValidationResult.warnings.join(', ')}`);
      }

      // Check if plugin already exists with same version
      await this.storageOrchestrator.checkPluginExists(extractedManifest.name, extractedManifest.version);

      // Emit structure validation started event
      this.eventEmitter.emitPluginValidationStarted(pluginName, 'structure');

      // Validate ZIP structure using cache
      await this.validationService.validatePluginStructureWithCache(pluginBuffer, checksum);

      // Emit structure validation completed event (assuming success if no exception)
      this.eventEmitter.emitPluginValidationCompleted(pluginName, 'structure', true, [], []);

      // Emit security scan started event
      this.eventEmitter.emitPluginSecurityScanStarted(pluginName, 'imports');

      // Perform security validation using cache
      await this.securityService.validatePluginSecurityWithCache(pluginBuffer, checksum);

      // Emit security scan completed event (assuming success if no exception)
      this.eventEmitter.emitPluginSecurityScanCompleted(pluginName, 'imports', [], 'low');

      // Emit signature verification started event
      this.eventEmitter.emitPluginSecurityScanStarted(pluginName, 'manifest');

      // Perform signature verification
      const signatureResult = await this.signatureService.validatePluginSignature(pluginBuffer, extractedManifest);

      // Emit signature verification completed event
      this.eventEmitter.emitPluginSecurityScanCompleted(
        pluginName,
        'manifest',
        signatureResult.errors,
        signatureResult.isValid ? 'low' : 'high'
      );

      if (!signatureResult.isValid) {
        const error = new PluginManifestError(pluginName, signatureResult.errors, signatureResult.warnings);
        this.errorMetrics.recordError(this.toPluginError(error, 'signature-verification', pluginName), {
          pluginName,
          operation: 'signature-verification',
        });
        handlePluginError(this.toPluginError(error, 'uploadPlugin', pluginName), {
          pluginName,
          operation: 'uploadPlugin',
        });
      }

      // Log signature verification warnings if any
      if (signatureResult.warnings.length > 0) {
        this.logger.warn(`Plugin signature warnings: ${signatureResult.warnings.join(', ')}`);
      }

      this.logger.log(
        `Plugin signature verified successfully: ${pluginName} (trustLevel: ${signatureResult.trustLevel})`
      );

      // Trust level assignment and validation
      const trustLevel = (signatureResult.trustLevel as TrustLevel) || TrustLevel.COMMUNITY;

      // Assign initial trust level based on signature verification
      await this.trustManager.assignTrustLevel({
        pluginName,
        version: extractedManifest.version,
        trustLevel,
        assignedBy: 'system',
        assignedAt: new Date(),
        reason: `Initial trust level assignment based on signature verification`,
        evidence: [
          {
            type: 'signature',
            description: 'Cryptographic signature verification',
            score: signatureResult.verified ? 100 : 0,
            verifiedBy: 'system',
            verifiedAt: new Date(),
            details: {
              algorithm: signatureResult.algorithm,
              verified: signatureResult.verified,
              warnings: signatureResult.warnings,
            },
          },
        ],
      });

      // Validate plugin against trust policy
      const policyValidation = await this.trustManager.validatePluginAgainstTrustPolicy(
        pluginName,
        extractedManifest,
        extractedManifest.version
      );

      if (!policyValidation.isValid) {
        const violationMessage = `Plugin violates trust policy: ${policyValidation.violations.join(', ')}`;
        this.logger.error(violationMessage);

        // Record trust violation
        await this.trustManager.recordTrustViolation({
          pluginName,
          version: extractedManifest.version,
          violationType: 'security',
          description: violationMessage,
          severity: 'high',
          detectedAt: new Date(),
          details: {
            violations: policyValidation.violations,
            requiredActions: policyValidation.requiredActions,
          },
          action: 'restrict',
        });

        throw new Error(
          `Plugin upload rejected: ${violationMessage}. Required actions: ${policyValidation.requiredActions.join(
            ', '
          )}`
        );
      }

      this.logger.log(`Plugin trust policy validation passed: ${pluginName} (trustLevel: ${trustLevel})`);

      // Bundle optimization (if enabled)
      let finalPluginBuffer = pluginBuffer;
      const enableOptimization = process.env.ENABLE_BUNDLE_OPTIMIZATION !== 'false'; // enabled by default

      if (enableOptimization) {
        this.logger.debug(`Starting bundle optimization for plugin: ${pluginName}`);

        try {
          const optimizationResult = await this.bundleOptimizationService.optimizeBundle(pluginBuffer, pluginName);

          if (optimizationResult.compressionRatio > 0.05) {
            // Only use if we save more than 5%
            finalPluginBuffer = optimizationResult.optimizedBuffer;

            this.logger.log(
              `Bundle optimization completed for ${pluginName}: ` +
                `${optimizationResult.originalSize} → ${optimizationResult.optimizedSize} bytes ` +
                `(${(optimizationResult.compressionRatio * 100).toFixed(1)}% reduction)`
            );

            // Emit bundle optimization event
            this.eventEmitter.emitPluginSecurityScanCompleted(pluginName, 'structure', [], 'low');
          } else {
            this.logger.debug(
              `Bundle optimization for ${pluginName} did not provide significant savings, using original`
            );
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(`Bundle optimization failed for ${pluginName}, using original bundle: ${errorMessage}`);
          // Continue with original buffer - optimization failure shouldn't block upload
        }
      }

      // Update metadata with final buffer if optimization was applied
      if (finalPluginBuffer !== pluginBuffer) {
        metadata = this.storageOrchestrator.createPluginMetadata(extractedManifest, finalPluginBuffer);
      }

      // Store plugin (using optimized buffer if available)
      await this.storageOrchestrator.storePlugin(metadata, finalPluginBuffer);

      // Emit plugin stored event
      this.eventEmitter.emitPluginStored(pluginName, metadata, 'database');

      this.logger.log(
        `Plugin ${metadata.name} v${metadata.version} uploaded successfully (checksum: ${checksum.substring(0, 8)}...)`
      );
      return metadata;
    } catch (error) {
      // Record error metrics if it's a plugin error
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'uploadPlugin', pluginName), {
          pluginName,
          operation: 'uploadPlugin',
        });
      }

      // Emit plugin error event
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'high', 'validation', false);

      // Use standardized error handling
      handlePluginError(this.toPluginError(error, 'uploadPlugin', pluginName), {
        pluginName,
        operation: 'uploadPlugin',
      });
    }
  }

  async listPlugins(page?: number, limit?: number): Promise<PluginListResponseDto> {
    return this.storageOrchestrator.listPlugins(page, limit);
  }

  async getPlugin(name: string): Promise<PluginResponseDto> {
    return this.storageOrchestrator.getPlugin(name);
  }

  async downloadPlugin(
    name: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{
    buffer: Buffer;
    metadata: PluginMetadata;
  }> {
    try {
      const downloadResult = await this.storageOrchestrator.downloadPlugin(name, userAgent, ipAddress);

      // Emit plugin downloaded event
      this.eventEmitter.emitPluginDownloaded(name, userAgent, ipAddress, downloadResult.buffer.length);

      return downloadResult;
    } catch (error) {
      // Record error metrics
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'downloadPlugin', name), {
          pluginName: name,
          operation: 'downloadPlugin',
        });
      }

      // Emit plugin error event
      this.eventEmitter.emitPluginError(name, error as Error, 'medium', 'network', true);

      // Use standardized error handling
      handlePluginError(this.toPluginError(error, 'downloadPlugin', name), {
        pluginName: name,
        operation: 'downloadPlugin',
      });
    }
  }

  async deletePlugin(name: string, reason = 'manual'): Promise<void> {
    try {
      await this.storageOrchestrator.deletePlugin(name);

      // Emit plugin deleted event
      this.eventEmitter.emitPluginDeleted(name, reason);
    } catch (error) {
      // Record error metrics
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'deletePlugin', name), {
          pluginName: name,
          operation: 'deletePlugin',
        });
      }

      // Emit plugin error event
      this.eventEmitter.emitPluginError(name, error as Error, 'medium', 'runtime', true);

      // Use standardized error handling
      handlePluginError(this.toPluginError(error, 'deletePlugin', name), {
        pluginName: name,
        operation: 'deletePlugin',
      });
    }
  }

  async getRegistryStats(): Promise<RegistryStats> {
    return this.storageOrchestrator.getRegistryStats();
  }

  /**
   * Get detailed registry statistics including database metrics
   */
  async getDetailedRegistryStats() {
    const detailedStats = await this.storageOrchestrator.getDetailedRegistryStats();
    return {
      ...detailedStats,
      validation: this.getValidationCacheStats(),
      security: this.getSecurityStats(),
      signature: this.getSignatureStats(),
      bundleOptimization: this.getBundleOptimizationStats(),
    };
  }

  /**
   * Search plugins by query
   */
  async searchPlugins(query: string): Promise<PluginResponseDto[]> {
    return this.storageOrchestrator.searchPlugins(query);
  }

  /**
   * Get database service for advanced operations
   */
  getDatabaseService() {
    return this.storageOrchestrator.getDatabaseService();
  }

  /**
   * Get security configuration and statistics
   */
  getSecurityStats() {
    return this.securityService.getSecurityStats();
  }

  /**
   * Get signature verification statistics
   */
  getSignatureStats() {
    return this.signatureService.getSignatureStats();
  }

  /**
   * Get bundle optimization statistics
   */
  getBundleOptimizationStats() {
    return this.bundleOptimizationService.getOptimizationStats();
  }

  /**
   * Get validation cache statistics
   */
  getValidationCacheStats() {
    return this.validationService.getValidationCacheStats();
  }

  /**
   * Clear validation cache
   */
  clearValidationCache(): void {
    this.validationService.clearValidationCache();
  }

  // Event subscription methods
  subscribeToEvents(eventEmitter: PluginEventEmitter): void {
    // Subscribe to validation events for statistics
    eventEmitter.on('plugin.validation.completed', (event) => {
      const validationEvent = event as any;
      this.logger.debug(
        `Validation completed for ${validationEvent.pluginName}: ${validationEvent.validationType} - ${
          validationEvent.isValid ? 'VALID' : 'INVALID'
        }${validationEvent.cacheHit ? ' (cached)' : ''}`
      );
    });

    // Subscribe to security events for monitoring
    eventEmitter.on('plugin.security.scan.completed', (event) => {
      const securityEvent = event as any;
      if (securityEvent.threats.length > 0) {
        this.logger.warn(
          `Security threats detected in ${securityEvent.pluginName}: ${securityEvent.threats.join(', ')} (Risk: ${
            securityEvent.riskLevel
          })`
        );
      }
    });

    eventEmitter.on('plugin.security.violation', (event) => {
      const violationEvent = event as any;
      this.logger.error(
        `Security violation in ${violationEvent.pluginName}: ${violationEvent.violationType} (Severity: ${violationEvent.severity}, Blocked: ${violationEvent.blocked})`
      );
    });

    // Subscribe to upload/download events for analytics
    eventEmitter.on('plugin.upload.started', (event) => {
      const uploadEvent = event as any;
      this.logger.debug(
        `Plugin upload started: ${uploadEvent.pluginName} (${(uploadEvent.fileSize / 1024 / 1024).toFixed(2)}MB)`
      );
    });

    eventEmitter.on('plugin.downloaded', (event) => {
      const downloadEvent = event as any;
      this.logger.debug(
        `Plugin downloaded: ${downloadEvent.pluginName} by ${downloadEvent.userAgent || 'unknown'} from ${
          downloadEvent.ipAddress || 'unknown'
        }`
      );
    });

    // Subscribe to cache events for optimization insights
    eventEmitter.on('plugin.cache', (event) => {
      const cacheEvent = event as any;
      if (cacheEvent.operation === 'hit') {
        this.logger.debug(`Cache hit for ${cacheEvent.pluginName}: ${cacheEvent.cacheType}`);
      } else if (cacheEvent.operation === 'miss') {
        this.logger.debug(`Cache miss for ${cacheEvent.pluginName}: ${cacheEvent.cacheType}`);
      }
    });

    // Subscribe to error events for centralized error handling
    eventEmitter.on('plugin.error', (event) => {
      const errorEvent = event as any;
      if (errorEvent.severity === 'critical' || errorEvent.severity === 'high') {
        this.logger.error(
          `${errorEvent.severity.toUpperCase()} registry error in ${errorEvent.pluginName} (${errorEvent.category}): ${
            errorEvent.error.message
          }`,
          errorEvent.error.stack
        );
      } else {
        this.logger.warn(
          `Registry ${errorEvent.severity} error in ${errorEvent.pluginName} (${errorEvent.category}): ${errorEvent.error.message}`
        );
      }
    });
  }

  unsubscribeFromEvents(eventEmitter: PluginEventEmitter): void {
    eventEmitter.removeAllListeners('plugin.validation.completed');
    eventEmitter.removeAllListeners('plugin.security.scan.completed');
    eventEmitter.removeAllListeners('plugin.security.violation');
    eventEmitter.removeAllListeners('plugin.upload.started');
    eventEmitter.removeAllListeners('plugin.downloaded');
    eventEmitter.removeAllListeners('plugin.cache');
    eventEmitter.removeAllListeners('plugin.error');
  }

  getEventEmitter(): PluginEventEmitter {
    return this.eventEmitter;
  }

  // ========================================
  // Version Management Methods
  // ========================================

  /**
   * Get all versions of a plugin
   */
  async getPluginVersions(pluginName: string) {
    try {
      return await this.versionManager.getPluginVersions(pluginName);
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'getPluginVersions', pluginName), {
          pluginName,
          operation: 'getPluginVersions',
        });
      }
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'medium', 'runtime', true);
      handlePluginError(this.toPluginError(error, 'getPluginVersions', pluginName), {
        pluginName,
        operation: 'getPluginVersions',
      });
    }
  }

  /**
   * Get the active version of a plugin
   */
  async getActivePluginVersion(pluginName: string) {
    try {
      return await this.versionManager.getActiveVersion(pluginName);
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'getActivePluginVersion', pluginName), {
          pluginName,
          operation: 'getActivePluginVersion',
        });
      }
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'medium', 'runtime', true);
      handlePluginError(this.toPluginError(error, 'getActivePluginVersion', pluginName), {
        pluginName,
        operation: 'getActivePluginVersion',
      });
    }
  }

  /**
   * Get a specific version of a plugin
   */
  async getPluginVersion(pluginName: string, version: string) {
    try {
      return await this.versionManager.getPluginVersion(pluginName, version);
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'getPluginVersion', pluginName), {
          pluginName,
          operation: 'getPluginVersion',
        });
      }
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'medium', 'runtime', true);
      handlePluginError(this.toPluginError(error, 'getPluginVersion', pluginName), {
        pluginName,
        operation: 'getPluginVersion',
      });
    }
  }

  /**
   * Promote a specific version to be the active version
   */
  async promotePluginVersion(pluginName: string, version: string) {
    try {
      this.logger.log(`Promoting plugin ${pluginName} version ${version} to active`);

      // Emit version promotion started event
      this.eventEmitter.emit('plugin-version-promotion-started', {
        pluginName,
        version,
        timestamp: new Date(),
      });

      const promotionResult = await this.versionManager.promoteVersion(pluginName, version);

      // Emit version promotion completed event
      this.eventEmitter.emit('plugin-version-promotion-completed', {
        pluginName,
        fromVersion: promotionResult.previousActiveVersion,
        toVersion: promotionResult.newActiveVersion,
        affectedDependents: promotionResult.affectedDependents,
        warnings: promotionResult.warnings,
        timestamp: new Date(),
      });

      return promotionResult;
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'promotePluginVersion', pluginName), {
          pluginName,
          operation: 'promotePluginVersion',
        });
      }

      // Emit version promotion failed event
      this.eventEmitter.emit('plugin-version-promotion-failed', {
        pluginName,
        version,
        error: error as Error,
        timestamp: new Date(),
      });

      this.eventEmitter.emitPluginError(pluginName, error as Error, 'high', 'runtime', true);
      handlePluginError(this.toPluginError(error, 'promotePluginVersion', pluginName), {
        pluginName,
        operation: 'promotePluginVersion',
      });
    }
  }

  /**
   * Rollback to a previous version of a plugin
   */
  async rollbackPluginVersion(pluginName: string, targetVersion: string, options?: VersionRollbackOptions) {
    try {
      this.logger.log(`Rolling back plugin ${pluginName} to version ${targetVersion}`);

      // Emit rollback started event
      this.eventEmitter.emit('plugin-version-rollback-started', {
        pluginName,
        targetVersion,
        options,
        timestamp: new Date(),
      });

      const rollbackResult = await this.versionManager.rollbackToVersion(pluginName, targetVersion, options);

      // Emit rollback completed event
      this.eventEmitter.emit('plugin-version-rollback-completed', {
        pluginName,
        fromVersion: rollbackResult.previousActiveVersion,
        toVersion: rollbackResult.newActiveVersion,
        rollbackReason: options?.rollbackReason,
        timestamp: new Date(),
      });

      return rollbackResult;
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'rollbackPluginVersion', pluginName), {
          pluginName,
          operation: 'rollbackPluginVersion',
        });
      }

      // Emit rollback failed event
      this.eventEmitter.emit('plugin-version-rollback-failed', {
        pluginName,
        targetVersion,
        error: error as Error,
        timestamp: new Date(),
      });

      this.eventEmitter.emitPluginError(pluginName, error as Error, 'high', 'runtime', true);
      handlePluginError(this.toPluginError(error, 'rollbackPluginVersion', pluginName), {
        pluginName,
        operation: 'rollbackPluginVersion',
      });
    }
  }

  /**
   * Archive old versions of a plugin
   */
  async archiveOldPluginVersions(pluginName: string, keepLatest = 5) {
    try {
      this.logger.log(`Archiving old versions for plugin ${pluginName}, keeping latest ${keepLatest}`);

      const archivedVersions = await this.versionManager.archiveOldVersions(pluginName, keepLatest);

      // Emit versions archived event
      this.eventEmitter.emit('plugin-versions-archived', {
        pluginName,
        archivedVersions,
        keepLatest,
        timestamp: new Date(),
      });

      return archivedVersions;
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'archiveOldPluginVersions', pluginName), {
          pluginName,
          operation: 'archiveOldPluginVersions',
        });
      }
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'medium', 'runtime', true);
      handlePluginError(this.toPluginError(error, 'archiveOldPluginVersions', pluginName), {
        pluginName,
        operation: 'archiveOldPluginVersions',
      });
    }
  }

  /**
   * Delete a specific version of a plugin
   */
  async deletePluginVersion(pluginName: string, version: string, force = false) {
    try {
      this.logger.log(`Deleting version ${version} for plugin ${pluginName}${force ? ' (forced)' : ''}`);

      // Emit version deletion started event
      this.eventEmitter.emit('plugin-version-deletion-started', {
        pluginName,
        version,
        force,
        timestamp: new Date(),
      });

      await this.versionManager.deleteVersion(pluginName, version, force);

      // Emit version deletion completed event
      this.eventEmitter.emit('plugin-version-deletion-completed', {
        pluginName,
        version,
        force,
        timestamp: new Date(),
      });
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'deleteVersionError', pluginName), {
          pluginName,
          operation: 'deletePluginVersion',
        });
      }

      // Emit version deletion failed event
      this.eventEmitter.emit('plugin-version-deletion-failed', {
        pluginName,
        version,
        error: error as Error,
        timestamp: new Date(),
      });

      this.eventEmitter.emitPluginError(pluginName, error as Error, 'high', 'runtime', true);
      handlePluginError(this.toPluginError(error, 'deletePluginVersion', pluginName), {
        pluginName,
        operation: 'deletePluginVersion',
      });
    }
  }

  /**
   * Check compatibility between two versions of a plugin
   */
  async checkVersionCompatibility(pluginName: string, fromVersion: string, toVersion: string) {
    try {
      return await this.versionManager.checkVersionCompatibility(pluginName, fromVersion, toVersion);
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'checkVersionCompatibility', pluginName), {
          pluginName,
          operation: 'checkVersionCompatibility',
        });
      }
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'medium', 'runtime', true);
      handlePluginError(this.toPluginError(error, 'checkVersionCompatibility', pluginName), {
        pluginName,
        operation: 'checkVersionCompatibility',
      });
    }
  }

  /**
   * Get version statistics for a plugin
   */
  async getPluginVersionStatistics(pluginName: string) {
    try {
      return await this.versionManager.getVersionStatistics(pluginName);
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'getPluginVersionStatistics', pluginName), {
          pluginName,
          operation: 'getPluginVersionStatistics',
        });
      }
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'medium', 'runtime', true);
      handlePluginError(this.toPluginError(error, 'getPluginVersionStatistics', pluginName), {
        pluginName,
        operation: 'getPluginVersionStatistics',
      });
    }
  }

  /**
   * Upload a new version of an existing plugin
   */
  async uploadPluginVersion(pluginBuffer: Buffer, makeActive = true): Promise<PluginMetadata> {
    let pluginName = 'unknown';
    let version = 'unknown';

    try {
      // Follow similar validation process as uploadPlugin
      this.securityService.validateFileSize(pluginBuffer);

      const extractedManifest = await this.validationService.extractAndValidateManifest(pluginBuffer);
      pluginName = extractedManifest.name;
      version = extractedManifest.version;

      // Check if this is a version update (plugin exists but this version doesn't)
      await this.versionManager.getActiveVersion(pluginName);
      const existingVersion = await this.versionManager.getPluginVersion(pluginName, version);

      if (existingVersion) {
        throw new Error(`Version ${version} already exists for plugin ${pluginName}`);
      }

      // Create metadata
      let metadata = this.storageOrchestrator.createPluginMetadata(extractedManifest, pluginBuffer);

      // Emit upload started event
      this.eventEmitter.emitPluginUploadStarted(pluginName, pluginBuffer.length, metadata.checksum);

      // Full validation pipeline
      const manifestValidationResult = await this.validationService.validateManifestWithCache(
        extractedManifest,
        metadata.checksum
      );

      if (!manifestValidationResult.isValid) {
        throw new PluginManifestError(
          `Plugin manifest validation failed: ${manifestValidationResult.errors.join(', ')}`,
          manifestValidationResult.errors
        );
      }

      // Security validation
      await this.securityService.validatePluginSecurityWithCache(pluginBuffer, metadata.checksum);

      // Signature verification
      await this.signatureService.validatePluginSignature(pluginBuffer, extractedManifest);

      // Bundle optimization if enabled
      const optimizeBundle = process.env.ENABLE_BUNDLE_OPTIMIZATION?.toLowerCase() === 'true';
      if (optimizeBundle) {
        const optimizationResult = await this.bundleOptimizationService.optimizeBundle(pluginBuffer, pluginName);
        if (optimizationResult.optimizedBuffer) {
          metadata = this.storageOrchestrator.createPluginMetadata(
            extractedManifest,
            optimizationResult.optimizedBuffer
          );
        }
      }

      // Save to file system first
      await this.storageOrchestrator.storePlugin(metadata, pluginBuffer);

      // Prepare plugin data for version management
      const pluginData = {
        name: pluginName,
        version: version,
        description: metadata.description,
        author: metadata.author,
        license: metadata.license,
        manifest: JSON.stringify(extractedManifest),
        fileSize: pluginBuffer.length,
        checksum: metadata.checksum,
        dependencies: JSON.stringify(metadata.dependencies || []),
      };

      // Add to version management system
      await this.versionManager.addPluginVersion(pluginData, makeActive);

      // Emit success events
      this.eventEmitter.emitPluginUploadStarted(pluginName, pluginBuffer.length, metadata.checksum);

      this.logger.log(`Successfully uploaded new version ${version} for plugin: ${pluginName}`);
      return metadata;
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'uploadPluginVersion', pluginName), {
          pluginName,
          operation: 'uploadPluginVersion',
        });
      }
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'high', 'validation', false);
      handlePluginError(this.toPluginError(error, 'uploadPluginVersion', pluginName), {
        pluginName,
        operation: 'uploadPluginVersion',
      });
      throw error; // Re-throw to maintain API contract
    }
  }

  // ========================================
  // Trust Level Management Methods
  // ========================================

  /**
   * Get trust level for a plugin
   */
  async getPluginTrustLevel(pluginName: string, version?: string) {
    try {
      return await this.trustManager.getTrustLevel(pluginName, version);
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'getPluginTrustLevel', pluginName), {
          pluginName,
          operation: 'getPluginTrustLevel',
        });
      }
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'medium', 'runtime', true);
      handlePluginError(this.toPluginError(error, 'getPluginTrustLevel', pluginName), {
        pluginName,
        operation: 'getPluginTrustLevel',
      });
    }
  }

  /**
   * Assign trust level to a plugin
   */
  async assignPluginTrustLevel(assignment: TrustLevelAssignment) {
    try {
      this.logger.log(`Assigning trust level ${assignment.trustLevel} to plugin: ${assignment.pluginName}`);

      await this.trustManager.assignTrustLevel(assignment);

      // Emit trust level assignment event
      this.eventEmitter.emit('plugin-trust-level-assigned', {
        ...assignment,
        timestamp: new Date(),
      });

      return { success: true };
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'assignPluginTrustLevel', assignment.pluginName), {
          pluginName: assignment.pluginName,
          operation: 'assignPluginTrustLevel',
        });
      }
      this.eventEmitter.emitPluginError(assignment.pluginName, error as Error, 'high', 'security', true);
      handlePluginError(this.toPluginError(error, 'assignPluginTrustLevel', assignment.pluginName), {
        pluginName: assignment.pluginName,
        operation: 'assignPluginTrustLevel',
      });
    }
  }

  /**
   * Validate plugin capability access
   */
  async validatePluginCapability(pluginName: string, capability: string, version?: string) {
    try {
      const canPerform = await this.trustManager.canPerformCapability(pluginName, capability, version);

      if (!canPerform) {
        // Record capability violation
        await this.trustManager.recordTrustViolation({
          pluginName,
          version: version || 'latest',
          violationType: 'capability',
          description: `Attempted to access denied capability: ${capability}`,
          severity: 'medium',
          detectedAt: new Date(),
          details: { capability },
          action: 'warn',
        });
      }

      return { allowed: canPerform };
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'validatePluginCapability', pluginName), {
          pluginName,
          operation: 'validatePluginCapability',
        });
      }
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'medium', 'security', true);
      handlePluginError(this.toPluginError(error, 'validatePluginCapability', pluginName), {
        pluginName,
        operation: 'validatePluginCapability',
      });
    }
  }

  /**
   * Get trust policy for a trust level
   */
  async getTrustPolicy(trustLevel: TrustLevel) {
    try {
      return this.trustManager.getTrustPolicy(trustLevel);
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'getTrustPolicy'), { operation: 'getTrustPolicy' });
      }
      handlePluginError(this.toPluginError(error, 'getTrustPolicy'), { operation: 'getTrustPolicy' });
    }
  }

  /**
   * Get all available plugin capabilities
   */
  async getPluginCapabilities() {
    try {
      return this.trustManager.getAllCapabilities();
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'getPluginCapabilities'), {
          operation: 'getPluginCapabilities',
        });
      }
      handlePluginError(this.toPluginError(error, 'getPluginCapabilities'), { operation: 'getPluginCapabilities' });
    }
  }

  /**
   * Get trust statistics for monitoring
   */
  async getTrustStatistics() {
    try {
      return await this.trustManager.getTrustStatistics();
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'getTrustStatistics'), {
          operation: 'getTrustStatistics',
        });
      }
      handlePluginError(this.toPluginError(error, 'getTrustStatistics'), { operation: 'getTrustStatistics' });
    }
  }

  /**
   * Request trust level change
   */
  async requestTrustLevelChange(request: TrustLevelChangeRequest) {
    try {
      this.logger.log(
        `Trust level change requested: ${request.pluginName} from ${request.currentTrustLevel} to ${request.requestedTrustLevel}`
      );

      await this.trustManager.requestTrustLevelChange(request);

      // Emit trust level change request event
      this.eventEmitter.emit('plugin-trust-level-change-requested', {
        ...request,
        timestamp: new Date(),
      });

      return { success: true, message: 'Trust level change request submitted for review' };
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'requestTrustLevelChange', request.pluginName), {
          pluginName: request.pluginName,
          operation: 'requestTrustLevelChange',
        });
      }
      this.eventEmitter.emitPluginError(request.pluginName, error as Error, 'medium', 'security', true);
      handlePluginError(this.toPluginError(error, 'requestTrustLevelChange', request.pluginName), {
        pluginName: request.pluginName,
        operation: 'requestTrustLevelChange',
      });
    }
  }

  /**
   * Validate plugin against trust policy
   */
  async validatePluginTrustPolicy(pluginName: string, manifest: PluginManifest, version?: string) {
    try {
      return await this.trustManager.validatePluginAgainstTrustPolicy(pluginName, manifest, version);
    } catch (error) {
      if (error instanceof Error) {
        this.errorMetrics.recordError(this.toPluginError(error, 'validatePluginTrustPolicy', pluginName), {
          pluginName,
          operation: 'validatePluginTrustPolicy',
        });
      }
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'medium', 'security', true);
      handlePluginError(this.toPluginError(error, 'validatePluginTrustPolicy', pluginName), {
        pluginName,
        operation: 'validatePluginTrustPolicy',
      });
    }
  }

  // ================================
  // BATCH OPERATIONS SECTION
  // ================================

  /**
   * Batch upload multiple plugins with progress tracking and transaction support
   */
  async batchUploadPlugins(
    pluginBuffers: Array<{ buffer: Buffer; filename?: string }>,
    options: {
      continueOnError?: boolean;
      batchSize?: number;
      reportProgress?: (progress: BatchOperationProgress) => void;
      useTransaction?: boolean;
    } = {}
  ): Promise<BatchUploadResult> {
    const { continueOnError = false, batchSize = 5, reportProgress, useTransaction = false } = options;
    
    const startTime = Date.now();
    const totalPlugins = pluginBuffers.length;
    let processedCount = 0;
    
    const results: BatchUploadResult = {
      successful: [],
      failed: [],
      skipped: [],
      totalProcessed: totalPlugins,
      duration: 0,
      successCount: 0,
      failureCount: 0,
      skipCount: 0,
    };

    this.logger.log(`Starting batch upload of ${totalPlugins} plugins with batch size ${batchSize}`);
    
    // Emit batch operation started event
    this.eventEmitter.emit('batch-upload-started', {
      totalPlugins,
      batchSize,
      useTransaction,
      timestamp: new Date(),
    });

    try {
      // Process plugins in batches
      for (let i = 0; i < pluginBuffers.length; i += batchSize) {
        const batch = pluginBuffers.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(totalPlugins / batchSize);
        
        this.logger.debug(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} plugins)`);

        // Process batch with optional transaction support
        const batchResults = await Promise.allSettled(
          batch.map(async ({ buffer, filename }, batchIndex) => {
            const globalIndex = i + batchIndex;
            try {
              const metadata = await this.uploadPlugin(buffer);
              processedCount++;
              
              results.successful.push({
                pluginName: metadata.name,
                version: metadata.version,
                metadata,
                index: globalIndex,
                filename,
              });
              
              // Report progress if callback provided
              if (reportProgress) {
                reportProgress({
                  processed: processedCount,
                  total: totalPlugins,
                  percentage: Math.round((processedCount / totalPlugins) * 100),
                  currentBatch: batchNumber,
                  totalBatches,
                  currentPlugin: metadata.name,
                  status: 'processing',
                });
              }
              
              return { success: true, metadata, index: globalIndex };
            } catch (error) {
              processedCount++;
              const pluginError = this.toPluginError(error, 'batchUpload', filename || `plugin-${globalIndex}`);
              
              results.failed.push({
                pluginName: filename || `plugin-${globalIndex}`,
                error: pluginError,
                index: globalIndex,
                filename,
              });

              // Stop batch processing if continueOnError is false
              if (!continueOnError) {
                throw new Error(`Batch upload failed at plugin ${globalIndex}: ${pluginError.message}`);
              }

              return { success: false, error: pluginError, index: globalIndex };
            }
          })
        );

        // Process batch results
        batchResults.forEach((result, batchIndex) => {
          const globalIndex = i + batchIndex;
          if (result.status === 'rejected' && !continueOnError) {
            // Mark remaining plugins as skipped
            for (let skipIndex = globalIndex + 1; skipIndex < totalPlugins; skipIndex++) {
              results.skipped.push({
                pluginName: `plugin-${skipIndex}`,
                reason: 'Batch processing stopped due to error',
                index: skipIndex,
                filename: pluginBuffers[skipIndex]?.filename,
              });
            }
            throw result.reason;
          }
        });

        // Small delay between batches to prevent overwhelming the system
        if (i + batchSize < pluginBuffers.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

    } catch (error) {
      this.logger.error('Batch upload operation failed:', error);
      
      // Emit batch operation failed event
      this.eventEmitter.emit('batch-upload-failed', {
        totalPlugins,
        processedCount,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
      
      if (!continueOnError) {
        throw error;
      }
    }

    // Calculate final statistics
    results.duration = Date.now() - startTime;
    results.successCount = results.successful.length;
    results.failureCount = results.failed.length;
    results.skipCount = results.skipped.length;

    this.logger.log(
      `Batch upload completed: ${results.successCount} successful, ${results.failureCount} failed, ${results.skipCount} skipped in ${results.duration}ms`
    );

    // Emit batch operation completed event
    this.eventEmitter.emit('batch-upload-completed', {
      ...results,
      timestamp: new Date(),
    });

    // Final progress report
    if (reportProgress) {
      reportProgress({
        processed: processedCount,
        total: totalPlugins,
        percentage: 100,
        currentBatch: Math.ceil(totalPlugins / batchSize),
        totalBatches: Math.ceil(totalPlugins / batchSize),
        status: 'completed',
      });
    }

    return results;
  }

  /**
   * Batch validate multiple plugin buffers without storing them
   */
  async batchValidatePlugins(
    pluginBuffers: Array<{ buffer: Buffer; filename?: string }>,
    options: {
      batchSize?: number;
      reportProgress?: (progress: BatchOperationProgress) => void;
      validationLevel?: 'basic' | 'full';
    } = {}
  ): Promise<BatchValidationResult> {
    const { batchSize = 10, reportProgress, validationLevel = 'full' } = options;
    
    const startTime = Date.now();
    const totalPlugins = pluginBuffers.length;
    let processedCount = 0;
    
    const results: BatchValidationResult = {
      valid: [],
      invalid: [],
      totalProcessed: totalPlugins,
      duration: 0,
      validCount: 0,
      invalidCount: 0,
    };

    this.logger.log(`Starting batch validation of ${totalPlugins} plugins with ${validationLevel} validation`);

    // Emit batch validation started event
    this.eventEmitter.emit('batch-validation-started', {
      totalPlugins,
      batchSize,
      validationLevel,
      timestamp: new Date(),
    });

    try {
      // Process plugins in batches
      for (let i = 0; i < pluginBuffers.length; i += batchSize) {
        const batch = pluginBuffers.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(totalPlugins / batchSize);
        
        // Process batch
        const batchResults = await Promise.allSettled(
          batch.map(async ({ buffer, filename }, batchIndex) => {
            const globalIndex = i + batchIndex;
            try {
              let pluginName = filename || `plugin-${globalIndex}`;
              
              // Security: Check file size
              this.securityService.validateFileSize(buffer);
              
              // Extract and validate manifest
              const extractedManifest = await this.validationService.extractAndValidateManifest(buffer);
              pluginName = extractedManifest.name;
              
              // Create metadata for validation
              const metadata = this.storageOrchestrator.createPluginMetadata(extractedManifest, buffer);
              
              // Perform validation based on level
              const validationResults = {
                manifest: await this.validationService.validateManifestWithCache(extractedManifest, metadata.checksum),
                structure: validationLevel === 'full' 
                  ? await this.validationService.validatePluginStructureWithCache(buffer, metadata.checksum)
                  : { isValid: true, warnings: [], errors: [] },
                security: validationLevel === 'full'
                  ? await this.securityService.validatePluginSecurityWithCache(buffer, metadata.checksum)
                  : { isValid: true, warnings: [], errors: [] },
              };

              const isValid = validationResults.manifest.isValid && 
                            validationResults.structure.isValid && 
                            validationResults.security.isValid;

              processedCount++;

              const result = {
                pluginName,
                filename,
                index: globalIndex,
                metadata,
                validationResults,
                isValid,
              };

              if (isValid) {
                results.valid.push(result);
              } else {
                results.invalid.push(result);
              }

              // Report progress
              if (reportProgress) {
                reportProgress({
                  processed: processedCount,
                  total: totalPlugins,
                  percentage: Math.round((processedCount / totalPlugins) * 100),
                  currentBatch: batchNumber,
                  totalBatches,
                  currentPlugin: pluginName,
                  status: 'processing',
                });
              }

              return result;
            } catch (error) {
              processedCount++;
              const pluginError = this.toPluginError(error, 'batchValidation', filename || `plugin-${globalIndex}`);
              
              const result = {
                pluginName: filename || `plugin-${globalIndex}`,
                filename,
                index: globalIndex,
                error: pluginError,
                isValid: false,
              };
              
              results.invalid.push(result);
              return result;
            }
          })
        );
      }

    } catch (error) {
      this.logger.error('Batch validation operation failed:', error);
      
      this.eventEmitter.emit('batch-validation-failed', {
        totalPlugins,
        processedCount,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
      
      throw error;
    }

    // Calculate final statistics
    results.duration = Date.now() - startTime;
    results.validCount = results.valid.length;
    results.invalidCount = results.invalid.length;

    this.logger.log(
      `Batch validation completed: ${results.validCount} valid, ${results.invalidCount} invalid in ${results.duration}ms`
    );

    // Emit batch operation completed event
    this.eventEmitter.emit('batch-validation-completed', {
      ...results,
      timestamp: new Date(),
    });

    // Final progress report
    if (reportProgress) {
      reportProgress({
        processed: processedCount,
        total: totalPlugins,
        percentage: 100,
        currentBatch: Math.ceil(totalPlugins / batchSize),
        totalBatches: Math.ceil(totalPlugins / batchSize),
        status: 'completed',
      });
    }

    return results;
  }

  /**
   * Batch delete multiple plugins with progress tracking
   */
  async batchDeletePlugins(
    pluginNames: string[],
    options: {
      continueOnError?: boolean;
      batchSize?: number;
      reason?: string;
      reportProgress?: (progress: BatchOperationProgress) => void;
      dryRun?: boolean;
    } = {}
  ): Promise<BatchDeleteResult> {
    const { continueOnError = true, batchSize = 5, reason = 'batch-delete', reportProgress, dryRun = false } = options;
    
    const startTime = Date.now();
    const totalPlugins = pluginNames.length;
    let processedCount = 0;
    
    const results: BatchDeleteResult = {
      deleted: [],
      failed: [],
      notFound: [],
      totalProcessed: totalPlugins,
      duration: 0,
      deletedCount: 0,
      failedCount: 0,
      notFoundCount: 0,
      dryRun,
    };

    this.logger.log(`Starting batch ${dryRun ? 'dry-run ' : ''}delete of ${totalPlugins} plugins`);

    // Emit batch delete started event
    this.eventEmitter.emit('batch-delete-started', {
      totalPlugins,
      batchSize,
      dryRun,
      reason,
      timestamp: new Date(),
    });

    try {
      // Process plugins in batches
      for (let i = 0; i < pluginNames.length; i += batchSize) {
        const batch = pluginNames.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(totalPlugins / batchSize);
        
        // Process batch
        const batchResults = await Promise.allSettled(
          batch.map(async (pluginName, batchIndex) => {
            const globalIndex = i + batchIndex;
            try {
              // Check if plugin exists first
              const plugin = await this.getPlugin(pluginName).catch(() => null);
              
              if (!plugin) {
                processedCount++;
                results.notFound.push({
                  pluginName,
                  index: globalIndex,
                  reason: 'Plugin not found',
                });
                return { success: false, notFound: true };
              }

              if (!dryRun) {
                // Actually delete the plugin
                await this.deletePlugin(pluginName, reason);
              }

              processedCount++;
              results.deleted.push({
                pluginName,
                index: globalIndex,
                metadata: plugin,
              });

              // Report progress
              if (reportProgress) {
                reportProgress({
                  processed: processedCount,
                  total: totalPlugins,
                  percentage: Math.round((processedCount / totalPlugins) * 100),
                  currentBatch: batchNumber,
                  totalBatches,
                  currentPlugin: pluginName,
                  status: 'processing',
                });
              }

              return { success: true };
            } catch (error) {
              processedCount++;
              const pluginError = this.toPluginError(error, 'batchDelete', pluginName);
              
              results.failed.push({
                pluginName,
                error: pluginError,
                index: globalIndex,
              });

              if (!continueOnError) {
                throw new Error(`Batch delete failed at plugin ${pluginName}: ${pluginError.message}`);
              }

              return { success: false, error: pluginError };
            }
          })
        );
      }

    } catch (error) {
      this.logger.error('Batch delete operation failed:', error);
      
      this.eventEmitter.emit('batch-delete-failed', {
        totalPlugins,
        processedCount,
        error: error instanceof Error ? error.message : String(error),
        dryRun,
        timestamp: new Date(),
      });
      
      if (!continueOnError) {
        throw error;
      }
    }

    // Calculate final statistics
    results.duration = Date.now() - startTime;
    results.deletedCount = results.deleted.length;
    results.failedCount = results.failed.length;
    results.notFoundCount = results.notFound.length;

    this.logger.log(
      `Batch ${dryRun ? 'dry-run ' : ''}delete completed: ${results.deletedCount} deleted, ${results.failedCount} failed, ${results.notFoundCount} not found in ${results.duration}ms`
    );

    // Emit batch operation completed event
    this.eventEmitter.emit('batch-delete-completed', {
      ...results,
      timestamp: new Date(),
    });

    // Final progress report
    if (reportProgress) {
      reportProgress({
        processed: processedCount,
        total: totalPlugins,
        percentage: 100,
        currentBatch: Math.ceil(totalPlugins / batchSize),
        totalBatches: Math.ceil(totalPlugins / batchSize),
        status: 'completed',
      });
    }

    return results;
  }

  /**
   * Get batch operation status and history
   */
  getBatchOperationStatus(): {
    active: boolean;
    currentOperation?: string;
    progress?: BatchOperationProgress;
    history: Array<{
      operation: string;
      startTime: Date;
      endTime?: Date;
      status: 'running' | 'completed' | 'failed';
      summary?: any;
    }>;
  } {
    // This would be implemented with proper state tracking
    // For now, return a basic structure
    return {
      active: false,
      history: [],
    };
  }
}

// Type definitions for batch operations
export interface BatchOperationProgress {
  processed: number;
  total: number;
  percentage: number;
  currentBatch: number;
  totalBatches: number;
  currentPlugin?: string;
  status: 'processing' | 'completed' | 'failed';
}

export interface BatchUploadResult {
  successful: Array<{
    pluginName: string;
    version: string;
    metadata: PluginMetadata;
    index: number;
    filename?: string;
  }>;
  failed: Array<{
    pluginName: string;
    error: PluginError;
    index: number;
    filename?: string;
  }>;
  skipped: Array<{
    pluginName: string;
    reason: string;
    index: number;
    filename?: string;
  }>;
  totalProcessed: number;
  duration: number;
  successCount: number;
  failureCount: number;
  skipCount: number;
}

export interface BatchValidationResult {
  valid: Array<{
    pluginName: string;
    filename?: string;
    index: number;
    metadata: PluginMetadata;
    validationResults: any;
    isValid: boolean;
  }>;
  invalid: Array<{
    pluginName: string;
    filename?: string;
    index: number;
    metadata?: PluginMetadata;
    validationResults?: any;
    error?: PluginError;
    isValid: boolean;
  }>;
  totalProcessed: number;
  duration: number;
  validCount: number;
  invalidCount: number;
}

export interface BatchDeleteResult {
  deleted: Array<{
    pluginName: string;
    index: number;
    metadata?: PluginResponseDto;
  }>;
  failed: Array<{
    pluginName: string;
    error: PluginError;
    index: number;
  }>;
  notFound: Array<{
    pluginName: string;
    index: number;
    reason: string;
  }>;
  totalProcessed: number;
  duration: number;
  deletedCount: number;
  failedCount: number;
  notFoundCount: number;
  dryRun: boolean;
}
