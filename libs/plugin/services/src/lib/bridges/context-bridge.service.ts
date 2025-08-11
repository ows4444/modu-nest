import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { type IContextService, IPluginContextConfig, IPluginMetrics } from '@shared/interfaces';

/**
 * Token for injecting context service
 */
export const CONTEXT_SERVICE_TOKEN = Symbol('CONTEXT_SERVICE');

/**
 * Bridge service to decouple plugin-services from plugin-context
 *
 * This service provides an abstraction layer that allows plugin-services
 * to interact with plugin-context without directly importing its types,
 * preventing circular dependency issues.
 */
@Injectable()
export class ContextBridgeService implements IContextService {
  private readonly logger = new Logger(ContextBridgeService.name);

  constructor(
    @Optional()
    @Inject(CONTEXT_SERVICE_TOKEN)
    private readonly contextService?: IContextService
  ) {
    if (!contextService) {
      this.logger.warn('No context service provided, using fallback implementation');
    }
  }

  /**
   * Get configuration for a plugin
   */
  getConfig(pluginName: string): IPluginContextConfig {
    if (this.contextService) {
      return this.contextService.getConfig(pluginName);
    }

    // Fallback configuration
    return {
      pluginName,
      version: '1.0.0',
      fileAccess: {
        allowedExtensions: ['.json', '.txt'],
        maxFileSize: 10 * 1024 * 1024,
        allowWrite: false,
        allowDelete: false,
        allowExecute: false,
      },
      networkAccess: {
        allowedDomains: [],
        blockedDomains: [],
        allowedPorts: [80, 443],
        blockedPorts: [],
        maxRequestSize: 1024 * 1024,
        requestTimeout: 30000,
      },
      databaseAccess: {
        allowedDatabases: [],
        allowedTables: [],
        allowedOperations: ['SELECT'],
        maxQueryComplexity: 100,
        queryTimeout: 30000,
        maxResultSize: 1000,
      },
    };
  }

  /**
   * Get metrics for a plugin
   */
  getMetrics(pluginName: string): IPluginMetrics {
    if (this.contextService) {
      return this.contextService.getMetrics(pluginName);
    }

    // Fallback metrics
    return {
      memoryUsage: 0,
      cpuUsage: 0,
      requestCount: 0,
      errorCount: 0,
      uptime: 0,
    };
  }

  /**
   * Validate access to a resource
   */
  validateAccess(pluginName: string, resource: string, operation: string): boolean {
    if (this.contextService) {
      return this.contextService.validateAccess(pluginName, resource, operation);
    }

    // Fallback: deny access if no context service
    this.logger.warn(`Access validation failed for plugin ${pluginName} - no context service available`);
    return false;
  }

  /**
   * Check if context service is available
   */
  isAvailable(): boolean {
    return this.contextService !== undefined;
  }
}
