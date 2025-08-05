import { Injectable, Logger } from '@nestjs/common';
import {
  IPluginStateMachine,
  PluginState,
  PluginTransition,
  StateTransition,
  PluginStateChangeEvent,
  StateChangeListener,
} from './plugin-state-machine.interface';

@Injectable()
export class PluginStateMachine implements IPluginStateMachine {
  private readonly logger = new Logger(PluginStateMachine.name);
  private readonly pluginStates = new Map<string, PluginState>();
  private readonly listeners: StateChangeListener[] = [];

  private readonly stateTransitions: StateTransition[] = [
    // From DISCOVERED
    {
      from: PluginState.DISCOVERED,
      to: PluginState.LOADING,
      transition: PluginTransition.START_LOADING,
    },
    {
      from: PluginState.DISCOVERED,
      to: PluginState.UNLOADED,
      transition: PluginTransition.UNLOAD,
    },

    // From LOADING
    {
      from: PluginState.LOADING,
      to: PluginState.LOADED,
      transition: PluginTransition.COMPLETE_LOADING,
    },
    {
      from: PluginState.LOADING,
      to: PluginState.FAILED,
      transition: PluginTransition.FAIL_LOADING,
    },

    // From LOADED
    {
      from: PluginState.LOADED,
      to: PluginState.UNLOADED,
      transition: PluginTransition.UNLOAD,
    },
    {
      from: PluginState.LOADED,
      to: PluginState.LOADING,
      transition: PluginTransition.START_LOADING, // For reload scenarios
    },

    // From FAILED
    {
      from: PluginState.FAILED,
      to: PluginState.LOADING,
      transition: PluginTransition.START_LOADING, // For retry scenarios
    },
    {
      from: PluginState.FAILED,
      to: PluginState.UNLOADED,
      transition: PluginTransition.UNLOAD,
    },

    // From UNLOADED
    {
      from: PluginState.UNLOADED,
      to: PluginState.DISCOVERED,
      transition: PluginTransition.REDISCOVER,
    },
    {
      from: PluginState.UNLOADED,
      to: PluginState.LOADING,
      transition: PluginTransition.START_LOADING, // Direct loading scenarios
    },
  ];

  getCurrentState(pluginName: string): PluginState | undefined {
    return this.pluginStates.get(pluginName);
  }

  canTransition(pluginName: string, transition: PluginTransition): boolean {
    const currentState = this.pluginStates.get(pluginName);
    
    // If plugin doesn't exist and we're trying to discover it, allow it
    if (!currentState && transition === PluginTransition.REDISCOVER) {
      return true;
    }

    if (!currentState) {
      return false;
    }

    return this.stateTransitions.some(
      (t) =>
        t.from === currentState &&
        t.transition === transition &&
        (!t.condition || t.condition())
    );
  }

  transition(pluginName: string, transition: PluginTransition, context?: any): boolean {
    const currentState = this.pluginStates.get(pluginName);
    
    // Handle initial discovery
    if (!currentState && transition === PluginTransition.REDISCOVER) {
      const newState = PluginState.DISCOVERED;
      this.pluginStates.set(pluginName, newState);
      this.notifyListeners({
        pluginName,
        fromState: undefined,
        toState: newState,
        transition,
        timestamp: new Date(),
        context,
      });
      this.logger.debug(`Plugin ${pluginName}: Initial discovery -> ${newState}`);
      return true;
    }

    if (!this.canTransition(pluginName, transition)) {
      this.logger.warn(
        `Invalid transition for plugin ${pluginName}: ${currentState} -[${transition}]-> ?`
      );
      return false;
    }

    const targetTransition = this.stateTransitions.find(
      (t) =>
        t.from === currentState &&
        t.transition === transition &&
        (!t.condition || t.condition(context))
    );

    if (!targetTransition) {
      this.logger.warn(
        `No valid transition found for plugin ${pluginName}: ${currentState} -[${transition}]-> ?`
      );
      return false;
    }

    const newState = targetTransition.to;
    this.pluginStates.set(pluginName, newState);

    const event: PluginStateChangeEvent = {
      pluginName,
      fromState: currentState,
      toState: newState,
      transition,
      timestamp: new Date(),
      context,
    };

    this.notifyListeners(event);
    this.logger.debug(
      `Plugin ${pluginName}: ${currentState} -[${transition}]-> ${newState}`
    );

    return true;
  }

  getAllStates(): Map<string, PluginState> {
    return new Map(this.pluginStates);
  }

  getValidTransitions(pluginName: string): PluginTransition[] {
    const currentState = this.pluginStates.get(pluginName);
    
    if (!currentState) {
      return [PluginTransition.REDISCOVER];
    }

    return this.stateTransitions
      .filter((t) => t.from === currentState && (!t.condition || t.condition()))
      .map((t) => t.transition);
  }

  reset(pluginName: string): void {
    const currentState = this.pluginStates.get(pluginName);
    if (currentState) {
      this.pluginStates.delete(pluginName);
      this.logger.debug(`Reset state for plugin ${pluginName} (was ${currentState})`);
    }
  }

  resetAll(): void {
    const count = this.pluginStates.size;
    this.pluginStates.clear();
    this.logger.debug(`Reset all plugin states (${count} plugins)`);
  }

  addStateChangeListener(listener: StateChangeListener): void {
    this.listeners.push(listener);
  }

  removeStateChangeListener(listener: StateChangeListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private notifyListeners(event: PluginStateChangeEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        this.logger.error(`Error in state change listener: ${error.message}`, error.stack);
      }
    });
  }

  getStateTransitionMatrix(): Record<PluginState, PluginTransition[]> {
    const matrix: Record<PluginState, PluginTransition[]> = {} as any;
    
    Object.values(PluginState).forEach((state) => {
      matrix[state] = this.stateTransitions
        .filter((t) => t.from === state)
        .map((t) => t.transition);
    });

    return matrix;
  }

  validateStateIntegrity(): boolean {
    const allStates = Object.values(PluginState);
    const allTransitions = Object.values(PluginTransition);
    
    // Check if all states have at least one outgoing transition
    for (const state of allStates) {
      const hasOutgoingTransitions = this.stateTransitions.some(t => t.from === state);
      if (!hasOutgoingTransitions && state !== PluginState.FAILED) {
        this.logger.warn(`State ${state} has no outgoing transitions`);
        return false;
      }
    }

    // Check if all transitions are used
    for (const transition of allTransitions) {
      const isUsed = this.stateTransitions.some(t => t.transition === transition);
      if (!isUsed) {
        this.logger.warn(`Transition ${transition} is not used in any state transition`);
      }
    }

    return true;
  }
}