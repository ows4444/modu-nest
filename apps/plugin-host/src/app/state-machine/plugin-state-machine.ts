import { Injectable, Logger } from '@nestjs/common';
import {
  IPluginStateMachine,
  PluginState,
  PluginTransition,
  StateTransition,
  PluginStateChangeEvent,
  StateChangeListener,
  RecoveryPolicy,
  FailureContext,
} from './plugin-state-machine.interface';

@Injectable()
export class PluginStateMachine implements IPluginStateMachine {
  private readonly logger = new Logger(PluginStateMachine.name);
  private readonly pluginStates = new Map<string, PluginState>();
  private readonly listeners: StateChangeListener[] = [];
  private readonly failureHistory = new Map<string, FailureContext[]>();
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();
  private readonly previousStates = new Map<string, PluginState>();

  private readonly stateTransitions: StateTransition[] = [
    // From DISCOVERED
    {
      from: PluginState.DISCOVERED,
      to: PluginState.LOADING,
      transition: PluginTransition.START_LOADING,
      recoveryPolicy: {
        maxRetries: 3,
        retryDelayMs: 1000,
        exponentialBackoff: true,
        rollbackState: PluginState.DISCOVERED,
      },
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
      recoveryPolicy: {
        maxRetries: 5,
        retryDelayMs: 2000,
        exponentialBackoff: true,
        rollbackState: PluginState.DISCOVERED,
        conditions: {
          canRetry: (context) => {
            const failure = context as FailureContext;
            return failure?.attempt < 3 && !failure?.error.message.includes('CRITICAL');
          },
          canRollback: () => true,
        },
      },
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
      transition: PluginTransition.START_LOADING,
      recoveryPolicy: {
        maxRetries: 2,
        retryDelayMs: 500,
        exponentialBackoff: false,
        rollbackState: PluginState.LOADED,
      },
    },

    // From FAILED - Enhanced recovery options
    {
      from: PluginState.FAILED,
      to: PluginState.LOADING,
      transition: PluginTransition.RETRY,
      recoveryPolicy: {
        maxRetries: 3,
        retryDelayMs: 5000,
        exponentialBackoff: true,
        conditions: {
          canRetry: (context) => {
            const failure = context as FailureContext;
            return failure?.attempt < 5;
          },
        },
      },
    },
    {
      from: PluginState.FAILED,
      to: PluginState.DISCOVERED,
      transition: PluginTransition.ROLLBACK,
    },
    {
      from: PluginState.FAILED,
      to: PluginState.UNLOADED,
      transition: PluginTransition.UNLOAD,
    },
    {
      from: PluginState.FAILED,
      to: PluginState.LOADING,
      transition: PluginTransition.RECOVER,
      recoveryPolicy: {
        maxRetries: 1,
        retryDelayMs: 10000,
        exponentialBackoff: false,
        conditions: {
          canRetry: (context) => {
            const failure = context as FailureContext;
            return !failure?.recoveryAttempted;
          },
        },
      },
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
      transition: PluginTransition.START_LOADING,
      recoveryPolicy: {
        maxRetries: 3,
        retryDelayMs: 1000,
        exponentialBackoff: true,
        rollbackState: PluginState.UNLOADED,
      },
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
      (t) => t.from === currentState && t.transition === transition && (!t.condition || t.condition())
    );
  }

  transition(pluginName: string, transition: PluginTransition, context?: unknown): boolean {
    const currentState = this.pluginStates.get(pluginName);

    // Store previous state for rollback
    if (currentState) {
      this.previousStates.set(pluginName, currentState);
    }

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
      this.logger.warn(`Invalid transition for plugin ${pluginName}: ${currentState} -[${transition}]-> ?`);

      // If this is a failure transition, record it and potentially trigger recovery
      if (transition === PluginTransition.FAIL_LOADING && context) {
        this.recordFailure(pluginName, context as FailureContext);
        this.scheduleAutoRecovery(pluginName);
      }

      return false;
    }

    const targetTransition = this.stateTransitions.find(
      (t) => t.from === currentState && t.transition === transition && (!t.condition || t.condition(context))
    );

    if (!targetTransition) {
      this.logger.warn(`No valid transition found for plugin ${pluginName}: ${currentState} -[${transition}]-> ?`);
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
    this.logger.debug(`Plugin ${pluginName}: ${currentState} -[${transition}]-> ${newState}`);

    // Handle failure transitions and record failure context
    if (newState === PluginState.FAILED && context) {
      this.recordFailure(pluginName, context as FailureContext);

      // Attempt automatic recovery if policy allows
      if (targetTransition.recoveryPolicy) {
        this.scheduleAutoRecovery(pluginName, targetTransition.recoveryPolicy);
      }
    }

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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`Error in state change listener: ${errorMessage}`, errorStack);
      }
    });
  }

  getStateTransitionMatrix(): Record<PluginState, PluginTransition[]> {
    const matrix: Record<PluginState, PluginTransition[]> = {} as any;

    Object.values(PluginState).forEach((state) => {
      matrix[state] = this.stateTransitions.filter((t) => t.from === state).map((t) => t.transition);
    });

    return matrix;
  }

  validateStateIntegrity(): boolean {
    const allStates = Object.values(PluginState);
    const allTransitions = Object.values(PluginTransition);

    // Check if all states have at least one outgoing transition
    for (const state of allStates) {
      const hasOutgoingTransitions = this.stateTransitions.some((t) => t.from === state);
      if (!hasOutgoingTransitions && state !== PluginState.FAILED) {
        this.logger.warn(`State ${state} has no outgoing transitions`);
        return false;
      }
    }

    // Check if all transitions are used
    for (const transition of allTransitions) {
      const isUsed = this.stateTransitions.some((t) => t.transition === transition);
      if (!isUsed) {
        this.logger.warn(`Transition ${transition} is not used in any state transition`);
      }
    }

    return true;
  }

  async retryTransition(pluginName: string, context?: FailureContext): Promise<boolean> {
    const currentState = this.getCurrentState(pluginName);

    if (currentState !== PluginState.FAILED) {
      this.logger.warn(`Cannot retry transition for plugin ${pluginName}: not in FAILED state`);
      return false;
    }

    const history = this.failureHistory.get(pluginName) || [];
    const latestFailure = history[history.length - 1];

    if (!latestFailure && !context) {
      this.logger.warn(`No failure context available for retry of plugin ${pluginName}`);
      return false;
    }

    const failureContext = context || latestFailure;
    const retryTransition = this.stateTransitions.find(
      (t) => t.from === PluginState.FAILED && t.transition === PluginTransition.RETRY
    );

    if (!retryTransition?.recoveryPolicy) {
      this.logger.warn(`No recovery policy found for retry of plugin ${pluginName}`);
      return false;
    }

    const policy = retryTransition.recoveryPolicy;

    // Check if retry is allowed
    if (policy.conditions?.canRetry && !policy.conditions.canRetry(failureContext)) {
      this.logger.warn(`Retry conditions not met for plugin ${pluginName}`);
      return false;
    }

    if (failureContext.attempt >= policy.maxRetries) {
      this.logger.warn(`Maximum retries exceeded for plugin ${pluginName}`);
      return false;
    }

    // Calculate delay with exponential backoff
    let delay = policy.retryDelayMs;
    if (policy.exponentialBackoff) {
      delay *= Math.pow(2, failureContext.attempt - 1);
    }

    this.logger.log(`Retrying plugin ${pluginName} after ${delay}ms (attempt ${failureContext.attempt + 1})`);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const success = this.transition(pluginName, PluginTransition.RETRY, {
          ...failureContext,
          attempt: failureContext.attempt + 1,
          timestamp: new Date(),
        });

        this.retryTimers.delete(pluginName);
        resolve(success);
      }, delay);

      this.retryTimers.set(pluginName, timer);
    });
  }

  rollbackToState(pluginName: string, targetState: PluginState, context?: unknown): boolean {
    const currentState = this.getCurrentState(pluginName);

    if (!currentState) {
      this.logger.warn(`Cannot rollback plugin ${pluginName}: no current state`);
      return false;
    }

    // Find rollback transition
    const rollbackTransition = this.stateTransitions.find(
      (t) => t.from === currentState && t.to === targetState && t.transition === PluginTransition.ROLLBACK
    );

    if (!rollbackTransition) {
      // Try to rollback using previous state
      const previousState = this.previousStates.get(pluginName);
      if (previousState && previousState === targetState) {
        this.pluginStates.set(pluginName, targetState);
        this.notifyListeners({
          pluginName,
          fromState: currentState,
          toState: targetState,
          transition: PluginTransition.ROLLBACK,
          timestamp: new Date(),
          context,
        });

        this.logger.log(`Plugin ${pluginName}: Rolled back from ${currentState} to ${targetState}`);
        return true;
      }

      this.logger.warn(`No valid rollback path for plugin ${pluginName} from ${currentState} to ${targetState}`);
      return false;
    }

    return this.transition(pluginName, PluginTransition.ROLLBACK, context);
  }

  getFailureHistory(pluginName: string): FailureContext[] {
    return this.failureHistory.get(pluginName) || [];
  }

  clearFailureHistory(pluginName: string): void {
    this.failureHistory.delete(pluginName);

    // Clear any pending retry timer
    const timer = this.retryTimers.get(pluginName);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(pluginName);
    }

    this.logger.debug(`Cleared failure history for plugin ${pluginName}`);
  }

  private recordFailure(pluginName: string, failureContext: FailureContext): void {
    const history = this.failureHistory.get(pluginName) || [];

    // Limit history size to prevent memory leaks
    const maxHistorySize = 10;
    if (history.length >= maxHistorySize) {
      history.shift();
    }

    history.push({
      ...failureContext,
      timestamp: new Date(),
    });

    this.failureHistory.set(pluginName, history);

    this.logger.error(
      `Plugin ${pluginName} failure recorded (attempt ${failureContext.attempt}): ${failureContext.error.message}`
    );
  }

  private scheduleAutoRecovery(pluginName: string, policy?: RecoveryPolicy): void {
    if (!policy) {
      const retryTransition = this.stateTransitions.find(
        (t) => t.from === PluginState.FAILED && t.transition === PluginTransition.RETRY
      );
      policy = retryTransition?.recoveryPolicy;
    }

    if (!policy) {
      this.logger.debug(`No recovery policy available for plugin ${pluginName}`);
      return;
    }

    const history = this.failureHistory.get(pluginName) || [];
    const latestFailure = history[history.length - 1];

    if (!latestFailure) {
      this.logger.warn(`No failure context available for auto-recovery of plugin ${pluginName}`);
      return;
    }

    // Check if we can retry
    if (policy.conditions?.canRetry && !policy.conditions.canRetry(latestFailure)) {
      this.logger.debug(`Auto-recovery conditions not met for plugin ${pluginName}`);
      return;
    }

    if (latestFailure.attempt >= policy.maxRetries) {
      this.logger.warn(`Auto-recovery: Maximum retries exceeded for plugin ${pluginName}, attempting rollback`);

      if (policy.rollbackState) {
        this.rollbackToState(pluginName, policy.rollbackState, {
          reason: 'auto-recovery-rollback',
          originalFailure: latestFailure,
        });
      }
      return;
    }

    // Schedule retry
    let delay = policy.retryDelayMs;
    if (policy.exponentialBackoff) {
      delay *= Math.pow(2, latestFailure.attempt);
    }

    this.logger.log(`Scheduling auto-recovery for plugin ${pluginName} in ${delay}ms`);

    const timer = setTimeout(() => {
      this.retryTransition(pluginName, latestFailure).catch((error) => {
        this.logger.error(`Auto-recovery failed for plugin ${pluginName}: ${error.message}`);
      });
    }, delay);

    this.retryTimers.set(pluginName, timer);
  }
}
