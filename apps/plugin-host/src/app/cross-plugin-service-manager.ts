import { Injectable, Logger, Type, ClassProvider, ValueProvider, FactoryProvider } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Mutex } from 'async-mutex';
import { CrossPluginServiceConfig, PluginManifest, ServiceVersionInfo } from '@modu-nest/plugin-types';

// Cross-plugin service provider - a union of NestJS Provider types
export type CrossPluginServiceProvider = ClassProvider<any> | ValueProvider<any> | FactoryProvider<any> | Type<any>;

// Service registry entry with versioning information
export interface ServiceRegistryEntry {
  provider: CrossPluginServiceProvider;
  version: string;
  compatibleVersions: string[];
  isGlobal: boolean;
  pluginName: string;
  serviceName: string;
  registrationTime: Date;
  deprecationInfo?: {
    isDeprecated: boolean;
    since: string;
    removeIn: string;
    replacement?: string;
    reason?: string;
  };
}

// Version compatibility result
export interface VersionCompatibilityResult {
  isCompatible: boolean;
  level: 'exact' | 'compatible' | 'incompatible';
  requestedVersion: string;
  availableVersion: string;
  reason: string;
}

// Service discovery performance metrics
export interface ServiceDiscoveryMetrics {
  totalRequests: number;
  successfulResolutions: number;
  failedResolutions: number;
  averageResolutionTime: number;
  cacheHitRate: number;
  versionCompatibilityChecks: number;
  deprecationWarnings: number;
  resolutionsByService: Record<string, number>;
  resolutionTimesByService: Record<string, number[]>;
  errorsByReason: Record<string, number>;
  lastResetTime: Date;
}

// Individual resolution performance record
export interface ResolutionPerformanceRecord {
  serviceName: string;
  requestedVersion?: string;
  resolvedVersion: string;
  resolutionTime: number;
  wasFromCache: boolean;
  compatibilityLevel: 'exact' | 'compatible' | 'incompatible';
  timestamp: Date;
  success: boolean;
  errorReason?: string;
}

/**
 * Thread-safe Cross-Plugin Service Manager
 *
 * This service manages cross-plugin service registration and access with comprehensive
 * thread safety using async-mutex. All operations that modify or read the service
 * registry are protected by a mutex to prevent race conditions during concurrent
 * plugin loading/unloading operations.
 *
 * Thread Safety Strategy:
 * - All public methods that modify registry state are async and mutex-protected
 * - Read operations are also mutex-protected to ensure consistency
 * - Internal methods (_Internal suffix) contain the actual implementation
 * - Synchronous versions kept for backward compatibility but marked deprecated
 */
@Injectable()
export class CrossPluginServiceManager {
  private readonly logger = new Logger(CrossPluginServiceManager.name);
  private readonly serviceRegistry = new Map<string, ServiceRegistryEntry>();
  private readonly globalTokens = new Set<string>();
  private readonly versionRegistry = new Map<string, Map<string, ServiceRegistryEntry>>(); // service -> version -> entry
  private readonly deprecatedServices = new Map<string, ServiceRegistryEntry>();

  // Performance metrics tracking
  private readonly performanceRecords: ResolutionPerformanceRecord[] = [];
  private readonly metricsCache = new Map<string, { result: any; timestamp: number }>();
  private readonly maxPerformanceRecords = 10000; // Limit memory usage
  private readonly maxCacheAge = 5 * 60 * 1000; // 5 minutes cache TTL
  private metricsStartTime = new Date();

  // Thread safety mutex for all registry operations
  private readonly registryMutex = new Mutex();

  /**
   * Create cross-plugin service providers based on plugin manifest configuration
   * Thread-safe operation using mutex protection
   */
  async createCrossPluginProviders(
    pluginName: string,
    manifest: PluginManifest,
    pluginModule: Record<string, unknown>
  ): Promise<CrossPluginServiceProvider[]> {
    return await this.registryMutex.runExclusive(async () => {
      return this.createCrossPluginProvidersInternal(pluginName, manifest, pluginModule);
    });
  }

  /**
   * Internal implementation of cross-plugin provider creation
   * @private
   */
  private createCrossPluginProvidersInternal(
    pluginName: string,
    manifest: PluginManifest,
    pluginModule: Record<string, unknown>
  ): CrossPluginServiceProvider[] {
    const providers: CrossPluginServiceProvider[] = [];

    if (!manifest.module.crossPluginServices) {
      return providers;
    }

    for (const serviceConfig of manifest.module.crossPluginServices) {
      try {
        const provider = this.createServiceProvider(pluginName, serviceConfig, pluginModule);
        if (provider) {
          const finalToken = this.registerVersionedService(serviceConfig, pluginName, provider);
          // Update provider with final token in case of collision
          if (typeof provider === 'object' && 'provide' in provider) {
            provider.provide = finalToken;
          }
          providers.push(provider);

          if (serviceConfig.global) {
            this.globalTokens.add(finalToken);
          }

          const version = serviceConfig.version || '1.0.0';
          this.logger.debug(
            `Created cross-plugin provider '${finalToken}' v${version} for service '${serviceConfig.serviceName}' from plugin '${pluginName}'`
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to create cross-plugin provider for service '${serviceConfig.serviceName}' from plugin '${pluginName}':`,
          error
        );
      }
    }

    return providers;
  }

  /**
   * Create global service providers for exported services to enable cross-plugin access
   * Thread-safe operation using mutex protection
   */
  async createGlobalServiceProviders(
    pluginName: string,
    exportedServices: string[],
    pluginModule: Record<string, unknown>
  ): Promise<CrossPluginServiceProvider[]> {
    return await this.registryMutex.runExclusive(async () => {
      return this.createGlobalServiceProvidersInternal(pluginName, exportedServices, pluginModule);
    });
  }

  /**
   * Internal implementation of global service provider creation
   * @private
   */
  private createGlobalServiceProvidersInternal(
    pluginName: string,
    exportedServices: string[],
    pluginModule: Record<string, unknown>
  ): CrossPluginServiceProvider[] {
    const providers: CrossPluginServiceProvider[] = [];

    for (const serviceName of exportedServices) {
      const serviceClass = pluginModule[serviceName];
      if (serviceClass && typeof serviceClass === 'function') {
        // Create a global token for this service
        const globalToken = this.createGlobalToken(pluginName, serviceName);

        const provider: ClassProvider<any> = {
          provide: globalToken,
          useClass: serviceClass as Type<any>,
        };

        const finalToken = this.registerService(globalToken, provider);
        // Update provider with final token in case of collision
        provider.provide = finalToken;
        providers.push(provider);
        this.globalTokens.add(finalToken);

        this.logger.debug(`Created global provider '${finalToken}' for ${pluginName}:${serviceName}`);
      }
    }

    return providers;
  }

  /**
   * Get a cross-plugin service provider by token
   * Thread-safe operation using mutex protection for consistency
   */
  async getServiceProvider(token: string): Promise<CrossPluginServiceProvider | undefined> {
    const startTime = performance.now();

    return await this.registryMutex.runExclusive(async () => {
      // Check cache first
      const cacheKey = `token:${token}`;
      const cached = this.metricsCache.get(cacheKey);
      const wasFromCache = cached && Date.now() - cached.timestamp < this.maxCacheAge;

      let entry: ServiceRegistryEntry | undefined;
      if (wasFromCache) {
        entry = cached!.result;
      } else {
        entry = this.serviceRegistry.get(token);
        if (entry) {
          this.metricsCache.set(cacheKey, { result: entry, timestamp: Date.now() });
        }
      }

      const resolutionTime = performance.now() - startTime;

      // Record performance metrics
      this.recordResolutionPerformance({
        serviceName: entry?.serviceName || 'unknown',
        requestedVersion: entry?.version,
        resolvedVersion: entry?.version || 'unknown',
        resolutionTime,
        wasFromCache: !!wasFromCache,
        compatibilityLevel: 'exact',
        timestamp: new Date(),
        success: !!entry,
        errorReason: entry ? undefined : 'Token not found',
      });

      return entry?.provider;
    });
  }

  /**
   * Get a versioned cross-plugin service provider with compatibility checking
   */
  async getVersionedServiceProvider(
    serviceName: string,
    requestedVersion?: string,
    allowCompatible = true
  ): Promise<{
    provider?: CrossPluginServiceProvider;
    compatibilityResult: VersionCompatibilityResult;
    serviceInfo?: ServiceVersionInfo;
  }> {
    const startTime = performance.now();

    return await this.registryMutex.runExclusive(async () => {
      // Check cache first
      const cacheKey = `versioned:${serviceName}:${requestedVersion || 'latest'}:${allowCompatible}`;
      const cached = this.metricsCache.get(cacheKey);
      const wasFromCache = cached && Date.now() - cached.timestamp < this.maxCacheAge;

      let result: {
        provider?: CrossPluginServiceProvider;
        compatibilityResult: VersionCompatibilityResult;
        serviceInfo?: ServiceVersionInfo;
      };

      if (wasFromCache) {
        result = cached!.result;
      } else {
        result = this.getVersionedServiceProviderInternal(serviceName, requestedVersion, allowCompatible);
        this.metricsCache.set(cacheKey, { result, timestamp: Date.now() });
      }

      const resolutionTime = performance.now() - startTime;

      // Record performance metrics
      this.recordResolutionPerformance({
        serviceName,
        requestedVersion,
        resolvedVersion: result.compatibilityResult.availableVersion,
        resolutionTime,
        wasFromCache: !!wasFromCache,
        compatibilityLevel: result.compatibilityResult.level,
        timestamp: new Date(),
        success: result.compatibilityResult.isCompatible,
        errorReason: result.compatibilityResult.isCompatible ? undefined : result.compatibilityResult.reason,
      });

      return result;
    });
  }

  /**
   * Get a cross-plugin service provider by token (synchronous version for internal use)
   * @deprecated Use async getServiceProvider for thread safety
   */
  getServiceProviderSync(token: string): CrossPluginServiceProvider | undefined {
    const entry = this.serviceRegistry.get(token);
    return entry?.provider;
  }

  /**
   * Check if a token is globally available
   */
  isGlobalService(token: string): boolean {
    return this.globalTokens.has(token);
  }

  /**
   * Get all available cross-plugin service tokens
   */
  getAvailableServices(): string[] {
    return Array.from(this.serviceRegistry.keys());
  }

  /**
   * Get all global service tokens
   */
  getGlobalServices(): string[] {
    return Array.from(this.globalTokens);
  }

  /**
   * Remove services for a specific plugin (cleanup on unload)
   * Thread-safe operation using mutex protection
   */
  async removePluginServices(pluginName: string): Promise<void> {
    return await this.registryMutex.runExclusive(async () => {
      return this.removePluginServicesInternal(pluginName);
    });
  }

  /**
   * Internal implementation of plugin service removal
   * @private
   */
  private removePluginServicesInternal(pluginName: string): void {
    const tokensToRemove: string[] = [];

    for (const [token] of this.serviceRegistry) {
      // Check if this token belongs to the plugin being removed
      if (token.startsWith(`${pluginName.toUpperCase()}_`) || token.includes(`_${pluginName.toUpperCase()}_`)) {
        tokensToRemove.push(token);
      }
    }

    for (const token of tokensToRemove) {
      this.serviceRegistry.delete(token);
      this.globalTokens.delete(token);
      this.logger.debug(`Removed cross-plugin service '${token}' for plugin '${pluginName}'`);
    }
  }

  /**
   * Get comprehensive statistics about cross-plugin services
   * Thread-safe operation using mutex protection for consistent data
   */
  async getStatistics(): Promise<{
    totalServices: number;
    globalServices: number;
    localServices: number;
    servicesByPlugin: Record<string, number>;
    tokenCollisions: number;
    averageTokenLength: number;
    tokenPatterns: {
      cryptographicTokens: number;
      legacyTokens: number;
      collisionResolvedTokens: number;
    };
  }> {
    return await this.registryMutex.runExclusive(async () => {
      return this.getStatisticsInternal();
    });
  }

  /**
   * Internal implementation of statistics collection
   * @private
   */
  private getStatisticsInternal(): {
    totalServices: number;
    globalServices: number;
    localServices: number;
    servicesByPlugin: Record<string, number>;
    tokenCollisions: number;
    averageTokenLength: number;
    tokenPatterns: {
      cryptographicTokens: number;
      legacyTokens: number;
      collisionResolvedTokens: number;
    };
  } {
    const servicesByPlugin: Record<string, number> = {};
    let globalServices = 0;
    let totalTokenLength = 0;
    let cryptographicTokens = 0;
    let legacyTokens = 0;
    let collisionResolvedTokens = 0;
    let tokenCollisions = 0;

    for (const token of this.serviceRegistry.keys()) {
      totalTokenLength += token.length;

      if (this.globalTokens.has(token)) {
        globalServices++;
      }

      // Analyze token patterns
      if (token.startsWith('COLLISION_RESOLVED_')) {
        collisionResolvedTokens++;
        tokenCollisions++;
      } else if (this.isCryptographicToken(token)) {
        cryptographicTokens++;
      } else {
        legacyTokens++;
      }

      // Extract plugin name from token (enhanced pattern matching)
      const pluginMatch = token.match(/^([A-Z][A-Z_]*)_/) || token.match(/^([A-Z]+)_/);
      if (pluginMatch) {
        const pluginName = pluginMatch[1].toLowerCase().replace(/_/g, '-');
        servicesByPlugin[pluginName] = (servicesByPlugin[pluginName] || 0) + 1;
      }
    }

    return {
      totalServices: this.serviceRegistry.size,
      globalServices,
      localServices: this.serviceRegistry.size - globalServices,
      servicesByPlugin,
      tokenCollisions,
      averageTokenLength: this.serviceRegistry.size > 0 ? Math.round(totalTokenLength / this.serviceRegistry.size) : 0,
      tokenPatterns: {
        cryptographicTokens,
        legacyTokens,
        collisionResolvedTokens,
      },
    };
  }

  /**
   * Validate if a token follows the cryptographic pattern
   * @param token - Token to validate
   * @returns True if token has cryptographic hash suffix
   */
  private isCryptographicToken(token: string): boolean {
    // Check if token ends with 8 hexadecimal characters (4 bytes = 8 hex chars)
    const cryptoPattern = /_[A-F0-9]{8}$/;
    return cryptoPattern.test(token);
  }

  /**
   * Validate token format and security
   * @param token - Token to validate
   * @returns Validation result with security assessment
   */
  validateToken(token: string): {
    isValid: boolean;
    securityLevel: 'high' | 'medium' | 'low';
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let securityLevel: 'high' | 'medium' | 'low' = 'high';

    // Basic format validation
    if (!token || token.length === 0) {
      issues.push('Token is empty');
      securityLevel = 'low';
    }

    if (token.length < 8) {
      issues.push('Token is too short (minimum 8 characters recommended)');
      securityLevel = 'low';
    }

    if (token.length > 128) {
      issues.push('Token is excessively long (maximum 128 characters recommended)');
      recommendations.push('Consider shorter, more descriptive names');
    }

    // Check for invalid characters
    if (!/^[A-Z0-9_]+$/.test(token)) {
      issues.push('Token contains invalid characters (only A-Z, 0-9, and _ allowed)');
      securityLevel = 'low';
    }

    // Security pattern validation
    if (token.startsWith('COLLISION_RESOLVED_')) {
      issues.push('Token was generated due to collision - indicates naming conflicts');
      securityLevel = 'medium';
      recommendations.push('Review plugin naming strategy to avoid collisions');
    } else if (this.isCryptographicToken(token)) {
      // Good cryptographic token
      if (securityLevel === 'high') {
        // Keep high security level
      }
    } else {
      // Legacy token format
      securityLevel = securityLevel === 'low' ? 'low' : 'medium';
      recommendations.push('Consider upgrading to cryptographic token format for better collision resistance');
    }

    // Check for potential naming conflicts
    const parts = token.split('_');
    if (parts.length < 2) {
      issues.push('Token should follow PLUGIN_SERVICE naming convention');
      securityLevel = 'medium';
    }

    return {
      isValid: issues.length === 0,
      securityLevel,
      issues,
      recommendations,
    };
  }

  private createServiceProvider(
    pluginName: string,
    config: CrossPluginServiceConfig,
    pluginModule: Record<string, unknown>
  ): CrossPluginServiceProvider | null {
    const serviceClass = pluginModule[config.serviceName];

    if (!serviceClass || typeof serviceClass !== 'function') {
      this.logger.warn(`Service '${config.serviceName}' not found in plugin '${pluginName}' exports`);
      return null;
    }

    return {
      provide: config.token,
      useClass: serviceClass as Type<any>,
    } as ClassProvider<any>;
  }

  /**
   * Register a versioned service with compatibility checking
   */
  private registerVersionedService(
    config: CrossPluginServiceConfig,
    pluginName: string,
    provider: CrossPluginServiceProvider
  ): string {
    const version = config.version || '1.0.0';
    const compatibleVersions = config.compatibleVersions || [version];
    let finalToken = config.token;

    // Check for existing versions of this service
    const serviceVersions = this.versionRegistry.get(config.serviceName);
    if (serviceVersions) {
      // Check if this exact version already exists
      const existingVersion = serviceVersions.get(version);
      if (existingVersion) {
        this.logger.warn(`Service ${config.serviceName} v${version} already exists, generating new token`);
        finalToken = this.createGlobalTokenWithRetry(config.token);
      }

      // Check for version conflicts
      for (const [existingVer, existingEntry] of serviceVersions.entries()) {
        const compatibility = this.checkVersionCompatibility(
          version,
          existingVer,
          compatibleVersions,
          existingEntry.compatibleVersions
        );
        if (compatibility.level === 'incompatible') {
          this.logger.warn(`Incompatible versions detected: ${config.serviceName} v${version} vs v${existingVer}`);
        }
      }
    } else {
      this.versionRegistry.set(config.serviceName, new Map());
    }

    // Create registry entry
    const entry: ServiceRegistryEntry = {
      provider,
      version,
      compatibleVersions,
      isGlobal: config.global || false,
      pluginName,
      serviceName: config.serviceName,
      registrationTime: new Date(),
      deprecationInfo: config.deprecated
        ? {
            isDeprecated: true,
            since: config.deprecated.since,
            removeIn: config.deprecated.removeIn,
            replacement: config.deprecated.replacement,
            reason: config.deprecated.reason,
          }
        : undefined,
    };

    // Register in all maps
    this.serviceRegistry.set(finalToken, entry);
    this.versionRegistry.get(config.serviceName)!.set(version, entry);

    if (config.deprecated) {
      this.deprecatedServices.set(finalToken, entry);
      this.logger.warn(
        `Service ${config.serviceName} v${version} is deprecated since ${config.deprecated.since}, will be removed in ${config.deprecated.removeIn}`
      );
    }

    return finalToken;
  }

  /**
   * Get versioned service provider internal implementation
   */
  private getVersionedServiceProviderInternal(
    serviceName: string,
    requestedVersion?: string,
    allowCompatible = true
  ): {
    provider?: CrossPluginServiceProvider;
    compatibilityResult: VersionCompatibilityResult;
    serviceInfo?: ServiceVersionInfo;
  } {
    const serviceVersions = this.versionRegistry.get(serviceName);

    if (!serviceVersions || serviceVersions.size === 0) {
      return {
        compatibilityResult: {
          isCompatible: false,
          level: 'incompatible',
          requestedVersion: requestedVersion || 'any',
          availableVersion: 'none',
          reason: `Service '${serviceName}' not found`,
        },
      };
    }

    // If no specific version requested, return the latest compatible version
    if (!requestedVersion) {
      const latestEntry = this.getLatestVersion(serviceVersions);
      return {
        provider: latestEntry.provider,
        compatibilityResult: {
          isCompatible: true,
          level: 'exact',
          requestedVersion: 'latest',
          availableVersion: latestEntry.version,
          reason: 'Latest version provided',
        },
        serviceInfo: this.createServiceVersionInfo(latestEntry),
      };
    }

    // Look for exact match first
    const exactMatch = serviceVersions.get(requestedVersion);
    if (exactMatch) {
      return {
        provider: exactMatch.provider,
        compatibilityResult: {
          isCompatible: true,
          level: 'exact',
          requestedVersion,
          availableVersion: exactMatch.version,
          reason: 'Exact version match',
        },
        serviceInfo: this.createServiceVersionInfo(exactMatch),
      };
    }

    // If exact match not found and compatible versions allowed, find compatible version
    if (allowCompatible) {
      for (const [version, entry] of serviceVersions.entries()) {
        const compatibility = this.checkVersionCompatibility(
          requestedVersion,
          version,
          [requestedVersion],
          entry.compatibleVersions
        );

        if (compatibility.isCompatible) {
          return {
            provider: entry.provider,
            compatibilityResult: compatibility,
            serviceInfo: this.createServiceVersionInfo(entry),
          };
        }
      }
    }

    // No compatible version found
    const availableVersions = Array.from(serviceVersions.keys()).join(', ');
    return {
      compatibilityResult: {
        isCompatible: false,
        level: 'incompatible',
        requestedVersion,
        availableVersion: availableVersions,
        reason: `No compatible version found. Available: ${availableVersions}`,
      },
    };
  }

  /**
   * Check version compatibility using semantic versioning rules
   */
  private checkVersionCompatibility(
    requestedVersion: string,
    availableVersion: string,
    requestedCompatible: string[],
    availableCompatible: string[]
  ): VersionCompatibilityResult {
    // Exact match
    if (requestedVersion === availableVersion) {
      return {
        isCompatible: true,
        level: 'exact',
        requestedVersion,
        availableVersion,
        reason: 'Exact version match',
      };
    }

    // Check if available version is in requested compatible list
    if (requestedCompatible.includes(availableVersion)) {
      return {
        isCompatible: true,
        level: 'compatible',
        requestedVersion,
        availableVersion,
        reason: 'Listed as compatible in requested versions',
      };
    }

    // Check if requested version is in available compatible list
    if (availableCompatible.includes(requestedVersion)) {
      return {
        isCompatible: true,
        level: 'compatible',
        requestedVersion,
        availableVersion,
        reason: 'Listed as compatible in available versions',
      };
    }

    // Semantic version compatibility check (simplified)
    try {
      const requestedParts = this.parseVersion(requestedVersion);
      const availableParts = this.parseVersion(availableVersion);

      // Major version must match for compatibility
      if (requestedParts.major !== availableParts.major) {
        return {
          isCompatible: false,
          level: 'incompatible',
          requestedVersion,
          availableVersion,
          reason: 'Major version mismatch',
        };
      }

      // Minor version compatibility (available >= requested)
      if (availableParts.minor >= requestedParts.minor) {
        return {
          isCompatible: true,
          level: 'compatible',
          requestedVersion,
          availableVersion,
          reason: 'Semantic version compatibility',
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to parse versions for compatibility: ${requestedVersion} vs ${availableVersion}`);
    }

    return {
      isCompatible: false,
      level: 'incompatible',
      requestedVersion,
      availableVersion,
      reason: 'Version incompatible',
    };
  }

  /**
   * Parse semantic version string
   */
  private parseVersion(version: string): { major: number; minor: number; patch: number } {
    const parts = version.split('.').map((part) => parseInt(part.split('-')[0], 10));
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
    };
  }

  /**
   * Get latest version from service versions map
   */
  private getLatestVersion(serviceVersions: Map<string, ServiceRegistryEntry>): ServiceRegistryEntry {
    let latest: ServiceRegistryEntry | null = null;
    let latestParsed = { major: 0, minor: 0, patch: 0 };

    for (const entry of serviceVersions.values()) {
      try {
        const parsed = this.parseVersion(entry.version);
        if (!latest || this.isVersionGreater(parsed, latestParsed)) {
          latest = entry;
          latestParsed = parsed;
        }
      } catch (error) {
        // If version parsing fails, fall back to registration time
        if (!latest || entry.registrationTime > latest.registrationTime) {
          latest = entry;
        }
      }
    }

    return latest!;
  }

  /**
   * Check if version A is greater than version B
   */
  private isVersionGreater(
    a: { major: number; minor: number; patch: number },
    b: { major: number; minor: number; patch: number }
  ): boolean {
    if (a.major !== b.major) return a.major > b.major;
    if (a.minor !== b.minor) return a.minor > b.minor;
    return a.patch > b.patch;
  }

  /**
   * Create service version info from registry entry
   */
  private createServiceVersionInfo(entry: ServiceRegistryEntry): ServiceVersionInfo {
    return {
      version: entry.version,
      isCompatible: true,
      compatibilityLevel: 'exact',
      deprecationInfo: entry.deprecationInfo,
    };
  }

  /**
   * Get all versions of a specific service
   */
  async getServiceVersions(serviceName: string): Promise<{
    versions: string[];
    latestVersion: string;
    deprecatedVersions: string[];
    compatibilityMatrix: Record<string, string[]>;
  }> {
    return await this.registryMutex.runExclusive(async () => {
      const serviceVersions = this.versionRegistry.get(serviceName);

      if (!serviceVersions || serviceVersions.size === 0) {
        return {
          versions: [],
          latestVersion: '',
          deprecatedVersions: [],
          compatibilityMatrix: {},
        };
      }

      const versions = Array.from(serviceVersions.keys());
      const latestVersion = this.getLatestVersion(serviceVersions).version;
      const deprecatedVersions = versions.filter((v) => {
        const entry = serviceVersions.get(v);
        return entry?.deprecationInfo?.isDeprecated;
      });

      const compatibilityMatrix: Record<string, string[]> = {};
      for (const [version, entry] of serviceVersions.entries()) {
        compatibilityMatrix[version] = entry.compatibleVersions;
      }

      return {
        versions,
        latestVersion,
        deprecatedVersions,
        compatibilityMatrix,
      };
    });
  }

  /**
   * Get service discovery performance metrics
   */
  async getServiceDiscoveryMetrics(): Promise<ServiceDiscoveryMetrics> {
    return await this.registryMutex.runExclusive(() => {
      return this.calculateMetrics();
    });
  }

  /**
   * Reset performance metrics
   */
  async resetMetrics(): Promise<void> {
    return await this.registryMutex.runExclusive(() => {
      this.performanceRecords.length = 0;
      this.metricsCache.clear();
      this.metricsStartTime = new Date();
      this.logger.log('Service discovery performance metrics reset');
    });
  }

  /**
   * Get recent performance records (for debugging)
   */
  async getRecentPerformanceRecords(limit = 100): Promise<ResolutionPerformanceRecord[]> {
    return await this.registryMutex.runExclusive(() => {
      return this.performanceRecords.slice(-limit);
    });
  }

  /**
   * Get performance metrics for a specific service
   */
  async getServiceSpecificMetrics(serviceName: string): Promise<{
    totalRequests: number;
    successfulResolutions: number;
    failedResolutions: number;
    averageResolutionTime: number;
    cacheHitRate: number;
    compatibilityBreakdown: Record<string, number>;
    recentErrors: string[];
  }> {
    return await this.registryMutex.runExclusive(() => {
      const serviceRecords = this.performanceRecords.filter((r) => r.serviceName === serviceName);

      if (serviceRecords.length === 0) {
        return {
          totalRequests: 0,
          successfulResolutions: 0,
          failedResolutions: 0,
          averageResolutionTime: 0,
          cacheHitRate: 0,
          compatibilityBreakdown: {},
          recentErrors: [],
        };
      }

      const successful = serviceRecords.filter((r) => r.success);
      const failed = serviceRecords.filter((r) => !r.success);
      const fromCache = serviceRecords.filter((r) => r.wasFromCache);

      const compatibilityBreakdown: Record<string, number> = {};
      for (const record of serviceRecords) {
        compatibilityBreakdown[record.compatibilityLevel] =
          (compatibilityBreakdown[record.compatibilityLevel] || 0) + 1;
      }

      const recentErrors = failed
        .slice(-10)
        .map((r) => r.errorReason || 'Unknown error')
        .filter((error, index, arr) => arr.indexOf(error) === index);

      const totalResolutionTime = serviceRecords.reduce((sum, r) => sum + r.resolutionTime, 0);

      return {
        totalRequests: serviceRecords.length,
        successfulResolutions: successful.length,
        failedResolutions: failed.length,
        averageResolutionTime: serviceRecords.length > 0 ? totalResolutionTime / serviceRecords.length : 0,
        cacheHitRate: serviceRecords.length > 0 ? (fromCache.length / serviceRecords.length) * 100 : 0,
        compatibilityBreakdown,
        recentErrors,
      };
    });
  }

  /**
   * Register a service in the registry with collision detection (legacy method)
   * This method is called from within mutex-protected operations, so it doesn't need its own mutex
   * @private
   * @deprecated Use registerVersionedService instead
   */
  private registerService(token: string, provider: CrossPluginServiceProvider): string {
    let finalToken = token;
    if (this.serviceRegistry.has(token)) {
      // Handle collision with better token generation
      const newToken = this.createGlobalTokenWithRetry(token);
      this.logger.warn(`Token collision detected, regenerating: ${token} -> ${newToken}`);
      finalToken = newToken;
    }

    // Create a basic registry entry for backward compatibility
    const entry: ServiceRegistryEntry = {
      provider,
      version: '1.0.0',
      compatibleVersions: ['1.0.0'],
      isGlobal: false,
      pluginName: 'unknown',
      serviceName: 'unknown',
      registrationTime: new Date(),
    };

    this.serviceRegistry.set(finalToken, entry);
    return finalToken;
  }

  /**
   * Create a collision-resistant global token using cryptographic hash
   * @param pluginName - Name of the plugin
   * @param serviceName - Name of the service
   * @returns Unique token with cryptographic suffix
   */
  private createGlobalToken(pluginName: string, serviceName: string): string {
    const base = `${pluginName.toUpperCase()}_${serviceName.toUpperCase()}`;
    const hash = randomBytes(4).toString('hex').toUpperCase();
    return `${base}_${hash}`;
  }

  /**
   * Create a global token with retry mechanism for collision handling
   * @param existingToken - Token that already exists
   * @returns New unique token
   */
  private createGlobalTokenWithRetry(existingToken: string): string {
    // Extract plugin and service names from existing token
    const parts = existingToken.split('_');
    if (parts.length < 2) {
      // Fallback: generate completely new token with timestamp
      const timestamp = Date.now().toString(36).toUpperCase();
      return `COLLISION_RESOLVED_${timestamp}`;
    }

    const pluginName = parts[0];
    const serviceName = parts[1];

    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const newToken = this.createGlobalToken(pluginName, serviceName);
      if (!this.serviceRegistry.has(newToken)) {
        return newToken;
      }
      attempts++;
    }

    // Fallback: use timestamp-based token if all attempts fail
    const fallbackToken = `${pluginName}_${serviceName}_${Date.now().toString(36).toUpperCase()}`;
    this.logger.warn(`Failed to generate unique token after ${maxAttempts} attempts, using fallback: ${fallbackToken}`);
    return fallbackToken;
  }

  /**
   * Get detailed information about a specific service token
   * @param token - Service token to inspect
   * @returns Detailed service information
   */
  getServiceDetails(token: string): {
    exists: boolean;
    isGlobal: boolean;
    validation: {
      isValid: boolean;
      securityLevel: 'high' | 'medium' | 'low';
      issues: string[];
      recommendations: string[];
    };
    provider?: CrossPluginServiceProvider;
  } {
    const provider = this.serviceRegistry.get(token);
    const validation = this.validateToken(token);

    return {
      exists: !!provider,
      isGlobal: this.globalTokens.has(token),
      validation,
      provider: provider ? provider.provider : undefined,
    };
  }

  /**
   * Get all service tokens matching a pattern
   * @param pattern - RegExp pattern to match against tokens
   * @returns Array of matching tokens
   */
  findServicesByPattern(pattern: RegExp): string[] {
    return Array.from(this.serviceRegistry.keys()).filter((token) => pattern.test(token));
  }

  /**
   * Get services provided by a specific plugin
   * @param pluginName - Name of the plugin
   * @returns Array of service tokens provided by the plugin
   */
  getServicesByPlugin(pluginName: string): string[] {
    const upperPluginName = pluginName.toUpperCase().replace(/-/g, '_');
    return Array.from(this.serviceRegistry.keys()).filter(
      (token) => token.startsWith(`${upperPluginName}_`) || token.includes(`_${upperPluginName}_`)
    );
  }

  /**
   * Generate a preview of what a token would look like for given plugin/service
   * @param pluginName - Name of the plugin
   * @param serviceName - Name of the service
   * @returns Preview token (not registered)
   */
  previewToken(
    pluginName: string,
    serviceName: string
  ): {
    token: string;
    wouldCollide: boolean;
    validation: {
      isValid: boolean;
      securityLevel: 'high' | 'medium' | 'low';
      issues: string[];
      recommendations: string[];
    };
  } {
    const token = this.createGlobalToken(pluginName, serviceName);
    const wouldCollide = this.serviceRegistry.has(token);
    const validation = this.validateToken(token);

    return {
      token,
      wouldCollide,
      validation,
    };
  }

  /**
   * Clear all services (useful for testing or system reset)
   * Thread-safe operation using mutex protection
   */
  async clearAllServices(): Promise<void> {
    return await this.registryMutex.runExclusive(async () => {
      this.logger.warn('Clearing all cross-plugin services');
      this.serviceRegistry.clear();
      this.globalTokens.clear();
      this.versionRegistry.clear();
      this.deprecatedServices.clear();
      this.performanceRecords.length = 0;
      this.metricsCache.clear();
    });
  }

  /**
   * Record performance metrics for service resolution
   */
  private recordResolutionPerformance(record: ResolutionPerformanceRecord): void {
    // Add to performance records
    this.performanceRecords.push(record);

    // Limit memory usage by removing old records
    if (this.performanceRecords.length > this.maxPerformanceRecords) {
      this.performanceRecords.splice(0, this.performanceRecords.length - this.maxPerformanceRecords);
    }

    // Clean old cache entries periodically
    if (this.performanceRecords.length % 100 === 0) {
      this.cleanOldCacheEntries();
    }
  }

  /**
   * Calculate comprehensive service discovery metrics
   */
  private calculateMetrics(): ServiceDiscoveryMetrics {
    const now = Date.now();
    const successful = this.performanceRecords.filter((r) => r.success);
    const failed = this.performanceRecords.filter((r) => !r.success);
    const fromCache = this.performanceRecords.filter((r) => r.wasFromCache);

    // Calculate total resolution time
    const totalResolutionTime = this.performanceRecords.reduce((sum, r) => sum + r.resolutionTime, 0);

    // Group by service
    const resolutionsByService: Record<string, number> = {};
    const resolutionTimesByService: Record<string, number[]> = {};

    for (const record of this.performanceRecords) {
      resolutionsByService[record.serviceName] = (resolutionsByService[record.serviceName] || 0) + 1;

      if (!resolutionTimesByService[record.serviceName]) {
        resolutionTimesByService[record.serviceName] = [];
      }
      resolutionTimesByService[record.serviceName].push(record.resolutionTime);
    }

    // Group errors by reason
    const errorsByReason: Record<string, number> = {};
    for (const record of failed) {
      const reason = record.errorReason || 'Unknown error';
      errorsByReason[reason] = (errorsByReason[reason] || 0) + 1;
    }

    // Count version compatibility checks and deprecation warnings
    const versionCompatibilityChecks = this.performanceRecords.filter((r) => r.compatibilityLevel !== 'exact').length;

    const deprecationWarnings = this.performanceRecords.filter((r) => {
      const serviceName = r.serviceName;
      const serviceVersions = this.versionRegistry.get(serviceName);
      if (!serviceVersions) return false;

      const entry = serviceVersions.get(r.resolvedVersion);
      return entry?.deprecationInfo?.isDeprecated || false;
    }).length;

    return {
      totalRequests: this.performanceRecords.length,
      successfulResolutions: successful.length,
      failedResolutions: failed.length,
      averageResolutionTime:
        this.performanceRecords.length > 0 ? totalResolutionTime / this.performanceRecords.length : 0,
      cacheHitRate: this.performanceRecords.length > 0 ? (fromCache.length / this.performanceRecords.length) * 100 : 0,
      versionCompatibilityChecks,
      deprecationWarnings,
      resolutionsByService,
      resolutionTimesByService,
      errorsByReason,
      lastResetTime: this.metricsStartTime,
    };
  }

  /**
   * Clean old cache entries to prevent memory leaks
   */
  private cleanOldCacheEntries(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    for (const [key, entry] of this.metricsCache.entries()) {
      if (now - entry.timestamp > this.maxCacheAge) {
        entriesToDelete.push(key);
      }
    }

    for (const key of entriesToDelete) {
      this.metricsCache.delete(key);
    }

    if (entriesToDelete.length > 0) {
      this.logger.debug(`Cleaned ${entriesToDelete.length} expired cache entries`);
    }
  }
}
