export enum PluginState {
  DISCOVERED = 'discovered',
  LOADING = 'loading',
  LOADED = 'loaded',
  FAILED = 'failed',
  UNLOADED = 'unloaded',
}

export enum PluginTransition {
  START_LOADING = 'start_loading',
  COMPLETE_LOADING = 'complete_loading',
  FAIL_LOADING = 'fail_loading',
  UNLOAD = 'unload',
  REDISCOVER = 'rediscover',
}

export interface StateTransition {
  from: PluginState;
  to: PluginState;
  transition: PluginTransition;
  condition?: (context?: any) => boolean;
}

export interface IPluginStateMachine {
  getCurrentState(pluginName: string): PluginState | undefined;
  canTransition(pluginName: string, transition: PluginTransition): boolean;
  transition(pluginName: string, transition: PluginTransition, context?: any): boolean;
  getAllStates(): Map<string, PluginState>;
  getValidTransitions(pluginName: string): PluginTransition[];
  reset(pluginName: string): void;
  resetAll(): void;
}

export interface PluginStateChangeEvent {
  pluginName: string;
  fromState: PluginState | undefined;
  toState: PluginState;
  transition: PluginTransition;
  timestamp: Date;
  context?: any;
}

export type StateChangeListener = (event: PluginStateChangeEvent) => void;