import { Injectable, Logger } from '@nestjs/common';
import { LoadedPlugin, PluginManifest } from '@plugin/core';
import { PluginStateMachine } from './state-machine';
import { IPluginEventSubscriber, PluginState, PluginTransition } from '@plugin/core';
import { PluginEventEmitter } from '@plugin/services';

// Rollback-specific interfaces
export interface PluginSnapshot {
  pluginName: string;
  version: string;
  timestamp: Date;
  state: PluginState;
  manifest: PluginManifest;
  loadedPlugin?: LoadedPlugin;
  dependencies: string[];
  dependents: string[];
  systemState: {
    loadedPlugins: string[];
    crossPluginServices: string[];
    guards: string[];
    contexts: string[];
  };
  performanceMetrics?: {
    loadTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface RollbackOptions {
  reason: string;
  targetVersion?: string;
  targetSnapshot?: string;
  cascadeRollback: boolean;
  maxRollbackDepth: number;
  rollbackTimeout: number;
  preserveUserData: boolean;
  rollbackStrategy: 'version' | 'snapshot' | 'dependency-graph';
  dryRun?: boolean;
}

export interface RollbackResult {
  success: boolean;
  pluginName: string;
  fromVersion: string;
  toVersion?: string;
  fromSnapshot?: string;
  toSnapshot?: string;
  rollbackType: 'version' | 'snapshot' | 'dependency-graph' | 'failed-state';
  duration: number;
  rollbackedPlugins: string[];
  affectedDependencies: string[];
  warnings: string[];
  errors: string[];
  systemStateRestored: {
    plugins: number;
    services: number;
    guards: number;
    contexts: number;
  };
}

export interface RollbackPlan {
  pluginName: string;
  steps: RollbackStep[];
  estimatedDuration: number;
  risksAndWarnings: string[];
  dependencyImpact: {
    affectedPlugins: string[];
    brokenDependencies: string[];
    requiredRollbacks: string[];
  };
}

export interface RollbackStep {
  stepNumber: number;
  action: 'unload' | 'restore-snapshot' | 'reload' | 'dependency-check' | 'system-restore';
  target: string;
  description: string;
  estimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high';
  prereqs: string[];
}

export interface RollbackHistory {
  id: string;
  pluginName: string;
  rollbackType: string;
  fromVersion: string;
  toVersion?: string;
  success: boolean;
  duration: number;
  timestamp: Date;
  reason: string;
  rollbackedWith: string[];
  errors: string[];
}

/**
 * Comprehensive Plugin Rollback Service
 * Handles version rollbacks, state snapshots, and dependency cascade rollbacks
 */
@Injectable()
export class PluginRollbackService implements IPluginEventSubscriber {
  private readonly logger = new Logger(PluginRollbackService.name);

  // Snapshot storage and management
  private snapshots = new Map<string, Map<string, PluginSnapshot>>(); // pluginName -> snapshotId -> snapshot
  private rollbackHistory: RollbackHistory[] = [];
  private activeRollbacks = new Map<string, Promise<RollbackResult>>();

  // Configuration
  private readonly maxSnapshotsPerPlugin = 10;
  private readonly maxRollbackHistorySize = 100;
  private readonly snapshotRetentionDays = 30;

  // Dependencies
  private eventEmitter?: PluginEventEmitter;
  private stateMachine?: PluginStateMachine;

  // State tracking for rollbacks
  private loadedPluginsRef?: Map<string, LoadedPlugin>;
  private pluginDependencies = new Map<string, Set<string>>();
  private pluginDependents = new Map<string, Set<string>>();

  constructor() {
    this.startPeriodicCleanup();
    this.logger.log('Plugin Rollback Service initialized');
  }

  /**
   * Initialize with required dependencies
   */
  initialize(
    eventEmitter: PluginEventEmitter,
    stateMachine: PluginStateMachine,
    loadedPlugins: Map<string, LoadedPlugin>
  ): void {
    this.eventEmitter = eventEmitter;
    this.stateMachine = stateMachine;
    this.loadedPluginsRef = loadedPlugins;

    // Subscribe to plugin events for automatic snapshot creation
    this.subscribeToEvents(eventEmitter);

    this.logger.log('Plugin Rollback Service initialized with dependencies');
  }

  // ====================
  // Snapshot Management
  // ====================

  /**
   * Create a snapshot of the current plugin state
   */
  async createSnapshot(pluginName: string, description?: string): Promise<string> {
    const loadedPlugin = this.loadedPluginsRef?.get(pluginName);
    if (!loadedPlugin) {
      throw new Error(`Plugin ${pluginName} is not loaded, cannot create snapshot`);
    }

    const currentState = this.stateMachine?.getCurrentState(pluginName);
    if (!currentState) {
      throw new Error(`Plugin ${pluginName} has no state information`);
    }

    const snapshotId = `${pluginName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();

    // Gather system state information
    const systemState = this.captureSystemState(pluginName);

    // Create snapshot
    const snapshot: PluginSnapshot = {
      pluginName,
      version: loadedPlugin.manifest.version,
      timestamp,
      state: currentState,
      manifest: JSON.parse(JSON.stringify(loadedPlugin.manifest)), // Deep copy
      loadedPlugin: this.createLoadedPluginSnapshot(loadedPlugin),
      dependencies: this.getDependencies(pluginName),
      dependents: this.getDependents(pluginName),
      systemState,
      performanceMetrics: await this.capturePerformanceMetrics(pluginName),
    };

    // Store snapshot
    if (!this.snapshots.has(pluginName)) {
      this.snapshots.set(pluginName, new Map());
    }

    const pluginSnapshots = this.snapshots.get(pluginName)!;
    pluginSnapshots.set(snapshotId, snapshot);

    // Maintain snapshot limit
    this.maintainSnapshotLimit(pluginName);

    // Emit snapshot created event
    this.eventEmitter?.emit('plugin-snapshot-created', {
      pluginName,
      snapshotId,
      version: snapshot.version,
      description,
      timestamp,
    });

    this.logger.log(`Created snapshot ${snapshotId} for plugin ${pluginName} v${snapshot.version}`);
    return snapshotId;
  }

  /**
   * List all snapshots for a plugin
   */
  getSnapshots(pluginName: string): PluginSnapshot[] {
    const pluginSnapshots = this.snapshots.get(pluginName);
    if (!pluginSnapshots) return [];

    return Array.from(pluginSnapshots.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get a specific snapshot
   */
  getSnapshot(pluginName: string, snapshotId: string): PluginSnapshot | null {
    return this.snapshots.get(pluginName)?.get(snapshotId) || null;
  }

  /**
   * Delete a snapshot
   */
  deleteSnapshot(pluginName: string, snapshotId: string): boolean {
    const pluginSnapshots = this.snapshots.get(pluginName);
    if (!pluginSnapshots) return false;

    const deleted = pluginSnapshots.delete(snapshotId);
    if (deleted) {
      this.eventEmitter?.emit('plugin-snapshot-deleted', {
        pluginName,
        snapshotId,
        timestamp: new Date(),
      });
      this.logger.debug(`Deleted snapshot ${snapshotId} for plugin ${pluginName}`);
    }

    return deleted;
  }

  // ====================
  // Rollback Operations
  // ====================

  /**
   * Rollback plugin to a previous version or snapshot
   */
  async rollbackPlugin(pluginName: string, options: RollbackOptions): Promise<RollbackResult> {
    const startTime = Date.now();

    // Check if rollback is already in progress
    if (this.activeRollbacks.has(pluginName)) {
      throw new Error(`Rollback already in progress for plugin ${pluginName}`);
    }

    // Create rollback promise
    const rollbackPromise = this.performRollback(pluginName, options, startTime);
    this.activeRollbacks.set(pluginName, rollbackPromise);

    try {
      const result = await rollbackPromise;

      // Record rollback in history
      this.recordRollback(result);

      return result;
    } finally {
      this.activeRollbacks.delete(pluginName);
    }
  }

  /**
   * Generate a rollback plan without executing
   */
  async generateRollbackPlan(pluginName: string, options: RollbackOptions): Promise<RollbackPlan> {
    const currentState = this.stateMachine?.getCurrentState(pluginName);
    if (!currentState) {
      throw new Error(`Plugin ${pluginName} has no state information`);
    }

    const steps: RollbackStep[] = [];
    const risks: string[] = [];
    let estimatedDuration = 0;

    // Analyze dependency impact
    const dependencyImpact = this.analyzeDependencyImpact(pluginName, options);

    // Generate rollback steps based on strategy
    if (options.rollbackStrategy === 'version') {
      steps.push(...this.generateVersionRollbackSteps(pluginName, options));
    } else if (options.rollbackStrategy === 'snapshot') {
      steps.push(...this.generateSnapshotRollbackSteps(pluginName, options));
    } else if (options.rollbackStrategy === 'dependency-graph') {
      steps.push(...this.generateDependencyGraphRollbackSteps(pluginName, options));
    }

    // Add cascade rollback steps if needed
    if (options.cascadeRollback && dependencyImpact.requiredRollbacks.length > 0) {
      steps.push(...this.generateCascadeRollbackSteps(dependencyImpact.requiredRollbacks, options));
    }

    // Calculate estimated duration
    estimatedDuration = steps.reduce((total, step) => total + step.estimatedTime, 0);

    // Assess risks
    if (dependencyImpact.brokenDependencies.length > 0) {
      risks.push(`Breaking dependencies: ${dependencyImpact.brokenDependencies.join(', ')}`);
    }
    if (currentState === PluginState.LOADED && !options.cascadeRollback) {
      risks.push('Rolling back loaded plugin without cascade may break dependent plugins');
    }

    return {
      pluginName,
      steps,
      estimatedDuration,
      risksAndWarnings: risks,
      dependencyImpact,
    };
  }

  /**
   * Get active rollback operations
   */
  getActiveRollbacks(): string[] {
    return Array.from(this.activeRollbacks.keys());
  }

  /**
   * Cancel a rollback operation (if possible)
   */
  async cancelRollback(pluginName: string): Promise<boolean> {
    // Note: This is a simplified implementation
    // In a real system, you'd need more sophisticated cancellation logic
    if (this.activeRollbacks.has(pluginName)) {
      this.activeRollbacks.delete(pluginName);
      this.logger.warn(`Rollback cancelled for plugin ${pluginName} (operation may still be running)`);
      return true;
    }
    return false;
  }

  // ====================
  // Rollback History
  // ====================

  /**
   * Get rollback history for a plugin or all plugins
   */
  getRollbackHistory(pluginName?: string, limit = 20): RollbackHistory[] {
    let history = this.rollbackHistory;

    if (pluginName) {
      history = history.filter((entry) => entry.pluginName === pluginName);
    }

    return history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
  }

  /**
   * Clear rollback history
   */
  clearRollbackHistory(pluginName?: string): void {
    if (pluginName) {
      this.rollbackHistory = this.rollbackHistory.filter((entry) => entry.pluginName !== pluginName);
    } else {
      this.rollbackHistory = [];
    }

    this.logger.debug(`Cleared rollback history ${pluginName ? `for ${pluginName}` : 'for all plugins'}`);
  }

  // ====================
  // Private Implementation
  // ====================

  private async performRollback(
    pluginName: string,
    options: RollbackOptions,
    startTime: number
  ): Promise<RollbackResult> {
    const result: RollbackResult = {
      success: false,
      pluginName,
      fromVersion: '',
      rollbackType: options.rollbackStrategy,
      duration: 0,
      rollbackedPlugins: [],
      affectedDependencies: [],
      warnings: [],
      errors: [],
      systemStateRestored: {
        plugins: 0,
        services: 0,
        guards: 0,
        contexts: 0,
      },
    };

    try {
      // Get current version
      const currentPlugin = this.loadedPluginsRef?.get(pluginName);
      if (currentPlugin) {
        result.fromVersion = currentPlugin.manifest.version;
      }

      // Emit rollback started event
      this.eventEmitter?.emit('plugin-rollback-started', {
        pluginName,
        options,
        timestamp: new Date(),
      });

      // Execute rollback based on strategy
      if (options.rollbackStrategy === 'snapshot') {
        await this.executeSnapshotRollback(pluginName, options, result);
      } else if (options.rollbackStrategy === 'version') {
        await this.executeVersionRollback(pluginName, options, result);
      } else if (options.rollbackStrategy === 'dependency-graph') {
        await this.executeDependencyGraphRollback(pluginName, options, result);
      }

      result.success = true;
      result.duration = Date.now() - startTime;

      // Emit rollback completed event
      this.eventEmitter?.emit('plugin-rollback-completed', {
        ...result,
        timestamp: new Date(),
      });

      this.logger.log(
        `Successfully rolled back ${pluginName} using ${options.rollbackStrategy} strategy in ${result.duration}ms`
      );
    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.errors.push(error instanceof Error ? error.message : String(error));

      // Emit rollback failed event
      this.eventEmitter?.emit('plugin-rollback-failed', {
        ...result,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: new Date(),
      });

      this.logger.error(`Failed to rollback ${pluginName}:`, error);
    }

    return result;
  }

  private async executeSnapshotRollback(
    pluginName: string,
    options: RollbackOptions,
    result: RollbackResult
  ): Promise<void> {
    if (!options.targetSnapshot) {
      throw new Error('Target snapshot ID required for snapshot rollback');
    }

    const snapshot = this.getSnapshot(pluginName, options.targetSnapshot);
    if (!snapshot) {
      throw new Error(`Snapshot ${options.targetSnapshot} not found for plugin ${pluginName}`);
    }

    // Validate snapshot compatibility
    this.validateSnapshotCompatibility(snapshot);

    // Unload current plugin
    await this.unloadPluginForRollback(pluginName);

    // Restore from snapshot
    await this.restoreFromSnapshot(snapshot, result);

    result.toSnapshot = options.targetSnapshot;
    result.toVersion = snapshot.version;
  }

  private async executeVersionRollback(
    pluginName: string,
    options: RollbackOptions,
    result: RollbackResult
  ): Promise<void> {
    if (!options.targetVersion) {
      throw new Error('Target version required for version rollback');
    }

    // Find snapshot with target version
    const snapshots = this.getSnapshots(pluginName);
    const targetSnapshot = snapshots.find((s) => s.version === options.targetVersion);

    if (!targetSnapshot) {
      throw new Error(`No snapshot found for version ${options.targetVersion} of plugin ${pluginName}`);
    }

    // Use snapshot rollback internally
    await this.executeSnapshotRollback(
      pluginName,
      {
        ...options,
        targetSnapshot: `${pluginName}-${targetSnapshot.timestamp.getTime()}`,
      },
      result
    );
    result.rollbackType = 'version';
    result.toVersion = options.targetVersion;
  }

  private async executeDependencyGraphRollback(
    pluginName: string,
    options: RollbackOptions,
    result: RollbackResult
  ): Promise<void> {
    // This would implement complex dependency graph analysis and rollback
    // For now, it's a placeholder that falls back to version rollback
    result.warnings.push('Dependency graph rollback not fully implemented, falling back to version rollback');

    if (options.targetVersion) {
      await this.executeVersionRollback(pluginName, options, result);
    } else {
      throw new Error('Dependency graph rollback requires target version or more sophisticated implementation');
    }
  }

  private async unloadPluginForRollback(pluginName: string): Promise<void> {
    if (this.stateMachine) {
      const canUnload = this.stateMachine.canTransition(pluginName, PluginTransition.UNLOAD);
      if (canUnload) {
        this.stateMachine.transition(pluginName, PluginTransition.UNLOAD, {
          reason: 'rollback',
        });
      }
    }
  }

  private async restoreFromSnapshot(snapshot: PluginSnapshot, result: RollbackResult): Promise<void> {
    // This would implement the complex snapshot restoration logic
    // For now, it's a simplified implementation
    result.rollbackedPlugins.push(snapshot.pluginName);
    result.systemStateRestored.plugins = 1;

    // In a real implementation, this would:
    // 1. Restore the plugin module and manifest
    // 2. Restore cross-plugin services
    // 3. Restore guards and contexts
    // 4. Restore dependencies
    // 5. Update state machine

    result.warnings.push('Snapshot restoration is simplified in current implementation');
  }

  private validateSnapshotCompatibility(snapshot: PluginSnapshot): void {
    // Validate that the snapshot is compatible with current system state
    const now = new Date();
    const snapshotAge = now.getTime() - snapshot.timestamp.getTime();
    const maxAge = this.snapshotRetentionDays * 24 * 60 * 60 * 1000;

    if (snapshotAge > maxAge) {
      throw new Error(`Snapshot is too old (${Math.floor(snapshotAge / (24 * 60 * 60 * 1000))} days)`);
    }

    // Additional compatibility checks would go here
  }

  private captureSystemState(pluginName: string): PluginSnapshot['systemState'] {
    return {
      loadedPlugins: this.loadedPluginsRef ? Array.from(this.loadedPluginsRef.keys()) : [],
      crossPluginServices: [], // Would be populated from CrossPluginServiceManager
      guards: [], // Would be populated from GuardManager
      contexts: [], // Would be populated from PluginContextService
    };
  }

  private createLoadedPluginSnapshot(loadedPlugin: LoadedPlugin): LoadedPlugin {
    // Create a deep copy of the loaded plugin (simplified)
    return JSON.parse(JSON.stringify(loadedPlugin));
  }

  private async capturePerformanceMetrics(pluginName: string): Promise<PluginSnapshot['performanceMetrics']> {
    // This would capture actual performance metrics
    return {
      loadTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
    };
  }

  private getDependencies(pluginName: string): string[] {
    return Array.from(this.pluginDependencies.get(pluginName) || []);
  }

  private getDependents(pluginName: string): string[] {
    return Array.from(this.pluginDependents.get(pluginName) || []);
  }

  private maintainSnapshotLimit(pluginName: string): void {
    const pluginSnapshots = this.snapshots.get(pluginName);
    if (!pluginSnapshots) return;

    if (pluginSnapshots.size > this.maxSnapshotsPerPlugin) {
      const sortedSnapshots = Array.from(pluginSnapshots.entries()).sort(
        (a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime()
      );

      // Remove oldest snapshots
      const toRemove = sortedSnapshots.slice(0, pluginSnapshots.size - this.maxSnapshotsPerPlugin);
      toRemove.forEach(([snapshotId]) => {
        pluginSnapshots.delete(snapshotId);
        this.logger.debug(`Removed old snapshot ${snapshotId} for plugin ${pluginName}`);
      });
    }
  }

  private analyzeDependencyImpact(pluginName: string, options: RollbackOptions): RollbackPlan['dependencyImpact'] {
    const affectedPlugins = this.getDependents(pluginName);
    const brokenDependencies: string[] = [];
    const requiredRollbacks: string[] = [];

    // Analyze which dependencies would be broken
    affectedPlugins.forEach((dependent) => {
      // In a real implementation, this would check version compatibility
      brokenDependencies.push(dependent);
      if (options.cascadeRollback) {
        requiredRollbacks.push(dependent);
      }
    });

    return {
      affectedPlugins,
      brokenDependencies,
      requiredRollbacks,
    };
  }

  private generateVersionRollbackSteps(pluginName: string, options: RollbackOptions): RollbackStep[] {
    return [
      {
        stepNumber: 1,
        action: 'unload',
        target: pluginName,
        description: `Unload current version of ${pluginName}`,
        estimatedTime: 2000,
        riskLevel: 'medium',
        prereqs: [],
      },
      {
        stepNumber: 2,
        action: 'restore-snapshot',
        target: pluginName,
        description: `Restore ${pluginName} to version ${options.targetVersion}`,
        estimatedTime: 5000,
        riskLevel: 'medium',
        prereqs: ['unload'],
      },
      {
        stepNumber: 3,
        action: 'reload',
        target: pluginName,
        description: `Reload ${pluginName} with restored version`,
        estimatedTime: 3000,
        riskLevel: 'low',
        prereqs: ['restore-snapshot'],
      },
    ];
  }

  private generateSnapshotRollbackSteps(pluginName: string, options: RollbackOptions): RollbackStep[] {
    return [
      {
        stepNumber: 1,
        action: 'unload',
        target: pluginName,
        description: `Unload current state of ${pluginName}`,
        estimatedTime: 2000,
        riskLevel: 'medium',
        prereqs: [],
      },
      {
        stepNumber: 2,
        action: 'restore-snapshot',
        target: pluginName,
        description: `Restore ${pluginName} from snapshot ${options.targetSnapshot}`,
        estimatedTime: 4000,
        riskLevel: 'high',
        prereqs: ['unload'],
      },
      {
        stepNumber: 3,
        action: 'system-restore',
        target: pluginName,
        description: `Restore system state for ${pluginName}`,
        estimatedTime: 3000,
        riskLevel: 'high',
        prereqs: ['restore-snapshot'],
      },
    ];
  }

  private generateDependencyGraphRollbackSteps(pluginName: string, options: RollbackOptions): RollbackStep[] {
    // Simplified implementation
    return this.generateVersionRollbackSteps(pluginName, options);
  }

  private generateCascadeRollbackSteps(requiredRollbacks: string[], options: RollbackOptions): RollbackStep[] {
    const steps: RollbackStep[] = [];
    let stepNumber = 100; // Start at 100 to avoid conflicts

    requiredRollbacks.forEach((pluginName) => {
      steps.push({
        stepNumber: stepNumber++,
        action: 'unload',
        target: pluginName,
        description: `Cascade unload ${pluginName}`,
        estimatedTime: 2000,
        riskLevel: 'high',
        prereqs: [],
      });
    });

    return steps;
  }

  private recordRollback(result: RollbackResult): void {
    const historyEntry: RollbackHistory = {
      id: `rollback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pluginName: result.pluginName,
      rollbackType: result.rollbackType,
      fromVersion: result.fromVersion,
      toVersion: result.toVersion,
      success: result.success,
      duration: result.duration,
      timestamp: new Date(),
      reason: 'Manual rollback', // This should come from options
      rollbackedWith: result.rollbackedPlugins,
      errors: result.errors,
    };

    this.rollbackHistory.push(historyEntry);

    // Maintain history size
    if (this.rollbackHistory.length > this.maxRollbackHistorySize) {
      this.rollbackHistory.shift();
    }
  }

  private startPeriodicCleanup(): void {
    // Clean up old snapshots and history every hour
    setInterval(() => {
      this.cleanupOldSnapshots();
      this.cleanupOldHistory();
    }, 60 * 60 * 1000);
  }

  private cleanupOldSnapshots(): void {
    const cutoffTime = Date.now() - this.snapshotRetentionDays * 24 * 60 * 60 * 1000;
    let cleanedCount = 0;

    for (const [_pluginName, pluginSnapshots] of this.snapshots) {
      for (const [snapshotId, snapshot] of pluginSnapshots) {
        if (snapshot.timestamp.getTime() < cutoffTime) {
          pluginSnapshots.delete(snapshotId);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} old snapshots`);
    }
  }

  private cleanupOldHistory(): void {
    if (this.rollbackHistory.length > this.maxRollbackHistorySize) {
      const removed = this.rollbackHistory.length - this.maxRollbackHistorySize;
      this.rollbackHistory = this.rollbackHistory
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, this.maxRollbackHistorySize);

      this.logger.debug(`Cleaned up ${removed} old rollback history entries`);
    }
  }

  // ====================
  // Event Subscription
  // ====================

  subscribeToEvents(eventEmitter: PluginEventEmitter): void {
    // Auto-create snapshots on successful plugin loads
    eventEmitter.on('plugin.loaded', (event) => {
      const loadedEvent = event as any;
      this.createSnapshot(loadedEvent.pluginName, 'Auto-created on plugin load').catch((error) => {
        this.logger.warn(`Failed to auto-create snapshot for ${loadedEvent.pluginName}:`, error);
      });
    });

    // Clean up snapshots when plugins are permanently removed
    eventEmitter.on('plugin.unloaded', (event) => {
      const unloadedEvent = event as any;
      if (unloadedEvent.reason === 'shutdown' || unloadedEvent.reason === 'removed') {
        // Don't clean up snapshots for temporary unloads
        return;
      }
    });
  }

  unsubscribeFromEvents(eventEmitter: PluginEventEmitter): void {
    eventEmitter.removeAllListeners('plugin.loaded');
    eventEmitter.removeAllListeners('plugin.unloaded');
  }
}
