import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CrossPluginServiceConfig, PluginManifest } from '@modu-nest/plugin-types';

export interface CrossPluginServiceProvider {
  provide: string;
  useClass?: any;
  useValue?: any;
  useFactory?: (...args: any[]) => any;
  inject?: any[];
}

@Injectable()
export class CrossPluginServiceManager {
  private readonly logger = new Logger(CrossPluginServiceManager.name);
  private readonly serviceRegistry = new Map<string, CrossPluginServiceProvider>();
  private readonly globalTokens = new Set<string>();

  /**
   * Create cross-plugin service providers based on plugin manifest configuration
   */
  createCrossPluginProviders(
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
          providers.push(provider);
          this.registerService(serviceConfig.token, provider);
          
          if (serviceConfig.global) {
            this.globalTokens.add(serviceConfig.token);
          }

          this.logger.debug(
            `Created cross-plugin provider '${serviceConfig.token}' for service '${serviceConfig.serviceName}' from plugin '${pluginName}'`
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
   */
  createGlobalServiceProviders(
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
        
        const provider: CrossPluginServiceProvider = {
          provide: globalToken,
          useClass: serviceClass,
        };

        providers.push(provider);
        this.registerService(globalToken, provider);
        this.globalTokens.add(globalToken);

        this.logger.debug(`Created global provider '${globalToken}' for ${pluginName}:${serviceName}`);
      }
    }

    return providers;
  }

  /**
   * Get a cross-plugin service provider by token
   */
  getServiceProvider(token: string): CrossPluginServiceProvider | undefined {
    return this.serviceRegistry.get(token);
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
   */
  removePluginServices(pluginName: string): void {
    const tokensToRemove: string[] = [];
    
    for (const [token] of this.serviceRegistry) {
      // Check if this token belongs to the plugin being removed
      if (token.startsWith(`${pluginName.toUpperCase()}_`) || 
          token.includes(`_${pluginName.toUpperCase()}_`)) {
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
   */
  getStatistics(): {
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
      this.logger.warn(
        `Service '${config.serviceName}' not found in plugin '${pluginName}' exports`
      );
      return null;
    }

    return {
      provide: config.token,
      useClass: serviceClass,
    };
  }

  private registerService(token: string, provider: CrossPluginServiceProvider): void {
    if (this.serviceRegistry.has(token)) {
      // Handle collision with better token generation
      const newToken = this.createGlobalTokenWithRetry(token);
      this.logger.warn(`Token collision detected, regenerating: ${token} -> ${newToken}`);
      token = newToken;
    }
    this.serviceRegistry.set(token, provider);
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
      provider: provider || undefined,
    };
  }

  /**
   * Get all service tokens matching a pattern
   * @param pattern - RegExp pattern to match against tokens
   * @returns Array of matching tokens
   */
  findServicesByPattern(pattern: RegExp): string[] {
    return Array.from(this.serviceRegistry.keys()).filter(token => pattern.test(token));
  }

  /**
   * Get services provided by a specific plugin
   * @param pluginName - Name of the plugin
   * @returns Array of service tokens provided by the plugin
   */
  getServicesByPlugin(pluginName: string): string[] {
    const upperPluginName = pluginName.toUpperCase().replace(/-/g, '_');
    return Array.from(this.serviceRegistry.keys()).filter(token => 
      token.startsWith(`${upperPluginName}_`) || 
      token.includes(`_${upperPluginName}_`)
    );
  }

  /**
   * Generate a preview of what a token would look like for given plugin/service
   * @param pluginName - Name of the plugin
   * @param serviceName - Name of the service
   * @returns Preview token (not registered)
   */
  previewToken(pluginName: string, serviceName: string): {
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
   */
  clearAllServices(): void {
    this.logger.warn('Clearing all cross-plugin services');
    this.serviceRegistry.clear();
    this.globalTokens.clear();
  }
}