import { PluginState, PluginTransition } from '@modu-nest/plugin-types';

export interface StateTransition {
  from: PluginState;
  to: PluginState;
  transition: PluginTransition;
  condition?: (context?: unknown) => boolean;
  recoveryPolicy?: RecoveryPolicy;
}

export interface RecoveryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  exponentialBackoff: boolean;
  rollbackState?: PluginState;
  conditions?: {
    canRetry?: (context?: unknown) => boolean;
    canRollback?: (context?: unknown) => boolean;
  };
}

export interface FailureContext {
  error: Error;
  attempt: number;
  timestamp: Date;
  previousState?: PluginState;
  recoveryAttempted?: boolean;
}

export interface IPluginStateMachine {
  getCurrentState(pluginName: string): PluginState | undefined;
  canTransition(pluginName: string, transition: PluginTransition): boolean;
  transition(pluginName: string, transition: PluginTransition, context?: unknown): boolean;
  getAllStates(): Map<string, PluginState>;
  getValidTransitions(pluginName: string): PluginTransition[];
  reset(pluginName: string): void;
  resetAll(): void;
  retryTransition(pluginName: string, context?: FailureContext): Promise<boolean>;
  rollbackToState(pluginName: string, targetState: PluginState, context?: unknown): boolean;
  getFailureHistory(pluginName: string): FailureContext[];
  clearFailureHistory(pluginName: string): void;
}

export interface PluginStateChangeEvent {
  pluginName: string;
  fromState: PluginState | undefined;
  toState: PluginState;
  transition: PluginTransition;
  timestamp: Date;
  context?: unknown;
}

export type StateChangeListener = (event: PluginStateChangeEvent) => void;
