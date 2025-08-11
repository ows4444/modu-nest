import { Injectable, Logger } from '@nestjs/common';
import { PluginManifest } from '@plugin/types';
import { PluginCircuitBreaker } from '@plugin/services';

export interface CircuitBreakerConfig {
  maxFailures: number;
  resetTimeout: number;
  operationTimeout: number;
  halfOpenMaxCalls?: number;
  monitoringWindow?: number;
}

export interface PluginCircuitBreakerContext {
  pluginName: string;
  manifest: PluginManifest;
  trustLevel?: string;
  previousFailures?: number;
}

@Injectable()
export class PluginCircuitBreakerConfigService {
  private readonly logger = new Logger(PluginCircuitBreakerConfigService.name);

  /**
   * Configure circuit breaker settings based on plugin characteristics
   */
  configureCircuitBreaker(circuitBreaker: PluginCircuitBreaker, context: PluginCircuitBreakerContext): void {
    const config = this.determineCircuitBreakerConfig(context);

    circuitBreaker.setPluginConfig(context.pluginName, config);

    this.logger.debug(`Circuit breaker configured for ${context.pluginName}: ${JSON.stringify(config)}`);
  }

  /**
   * Determine appropriate circuit breaker configuration based on plugin context
   */
  private determineCircuitBreakerConfig(context: PluginCircuitBreakerContext): CircuitBreakerConfig {
    const { manifest, trustLevel, previousFailures = 0 } = context;

    // Base configuration for different plugin types
    let config: CircuitBreakerConfig;

    if (manifest.critical === true) {
      // Critical plugins get strict circuit breaker settings
      config = {
        maxFailures: 1,
        resetTimeout: 5000, // 5 seconds
        operationTimeout: 30000, // 30 seconds (more time for critical plugins)
        halfOpenMaxCalls: 1,
        monitoringWindow: 60000, // 1 minute
      };
    } else if (manifest.critical === false) {
      // Non-critical plugins get more lenient settings
      config = {
        maxFailures: 3,
        resetTimeout: 15000, // 15 seconds
        operationTimeout: 10000, // 10 seconds
        halfOpenMaxCalls: 2,
        monitoringWindow: 120000, // 2 minutes
      };
    } else {
      // Default configuration for plugins without explicit criticality
      config = {
        maxFailures: 2,
        resetTimeout: 10000, // 10 seconds
        operationTimeout: 15000, // 15 seconds
        halfOpenMaxCalls: 1,
        monitoringWindow: 90000, // 1.5 minutes
      };
    }

    // Adjust based on trust level if available
    if (trustLevel) {
      config = this.adjustConfigForTrustLevel(config, trustLevel);
    }

    // Adjust based on previous failure history
    if (previousFailures > 0) {
      config = this.adjustConfigForFailureHistory(config, previousFailures);
    }

    // Apply manifest-specific circuit breaker overrides
    // Note: monitoring property doesn't exist on PluginManifest, so this will always be undefined
    if ((manifest as any).monitoring?.circuitBreaker) {
      config = this.applyManifestOverrides(config, (manifest as any).monitoring.circuitBreaker);
    }

    return config;
  }

  /**
   * Adjust configuration based on plugin trust level
   */
  private adjustConfigForTrustLevel(config: CircuitBreakerConfig, trustLevel: string): CircuitBreakerConfig {
    switch (trustLevel) {
      case 'internal':
        // Internal plugins get most lenient settings
        return {
          ...config,
          maxFailures: Math.max(config.maxFailures, 5),
          resetTimeout: Math.min(config.resetTimeout, 30000),
          operationTimeout: Math.max(config.operationTimeout, 45000),
        };

      case 'verified':
        // Verified plugins get moderate settings
        return {
          ...config,
          maxFailures: Math.max(config.maxFailures, 3),
          resetTimeout: Math.min(config.resetTimeout, 20000),
        };

      case 'community':
        // Community plugins use default settings
        return config;

      case 'untrusted':
      case 'quarantined':
        // Untrusted plugins get strict settings
        return {
          ...config,
          maxFailures: 1,
          resetTimeout: Math.max(config.resetTimeout, 30000),
          operationTimeout: Math.min(config.operationTimeout, 5000),
        };

      default:
        return config;
    }
  }

  /**
   * Adjust configuration based on previous failure history
   */
  private adjustConfigForFailureHistory(config: CircuitBreakerConfig, previousFailures: number): CircuitBreakerConfig {
    if (previousFailures >= 5) {
      // Plugins with high failure history get stricter settings
      return {
        ...config,
        maxFailures: Math.max(1, config.maxFailures - 1),
        resetTimeout: config.resetTimeout * 1.5,
        operationTimeout: Math.min(config.operationTimeout, 8000),
      };
    } else if (previousFailures >= 2) {
      // Plugins with some failure history get slightly stricter settings
      return {
        ...config,
        resetTimeout: config.resetTimeout * 1.2,
      };
    }

    return config;
  }

  /**
   * Apply manifest-specific circuit breaker overrides
   */
  private applyManifestOverrides(config: CircuitBreakerConfig, manifestConfig: any): CircuitBreakerConfig {
    const overrides: Partial<CircuitBreakerConfig> = {};

    if (manifestConfig.enabled === false) {
      // If circuit breaker is disabled in manifest, use very lenient settings
      overrides.maxFailures = 10;
      overrides.operationTimeout = 60000;
    }

    if (typeof manifestConfig.failureThreshold === 'number') {
      overrides.maxFailures = manifestConfig.failureThreshold;
    }

    if (typeof manifestConfig.recoveryTimeout === 'number') {
      overrides.resetTimeout = manifestConfig.recoveryTimeout;
    }

    if (typeof manifestConfig.operationTimeout === 'number') {
      overrides.operationTimeout = manifestConfig.operationTimeout;
    }

    if (typeof manifestConfig.halfOpenMaxCalls === 'number') {
      overrides.halfOpenMaxCalls = manifestConfig.halfOpenMaxCalls;
    }

    return { ...config, ...overrides };
  }

  /**
   * Get recommended configuration for a plugin type
   */
  getRecommendedConfig(pluginType: 'critical' | 'standard' | 'experimental'): CircuitBreakerConfig {
    switch (pluginType) {
      case 'critical':
        return {
          maxFailures: 1,
          resetTimeout: 5000,
          operationTimeout: 30000,
          halfOpenMaxCalls: 1,
          monitoringWindow: 60000,
        };

      case 'standard':
        return {
          maxFailures: 2,
          resetTimeout: 10000,
          operationTimeout: 15000,
          halfOpenMaxCalls: 1,
          monitoringWindow: 90000,
        };

      case 'experimental':
        return {
          maxFailures: 3,
          resetTimeout: 15000,
          operationTimeout: 10000,
          halfOpenMaxCalls: 2,
          monitoringWindow: 120000,
        };

      default:
        return this.getRecommendedConfig('standard');
    }
  }
}
