import { Injectable, Logger } from '@nestjs/common';
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
   * Get statistics about cross-plugin services
   */
  getStatistics(): {
    totalServices: number;
    globalServices: number;
    localServices: number;
    servicesByPlugin: Record<string, number>;
  } {
    const servicesByPlugin: Record<string, number> = {};
    let globalServices = 0;

    for (const token of this.serviceRegistry.keys()) {
      if (this.globalTokens.has(token)) {
        globalServices++;
      }

      // Extract plugin name from token (assuming format PLUGIN_SERVICE or similar)
      const pluginMatch = token.match(/^([A-Z_]+)_/);
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
      this.logger.warn(`Cross-plugin service token '${token}' is already registered. Overwriting.`);
    }
    this.serviceRegistry.set(token, provider);
  }

  private createGlobalToken(pluginName: string, serviceName: string): string {
    return `${pluginName.toUpperCase()}_${serviceName.toUpperCase()}`;
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