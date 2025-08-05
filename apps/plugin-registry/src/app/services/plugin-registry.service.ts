import { Injectable, Logger } from '@nestjs/common';
import {
  PluginResponseDto,
  PluginMetadata,
  CreatePluginDto,
  RegistryStats,
  PluginListResponseDto,
  PluginEventEmitter,
  IPluginEventSubscriber,
  PluginManifestError,
  handlePluginError,
  PluginErrorMetrics,
} from '@modu-nest/plugin-types';
import { PluginValidationService } from './plugin-validation.service';
import { PluginSecurityService } from './plugin-security.service';
import { PluginSignatureService } from './plugin-signature.service';
import { PluginBundleOptimizationService } from './plugin-bundle-optimization.service';
import { PluginStorageOrchestratorService } from './plugin-storage-orchestrator.service';

@Injectable()
export class PluginRegistryService implements IPluginEventSubscriber {
  private readonly logger = new Logger(PluginRegistryService.name);
  private eventEmitter: PluginEventEmitter;
  private errorMetrics = PluginErrorMetrics.getInstance();

  constructor(
    private readonly validationService: PluginValidationService,
    private readonly securityService: PluginSecurityService,
    private readonly signatureService: PluginSignatureService,
    private readonly bundleOptimizationService: PluginBundleOptimizationService,
    private readonly storageOrchestrator: PluginStorageOrchestratorService
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
        this.errorMetrics.recordError(error, { pluginName, operation: 'manifest-validation' });
        handlePluginError(error, { pluginName, operation: 'uploadPlugin' });
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
      this.eventEmitter.emitPluginSecurityScanStarted(pluginName, 'signature');

      // Perform signature verification
      const signatureResult = await this.signatureService.validatePluginSignature(pluginBuffer, extractedManifest);

      // Emit signature verification completed event
      this.eventEmitter.emitPluginSecurityScanCompleted(
        pluginName,
        'signature',
        signatureResult.errors,
        signatureResult.isValid ? 'low' : 'high'
      );

      if (!signatureResult.isValid) {
        const error = new PluginManifestError(
          pluginName,
          signatureResult.errors,
          signatureResult.warnings
        );
        this.errorMetrics.recordError(error, { pluginName, operation: 'signature-verification' });
        handlePluginError(error, { pluginName, operation: 'uploadPlugin' });
      }

      // Log signature verification warnings if any
      if (signatureResult.warnings.length > 0) {
        this.logger.warn(`Plugin signature warnings: ${signatureResult.warnings.join(', ')}`);
      }

      this.logger.log(`Plugin signature verified successfully: ${pluginName} (trustLevel: ${signatureResult.trustLevel})`);

      // Bundle optimization (if enabled)
      let finalPluginBuffer = pluginBuffer;
      const enableOptimization = process.env.ENABLE_BUNDLE_OPTIMIZATION !== 'false'; // enabled by default
      
      if (enableOptimization) {
        this.logger.debug(`Starting bundle optimization for plugin: ${pluginName}`);
        
        try {
          const optimizationResult = await this.bundleOptimizationService.optimizeBundle(
            pluginBuffer,
            pluginName
          );

          if (optimizationResult.compressionRatio > 0.05) { // Only use if we save more than 5%
            finalPluginBuffer = optimizationResult.optimizedBuffer;
            
            this.logger.log(
              `Bundle optimization completed for ${pluginName}: ` +
              `${optimizationResult.originalSize} → ${optimizationResult.optimizedSize} bytes ` +
              `(${(optimizationResult.compressionRatio * 100).toFixed(1)}% reduction)`
            );

            // Emit bundle optimization event
            this.eventEmitter.emitPluginSecurityScanCompleted(
              pluginName,
              'bundle-optimization',
              [],
              'low'
            );
          } else {
            this.logger.debug(`Bundle optimization for ${pluginName} did not provide significant savings, using original`);
          }
        } catch (error) {
          this.logger.warn(`Bundle optimization failed for ${pluginName}, using original bundle: ${error.message}`);
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
        this.errorMetrics.recordError(error as any, { pluginName, operation: 'uploadPlugin' });
      }

      // Emit plugin error event
      this.eventEmitter.emitPluginError(pluginName, error as Error, 'high', 'validation', false);

      // Use standardized error handling
      handlePluginError(error, { pluginName, operation: 'uploadPlugin' });
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
      const result = await this.storageOrchestrator.downloadPlugin(name, userAgent, ipAddress);

      // Emit plugin downloaded event
      this.eventEmitter.emitPluginDownloaded(name, userAgent, ipAddress, result.buffer.length);

      return result;
    } catch (error) {
      // Record error metrics
      if (error instanceof Error) {
        this.errorMetrics.recordError(error as any, { pluginName: name, operation: 'downloadPlugin' });
      }

      // Emit plugin error event
      this.eventEmitter.emitPluginError(name, error as Error, 'medium', 'network', true);

      // Use standardized error handling
      handlePluginError(error, { pluginName: name, operation: 'downloadPlugin' });
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
        this.errorMetrics.recordError(error as any, { pluginName: name, operation: 'deletePlugin' });
      }

      // Emit plugin error event
      this.eventEmitter.emitPluginError(name, error as Error, 'medium', 'runtime', true);

      // Use standardized error handling
      handlePluginError(error, { pluginName: name, operation: 'deletePlugin' });
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
      this.logger.debug(
        `Validation completed for ${event.pluginName}: ${event.validationType} - ${
          event.isValid ? 'VALID' : 'INVALID'
        }${event.cacheHit ? ' (cached)' : ''}`
      );
    });

    // Subscribe to security events for monitoring
    eventEmitter.on('plugin.security.scan.completed', (event) => {
      if (event.threats.length > 0) {
        this.logger.warn(
          `Security threats detected in ${event.pluginName}: ${event.threats.join(', ')} (Risk: ${event.riskLevel})`
        );
      }
    });

    eventEmitter.on('plugin.security.violation', (event) => {
      this.logger.error(
        `Security violation in ${event.pluginName}: ${event.violationType} (Severity: ${event.severity}, Blocked: ${event.blocked})`
      );
    });

    // Subscribe to upload/download events for analytics
    eventEmitter.on('plugin.upload.started', (event) => {
      this.logger.debug(`Plugin upload started: ${event.pluginName} (${(event.fileSize / 1024 / 1024).toFixed(2)}MB)`);
    });

    eventEmitter.on('plugin.downloaded', (event) => {
      this.logger.debug(
        `Plugin downloaded: ${event.pluginName} by ${event.userAgent || 'unknown'} from ${event.ipAddress || 'unknown'}`
      );
    });

    // Subscribe to cache events for optimization insights
    eventEmitter.on('plugin.cache', (event) => {
      if (event.operation === 'hit') {
        this.logger.debug(`Cache hit for ${event.pluginName}: ${event.cacheType}`);
      } else if (event.operation === 'miss') {
        this.logger.debug(`Cache miss for ${event.pluginName}: ${event.cacheType}`);
      }
    });

    // Subscribe to error events for centralized error handling
    eventEmitter.on('plugin.error', (event) => {
      if (event.severity === 'critical' || event.severity === 'high') {
        this.logger.error(
          `${event.severity.toUpperCase()} registry error in ${event.pluginName} (${event.category}): ${
            event.error.message
          }`,
          event.error.stack
        );
      } else {
        this.logger.warn(
          `Registry ${event.severity} error in ${event.pluginName} (${event.category}): ${event.error.message}`
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
}
