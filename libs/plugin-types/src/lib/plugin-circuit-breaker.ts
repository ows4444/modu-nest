import { Injectable, Logger } from '@nestjs/common';

/**
 * Custom error thrown when circuit breaker is open
 */
export class PluginCircuitOpenError extends Error {
  constructor(message: string, public readonly pluginName: string) {
    super(message);
    this.name = 'PluginCircuitOpenError';
  }
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Circuit is open, requests fail fast
  HALF_OPEN = 'half-open' // Testing if service is back to normal
}

/**
 * Configuration for circuit breaker behavior
 */
export interface CircuitBreakerConfig {
  /** Maximum number of failures before opening circuit */
  maxFailures: number;
  /** Timeout in milliseconds before transitioning from open to half-open */
  resetTimeout: number;
  /** Timeout for individual operations in milliseconds */
  operationTimeout: number;
  /** Number of successful calls needed in half-open state to close circuit */
  halfOpenMaxCalls: number;
  /** Monitoring window for failure rate calculation (milliseconds) */
  monitoringWindow: number;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  pluginName: string;
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  openTime?: Date;
  halfOpenCalls: number;
  totalCalls: number;
  failureRate: number;
  uptime: number;
}

/**
 * Plugin-specific circuit breaker implementation
 * Provides resilience patterns for plugin operations
 */
@Injectable()
export class PluginCircuitBreaker {
  private readonly logger = new Logger(PluginCircuitBreaker.name);
  
  // Plugin-specific failure tracking
  private readonly failures = new Map<string, number>();
  private readonly successCount = new Map<string, number>();
  private readonly totalCalls = new Map<string, number>();
  
  // Circuit state management
  private readonly circuitStates = new Map<string, CircuitBreakerState>();
  private readonly openTimestamps = new Map<string, number>();
  private readonly lastFailureTime = new Map<string, Date>();
  private readonly lastSuccessTime = new Map<string, Date>();
  private readonly halfOpenCalls = new Map<string, number>();
  
  // Timers for automatic state transitions
  private readonly resetTimers = new Map<string, NodeJS.Timeout>();
  
  // Default configuration
  private readonly defaultConfig: CircuitBreakerConfig = {
    maxFailures: 3,
    resetTimeout: 30000, // 30 seconds
    operationTimeout: 5000, // 5 seconds
    halfOpenMaxCalls: 3,
    monitoringWindow: 60000, // 1 minute
  };
  
  // Plugin-specific configurations
  private readonly pluginConfigs = new Map<string, CircuitBreakerConfig>();

  /**
   * Set custom configuration for a specific plugin
   */
  setPluginConfig(pluginName: string, config: Partial<CircuitBreakerConfig>): void {
    const fullConfig = { ...this.defaultConfig, ...config };
    this.pluginConfigs.set(pluginName, fullConfig);
    this.logger.debug(`Updated circuit breaker config for plugin '${pluginName}':`, fullConfig);
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(pluginName: string, operation: () => Promise<T>): Promise<T> {
    const config = this.getConfig(pluginName);
    const state = this.getCurrentState(pluginName);
    
    // Increment total call count
    this.totalCalls.set(pluginName, (this.totalCalls.get(pluginName) || 0) + 1);
    
    // Handle different circuit states
    switch (state) {
      case CircuitBreakerState.OPEN:
        this.logger.debug(`Circuit breaker is OPEN for plugin '${pluginName}' - failing fast`);
        throw new PluginCircuitOpenError(`Circuit breaker open for plugin: ${pluginName}`, pluginName);
        
      case CircuitBreakerState.HALF_OPEN:
        return await this.executeInHalfOpen(pluginName, operation, config);
        
      case CircuitBreakerState.CLOSED:
      default:
        return await this.executeInClosed(pluginName, operation, config);
    }
  }

  /**
   * Execute operation when circuit is closed (normal operation)
   */
  private async executeInClosed<T>(
    pluginName: string, 
    operation: () => Promise<T>, 
    config: CircuitBreakerConfig
  ): Promise<T> {
    try {
      const result = await this.executeWithTimeout(operation, config.operationTimeout);
      this.onSuccess(pluginName);
      return result;
    } catch (error) {
      this.onFailure(pluginName, error);
      throw error;
    }
  }

  /**
   * Execute operation when circuit is half-open (testing recovery)
   */
  private async executeInHalfOpen<T>(
    pluginName: string, 
    operation: () => Promise<T>, 
    config: CircuitBreakerConfig
  ): Promise<T> {
    const currentHalfOpenCalls = this.halfOpenCalls.get(pluginName) || 0;
    
    // Limit concurrent calls in half-open state
    if (currentHalfOpenCalls >= config.halfOpenMaxCalls) {
      this.logger.debug(`Half-open call limit exceeded for plugin '${pluginName}' - failing fast`);
      throw new PluginCircuitOpenError(`Circuit breaker half-open call limit exceeded for plugin: ${pluginName}`, pluginName);
    }
    
    this.halfOpenCalls.set(pluginName, currentHalfOpenCalls + 1);
    
    try {
      const result = await this.executeWithTimeout(operation, config.operationTimeout);
      this.onHalfOpenSuccess(pluginName, config);
      return result;
    } catch (error) {
      this.onHalfOpenFailure(pluginName, error);
      throw error;
    } finally {
      this.halfOpenCalls.set(pluginName, Math.max(0, (this.halfOpenCalls.get(pluginName) || 0) - 1));
    }
  }

  /**
   * Execute operation with timeout protection
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>, timeout: number): Promise<T> {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
   * Handle successful operation
   */
  private onSuccess(pluginName: string): void {
    // Reset failure count on success
    this.failures.set(pluginName, 0);
    this.successCount.set(pluginName, (this.successCount.get(pluginName) || 0) + 1);
    this.lastSuccessTime.set(pluginName, new Date());
    
    // Ensure circuit is closed
    this.circuitStates.set(pluginName, CircuitBreakerState.CLOSED);
    
    this.logger.debug(`✓ Operation succeeded for plugin '${pluginName}' - circuit remains CLOSED`);
  }

  /**
   * Handle failed operation
   */
  private onFailure(pluginName: string, error: unknown): void {
    const config = this.getConfig(pluginName);
    const currentFailures = (this.failures.get(pluginName) || 0) + 1;
    
    this.failures.set(pluginName, currentFailures);
    this.lastFailureTime.set(pluginName, new Date());
    
    this.logger.warn(`✗ Operation failed for plugin '${pluginName}' (${currentFailures}/${config.maxFailures}):`, error);
    
    // Open circuit if failure threshold exceeded
    if (currentFailures >= config.maxFailures) {
      this.openCircuit(pluginName, config);
    }
  }

  /**
   * Handle successful operation in half-open state
   */
  private onHalfOpenSuccess(pluginName: string, config: CircuitBreakerConfig): void {
    const currentHalfOpenCalls = this.halfOpenCalls.get(pluginName) || 0;
    
    this.successCount.set(pluginName, (this.successCount.get(pluginName) || 0) + 1);
    this.lastSuccessTime.set(pluginName, new Date());
    
    // Close circuit if enough successful calls in half-open state
    if (currentHalfOpenCalls >= config.halfOpenMaxCalls - 1) {
      this.closeCircuit(pluginName);
    }
    
    this.logger.debug(`✓ Half-open operation succeeded for plugin '${pluginName}' (${currentHalfOpenCalls + 1}/${config.halfOpenMaxCalls})`);
  }

  /**
   * Handle failed operation in half-open state
   */
  private onHalfOpenFailure(pluginName: string, error: unknown): void {
    this.failures.set(pluginName, (this.failures.get(pluginName) || 0) + 1);
    this.lastFailureTime.set(pluginName, new Date());
    
    // Immediately open circuit on failure in half-open state
    this.openCircuit(pluginName, this.getConfig(pluginName));
    
    this.logger.warn(`✗ Half-open operation failed for plugin '${pluginName}' - reopening circuit:`, error);
  }

  /**
   * Open the circuit for a plugin
   */
  private openCircuit(pluginName: string, config: CircuitBreakerConfig): void {
    this.circuitStates.set(pluginName, CircuitBreakerState.OPEN);
    this.openTimestamps.set(pluginName, Date.now());
    this.halfOpenCalls.set(pluginName, 0);
    
    // Clear any existing reset timer
    const existingTimer = this.resetTimers.get(pluginName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set timer to transition to half-open
    const resetTimer = setTimeout(() => {
      this.transitionToHalfOpen(pluginName);
    }, config.resetTimeout);
    
    this.resetTimers.set(pluginName, resetTimer);
    
    this.logger.warn(`🔴 Circuit breaker OPENED for plugin '${pluginName}' - will retry in ${config.resetTimeout}ms`);
  }

  /**
   * Close the circuit for a plugin
   */
  private closeCircuit(pluginName: string): void {
    this.circuitStates.set(pluginName, CircuitBreakerState.CLOSED);
    this.failures.set(pluginName, 0);
    this.halfOpenCalls.set(pluginName, 0);
    this.openTimestamps.delete(pluginName);
    
    // Clear reset timer
    const resetTimer = this.resetTimers.get(pluginName);
    if (resetTimer) {
      clearTimeout(resetTimer);
      this.resetTimers.delete(pluginName);
    }
    
    this.logger.log(`🟢 Circuit breaker CLOSED for plugin '${pluginName}' - normal operation resumed`);
  }

  /**
   * Transition circuit from open to half-open
   */
  private transitionToHalfOpen(pluginName: string): void {
    this.circuitStates.set(pluginName, CircuitBreakerState.HALF_OPEN);
    this.halfOpenCalls.set(pluginName, 0);
    
    this.resetTimers.delete(pluginName);
    
    this.logger.log(`🟡 Circuit breaker transitioned to HALF_OPEN for plugin '${pluginName}' - testing recovery`);
  }

  /**
   * Get current circuit state for a plugin
   */
  getCurrentState(pluginName: string): CircuitBreakerState {
    return this.circuitStates.get(pluginName) || CircuitBreakerState.CLOSED;
  }

  /**
   * Check if circuit is open for a plugin
   */
  isCircuitOpen(pluginName: string): boolean {
    return this.getCurrentState(pluginName) === CircuitBreakerState.OPEN;
  }

  /**
   * Get configuration for a plugin
   */
  private getConfig(pluginName: string): CircuitBreakerConfig {
    return this.pluginConfigs.get(pluginName) || this.defaultConfig;
  }

  /**
   * Get comprehensive statistics for a plugin
   */
  getPluginStats(pluginName: string): CircuitBreakerStats {
    const state = this.getCurrentState(pluginName);
    const failureCount = this.failures.get(pluginName) || 0;
    const successCount = this.successCount.get(pluginName) || 0;
    const totalCalls = this.totalCalls.get(pluginName) || 0;
    const halfOpenCalls = this.halfOpenCalls.get(pluginName) || 0;
    
    // Calculate failure rate
    const failureRate = totalCalls > 0 ? (failureCount / totalCalls) * 100 : 0;
    
    // Calculate uptime (time circuit has been closed)
    const openTime = this.openTimestamps.get(pluginName);
    const currentTime = Date.now();
    let uptime = 100; // Default to 100% if never opened
    
    if (openTime) {
      const totalTime = currentTime - (this.lastSuccessTime.get(pluginName)?.getTime() || currentTime);
      const downTime = currentTime - openTime;
      uptime = totalTime > 0 ? ((totalTime - downTime) / totalTime) * 100 : 0;
    }

    return {
      pluginName,
      state,
      failureCount,
      successCount,
      lastFailureTime: this.lastFailureTime.get(pluginName),
      lastSuccessTime: this.lastSuccessTime.get(pluginName),
      openTime: openTime ? new Date(openTime) : undefined,
      halfOpenCalls,
      totalCalls,
      failureRate: Math.round(failureRate * 100) / 100,
      uptime: Math.round(uptime * 100) / 100,
    };
  }

  /**
   * Get statistics for all plugins
   */
  getAllStats(): CircuitBreakerStats[] {
    const allPluginNames = new Set<string>();
    
    // Collect all plugin names from various maps
    this.failures.forEach((_, pluginName) => allPluginNames.add(pluginName));
    this.successCount.forEach((_, pluginName) => allPluginNames.add(pluginName));
    this.circuitStates.forEach((_, pluginName) => allPluginNames.add(pluginName));
    
    return Array.from(allPluginNames).map(pluginName => this.getPluginStats(pluginName));
  }

  /**
   * Reset circuit breaker for a specific plugin
   */
  resetPlugin(pluginName: string): void {
    this.failures.delete(pluginName);
    this.successCount.delete(pluginName);
    this.totalCalls.delete(pluginName);
    this.circuitStates.delete(pluginName);
    this.openTimestamps.delete(pluginName);
    this.lastFailureTime.delete(pluginName);
    this.lastSuccessTime.delete(pluginName);
    this.halfOpenCalls.delete(pluginName);
    
    const resetTimer = this.resetTimers.get(pluginName);
    if (resetTimer) {
      clearTimeout(resetTimer);
      this.resetTimers.delete(pluginName);
    }
    
    this.logger.log(`🔄 Circuit breaker reset for plugin '${pluginName}'`);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    const allPluginNames = new Set<string>();
    this.failures.forEach((_, pluginName) => allPluginNames.add(pluginName));
    
    allPluginNames.forEach(pluginName => this.resetPlugin(pluginName));
    
    this.logger.log('🔄 All circuit breakers reset');
  }

  /**
   * Cleanup resources (call on shutdown)
   */
  destroy(): void {
    // Clear all timers
    this.resetTimers.forEach((timer) => clearTimeout(timer));
    this.resetTimers.clear();
    
    this.logger.log('🧹 Circuit breaker cleanup completed');
  }
}