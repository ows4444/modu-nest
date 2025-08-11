import { Injectable, Logger } from '@nestjs/common';
import { PluginStateMachine } from '../state-machine';
import { LoadedPlugin, PluginState } from '@plugin/core';
import { PluginEventEmitter } from '@plugin/services';
import { PluginLoadingState } from '../strategies';

export interface StateManagerConfig {
  enableStateTransitionLogging: boolean;
  maxStateHistorySize: number;
  autoRecoveryEnabled: boolean;
}

export interface PluginStateSnapshot {
  pluginName: string;
  state: PluginState;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

/**
 * Manages plugin state transitions, history, and recovery
 * Extracted from the massive legacy PluginLoaderService
 */
@Injectable()
export class PluginStateManagerService {
  private readonly logger = new Logger(PluginStateManagerService.name);

  private readonly stateMachine = new PluginStateMachine();
  private readonly loadingState = new Map<string, PluginLoadingState>();
  private readonly stateHistory = new Map<string, PluginStateSnapshot[]>();
  private readonly eventEmitter = new PluginEventEmitter();

  private config: StateManagerConfig = {
    enableStateTransitionLogging: true,
    maxStateHistorySize: 50,
    autoRecoveryEnabled: true,
  };

  constructor() {
    this.setupStateTransitionHandlers();
  }

  /**
   * Set plugin loading state with history tracking
   */
  setPluginState(pluginName: string, state: PluginLoadingState): void {
    const previousState = this.loadingState.get(pluginName);
    this.loadingState.set(pluginName, state);

    // Record state history
    this.recordStateChange(pluginName, state.currentState, {
      previousState: previousState?.currentState,
      loadingProgress: state.loadingProgress,
      error: state.error?.message,
    });

    if (this.config.enableStateTransitionLogging) {
      this.logger.debug(
        `Plugin ${pluginName} state changed: ${previousState?.currentState || 'unknown'} -> ${state.currentState}`
      );
    }

    // Emit state change event
    this.eventEmitter.emit('plugin.state.changed', {
      pluginName,
      previousState: previousState?.currentState,
      newState: state.currentState,
      metadata: state.metadata,
    });
  }

  /**
   * Get current plugin loading state
   */
  getPluginState(pluginName: string): PluginLoadingState | undefined {
    return this.loadingState.get(pluginName);
  }

  /**
   * Get all loading states
   */
  getAllLoadingStates(): Map<string, PluginLoadingState> {
    return new Map(this.loadingState);
  }

  /**
   * Get plugin state history
   */
  getPluginStateHistory(pluginName: string): PluginStateSnapshot[] {
    return this.stateHistory.get(pluginName) || [];
  }

  /**
   * Clear plugin state and history
   */
  clearPluginState(pluginName: string): void {
    this.loadingState.delete(pluginName);
    this.stateHistory.delete(pluginName);

    this.logger.debug(`Cleared state for plugin: ${pluginName}`);
  }

  /**
   * Transition plugin to new state using state machine
   */
  async transitionPluginState(
    pluginName: string,
    transition: string,
    context?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const currentState = this.loadingState.get(pluginName);
      if (!currentState) {
        this.logger.warn(`Cannot transition unknown plugin: ${pluginName}`);
        return false;
      }

      const success = await this.stateMachine.transition(pluginName, transition, context);

      if (success) {
        // Update loading state after successful transition
        const newState = await this.stateMachine.getState(pluginName);
        const updatedLoadingState: PluginLoadingState = {
          ...currentState,
          currentState: newState,
          lastTransition: transition,
          transitionTimestamp: new Date(),
        };

        this.setPluginState(pluginName, updatedLoadingState);
      }

      return success;
    } catch (error) {
      this.logger.error(`Failed to transition plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * Check if plugin is in a specific state
   */
  isPluginInState(pluginName: string, state: PluginState): boolean {
    const loadingState = this.loadingState.get(pluginName);
    return loadingState?.currentState === state;
  }

  /**
   * Get plugins by state
   */
  getPluginsByState(state: PluginState): string[] {
    const plugins: string[] = [];

    for (const [pluginName, loadingState] of this.loadingState) {
      if (loadingState.currentState === state) {
        plugins.push(pluginName);
      }
    }

    return plugins;
  }

  /**
   * Reset plugin to initial state
   */
  async resetPluginState(pluginName: string): Promise<boolean> {
    try {
      await this.stateMachine.reset(pluginName);

      const initialState: PluginLoadingState = {
        currentState: PluginState.UNLOADED,
        loadingProgress: 0,
        startTime: new Date(),
        metadata: {},
      };

      this.setPluginState(pluginName, initialState);

      this.logger.log(`Reset plugin ${pluginName} to initial state`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to reset plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * Get state manager statistics
   */
  getStateManagerStats(): {
    totalPlugins: number;
    stateDistribution: Record<PluginState, number>;
    totalStateTransitions: number;
    averageTransitionsPerPlugin: number;
  } {
    const stateDistribution: Record<PluginState, number> = {} as Record<PluginState, number>;
    let totalTransitions = 0;

    // Initialize state distribution
    Object.values(PluginState).forEach((state) => {
      stateDistribution[state] = 0;
    });

    // Count states and transitions
    for (const [pluginName, loadingState] of this.loadingState) {
      stateDistribution[loadingState.currentState]++;
      totalTransitions += this.stateHistory.get(pluginName)?.length || 0;
    }

    return {
      totalPlugins: this.loadingState.size,
      stateDistribution,
      totalStateTransitions: totalTransitions,
      averageTransitionsPerPlugin: this.loadingState.size > 0 ? totalTransitions / this.loadingState.size : 0,
    };
  }

  /**
   * Configure state manager behavior
   */
  configure(config: Partial<StateManagerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.debug('State manager configuration updated', this.config);
  }

  private recordStateChange(pluginName: string, newState: PluginState, metadata: Record<string, unknown>): void {
    let history = this.stateHistory.get(pluginName);
    if (!history) {
      history = [];
      this.stateHistory.set(pluginName, history);
    }

    history.push({
      pluginName,
      state: newState,
      timestamp: new Date(),
      metadata,
    });

    // Trim history if it exceeds max size
    if (history.length > this.config.maxStateHistorySize) {
      history.shift();
    }
  }

  private setupStateTransitionHandlers(): void {
    // Setup automatic recovery handlers if enabled
    if (this.config.autoRecoveryEnabled) {
      this.eventEmitter.on('plugin.state.changed', async (event: any) => {
        if (event.newState === PluginState.FAILED) {
          this.logger.warn(`Plugin ${event.pluginName} failed, considering auto-recovery`);
          // Auto-recovery logic can be implemented here
        }
      });
    }
  }
}
