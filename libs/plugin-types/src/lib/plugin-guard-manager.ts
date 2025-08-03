import { Injectable, Logger } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { GuardEntry, LocalGuardEntry } from './plugin-interfaces';

export interface LoadedGuard {
  entry: GuardEntry;
  pluginName: string;
  guardClass?: any;
  instance?: any;
  storedAt?: Date;
}

export interface GuardResolutionResult {
  guards: LoadedGuard[];
  missingDependencies: string[];
  circularDependencies: string[];
}

@Injectable()
export class PluginGuardManager {
  private readonly logger = new Logger(PluginGuardManager.name);

  // Centralized storage without global registration
  private readonly guardsMap = new Map<string, LoadedGuard>();
  private readonly pluginGuardsMap = new Map<string, Set<string>>();

  // Thread-safe operation locks
  private readonly resolutionMutex = new Mutex();
  private readonly storageMutex = new Mutex();

  /**
   * Store guards from a plugin with thread-safe operations
   * Guards are stored in a centralized map but not globally available
   */
  async storePluginGuards(
    pluginName: string,
    guardEntries: GuardEntry[],
    pluginModule: Record<string, unknown>
  ): Promise<void> {
    await this.storageMutex.runExclusive(async () => {
      this.logger.debug(`Storing guards for plugin: ${pluginName}`);

      if (!this.pluginGuardsMap.has(pluginName)) {
        this.pluginGuardsMap.set(pluginName, new Set());
      }

      const pluginGuardNames = this.pluginGuardsMap.get(pluginName)!;

      for (const entry of guardEntries) {
        const guardKey = this.createGuardKey(pluginName, entry.name);

        if (entry.scope === 'local') {
          const localEntry = entry as LocalGuardEntry;
          const guardClass = pluginModule[localEntry.class];

          if (!guardClass || typeof guardClass !== 'function') {
            throw new Error(`Guard class '${localEntry.class}' not found in plugin '${pluginName}' exports`);
          }

          this.guardsMap.set(guardKey, {
            entry,
            pluginName,
            guardClass,
            storedAt: new Date(),
          });

          pluginGuardNames.add(entry.name);
          this.logger.debug(`Stored local guard '${entry.name}' from plugin '${pluginName}'`);
        } else if (entry.scope === 'external') {
          // External guards are just references - store metadata only
          this.guardsMap.set(guardKey, {
            entry,
            pluginName,
            storedAt: new Date(),
          });

          pluginGuardNames.add(entry.name);
          this.logger.debug(`Stored external guard reference '${entry.name}' from plugin '${pluginName}'`);
        }
      }
    });
  }

  /**
   * Resolve guards specified in a plugin manifest with thread-safe operations
   * Ensures dependencies are met and no circular dependencies exist.
   */
  async resolveGuardsForPlugin(pluginName: string, requestedGuards: string[]): Promise<GuardResolutionResult> {
    return await this.resolutionMutex.runExclusive(async () => {
      this.logger.debug(`Resolving guards for plugin '${pluginName}': [${requestedGuards.join(', ')}]`);

      const resolvedGuards: LoadedGuard[] = [];
      const missingDependencies: string[] = [];
      const circularDependencies: string[] = [];
      const resolutionContext = new GuardResolutionContext();

      for (const guardName of requestedGuards) {
        const result = await this.resolveGuardWithDependencies(pluginName, guardName, resolutionContext);

        if (result.guard) {
          resolvedGuards.push(result.guard);
        }

        missingDependencies.push(...result.missingDependencies);
        circularDependencies.push(...result.circularDependencies);
      }

      // Remove duplicates
      const uniqueGuards = this.deduplicateGuards(resolvedGuards);

      this.logger.debug(
        `Resolved ${uniqueGuards.length} guards for plugin '${pluginName}' ` +
          `(${missingDependencies.length} missing, ${circularDependencies.length} circular)`
      );

      return {
        guards: uniqueGuards,
        missingDependencies: [...new Set(missingDependencies)],
        circularDependencies: [...new Set(circularDependencies)],
      };
    });
  }

  /**
   * Recursively resolve a guard and its dependencies with enhanced context tracking
   */
  private async resolveGuardWithDependencies(
    requestingPlugin: string,
    guardName: string,
    context: GuardResolutionContext
  ): Promise<{
    guard?: LoadedGuard;
    missingDependencies: string[];
    circularDependencies: string[];
  }> {
    // Check for circular dependency
    if (context.isInResolutionStack(guardName)) {
      return {
        missingDependencies: [],
        circularDependencies: [guardName],
      };
    }

    // Check if already resolved
    if (context.isResolved(guardName)) {
      const guard = this.findAvailableGuard(requestingPlugin, guardName);
      return {
        guard,
        missingDependencies: [],
        circularDependencies: [],
      };
    }

    context.pushToStack(guardName);
    context.markAsVisited(guardName);

    // Find the guard
    const guard = this.findAvailableGuard(requestingPlugin, guardName);
    if (!guard) {
      context.popFromStack(guardName);
      return {
        missingDependencies: [guardName],
        circularDependencies: [],
      };
    }

    // Resolve dependencies recursively
    const missingDependencies: string[] = [];
    const circularDependencies: string[] = [];

    if (guard.entry.scope === 'local') {
      const localEntry = guard.entry as LocalGuardEntry;
      if (localEntry.dependencies) {
        for (const depName of localEntry.dependencies) {
          const depResult = await this.resolveGuardWithDependencies(requestingPlugin, depName, context);

          missingDependencies.push(...depResult.missingDependencies);
          circularDependencies.push(...depResult.circularDependencies);
        }
      }
    }

    context.popFromStack(guardName);

    return {
      guard,
      missingDependencies,
      circularDependencies,
    };
  }

  /**
   * Find an available guard for a requesting plugin
   * Checks local guards first, then exported guards from other plugins
   */
  private findAvailableGuard(requestingPlugin: string, guardName: string): LoadedGuard | undefined {
    // First check if the requesting plugin has this guard locally
    const localKey = this.createGuardKey(requestingPlugin, guardName);
    if (this.guardsMap.has(localKey)) {
      return this.guardsMap.get(localKey);
    }

    // Then check for exported guards from other plugins
    for (const guard of this.guardsMap.values()) {
      if (guard.entry.name === guardName && guard.pluginName !== requestingPlugin) {
        // For external guards, always allow access
        if (guard.entry.scope === 'external') {
          return guard;
        }

        // For local guards, only allow if explicitly exported
        if (guard.entry.scope === 'local') {
          const localEntry = guard.entry as LocalGuardEntry;
          if (localEntry.exported === true) {
            return guard;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Remove duplicate guards while preserving order
   */
  private deduplicateGuards(guards: LoadedGuard[]): LoadedGuard[] {
    const seen = new Set<string>();
    return guards.filter((guard) => {
      const key = `${guard.pluginName}:${guard.entry.name}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Clean up guards for a specific plugin with thread-safe operations
   */
  async removePluginGuards(pluginName: string): Promise<void> {
    await this.storageMutex.runExclusive(async () => {
      this.logger.debug(`Removing guards for plugin: ${pluginName}`);

      const pluginGuardNames = this.pluginGuardsMap.get(pluginName);
      if (!pluginGuardNames) {
        return;
      }

      for (const guardName of pluginGuardNames) {
        const guardKey = this.createGuardKey(pluginName, guardName);
        this.guardsMap.delete(guardKey);
      }

      this.pluginGuardsMap.delete(pluginName);
      this.logger.debug(`Removed ${pluginGuardNames.size} guards for plugin '${pluginName}'`);
    });
  }

  /**
   * Get all guards for a specific plugin (for debugging/inspection)
   */
  getPluginGuards(pluginName: string): LoadedGuard[] {
    const guardNames = this.pluginGuardsMap.get(pluginName);
    if (!guardNames) {
      return [];
    }

    const guards: LoadedGuard[] = [];
    for (const guardName of guardNames) {
      const guardKey = this.createGuardKey(pluginName, guardName);
      const guard = this.guardsMap.get(guardKey);
      if (guard) {
        guards.push(guard);
      }
    }

    return guards;
  }

  /**
   * Create a unique key for storing guards
   */
  private createGuardKey(pluginName: string, guardName: string): string {
    return `${pluginName}:${guardName}`;
  }

  /**
   * Create guard instance if not already created (from PluginGuardRegistryService)
   */
  createGuardInstance(pluginName: string, guardName: string, ...args: any[]): any | undefined {
    const guardKey = this.createGuardKey(pluginName, guardName);
    const guard = this.guardsMap.get(guardKey);

    if (!guard || !guard.guardClass) {
      return undefined;
    }

    if (!guard.instance) {
      try {
        guard.instance = new guard.guardClass(...args);
        this.logger.debug(`Created instance for guard '${guardName}' from plugin '${pluginName}'`);
      } catch (error) {
        this.logger.error(`Failed to create instance for guard '${guardName}':`, error);
        return undefined;
      }
    }

    return guard.instance;
  }

  /**
   * Check if a plugin can use a specific guard (from PluginGuardRegistryService)
   */
  canPluginUseGuard(requestingPluginName: string, guardName: string): boolean {
    const guard = this.findAvailableGuard(requestingPluginName, guardName);
    return !!guard;
  }

  /**
   * Get guards that are exported (available for other plugins to use)
   */
  getExportedGuards(): LoadedGuard[] {
    const exportedGuards: LoadedGuard[] = [];

    for (const guard of this.guardsMap.values()) {
      if (guard.entry.scope === 'external') {
        exportedGuards.push(guard);
      } else if (guard.entry.scope === 'local') {
        const localEntry = guard.entry as LocalGuardEntry;
        if (localEntry.exported === true) {
          exportedGuards.push(guard);
        }
      }
    }

    return exportedGuards;
  }

  /**
   * Get guards available for a specific plugin
   */
  getAvailableGuardsForPlugin(pluginName: string): LoadedGuard[] {
    const availableGuards: LoadedGuard[] = [];

    // Add local guards
    const localGuards = this.getPluginGuards(pluginName);
    availableGuards.push(...localGuards);

    // Add exported guards from other plugins
    const exportedGuards = this.getExportedGuards().filter((guard) => guard.pluginName !== pluginName);
    availableGuards.push(...exportedGuards);

    return availableGuards;
  }

  /**
   * Get statistics about the guard system (enhanced version)
   */
  getGuardStatistics(): {
    totalGuards: number;
    localGuards: number;
    externalGuards: number;
    exportedGuards: number;
    pluginCount: number;
    pluginBreakdown: Record<string, number>;
  } {
    let localGuards = 0;
    let externalGuards = 0;
    let exportedGuards = 0;
    const pluginBreakdown: Record<string, number> = {};

    for (const guard of this.guardsMap.values()) {
      if (guard.entry.scope === 'local') {
        localGuards++;
        const localEntry = guard.entry as LocalGuardEntry;
        if (localEntry.exported) {
          exportedGuards++;
        }
      } else {
        externalGuards++;
      }

      pluginBreakdown[guard.pluginName] = (pluginBreakdown[guard.pluginName] || 0) + 1;
    }

    return {
      totalGuards: this.guardsMap.size,
      localGuards,
      externalGuards,
      exportedGuards,
      pluginCount: this.pluginGuardsMap.size,
      pluginBreakdown,
    };
  }

  /**
   * Enhanced statistics for V2 compatibility (with totalPlugins and guardsByPlugin)
   */
  getStatistics(): {
    totalGuards: number;
    totalPlugins: number;
    guardsByPlugin: Array<{
      plugin: string;
      count: number;
    }>;
  } {
    const guardsByPlugin = Array.from(this.pluginGuardsMap.entries()).map(([plugin, guards]) => ({
      plugin,
      count: guards.size,
    }));

    return {
      totalGuards: this.guardsMap.size,
      totalPlugins: this.pluginGuardsMap.size,
      guardsByPlugin,
    };
  }

  /**
   * Clear all guards (useful for testing or system reset)
   */
  async clearAllGuards(): Promise<void> {
    await this.storageMutex.runExclusive(async () => {
      this.logger.warn('Clearing all guards from the system');
      this.guardsMap.clear();
      this.pluginGuardsMap.clear();
    });
  }
}

// Resolution context to track state during recursive resolution
class GuardResolutionContext {
  private resolutionStack = new Set<string>();
  private visitedGuards = new Set<string>();

  isInResolutionStack(guardName: string): boolean {
    return this.resolutionStack.has(guardName);
  }

  isResolved(guardName: string): boolean {
    return this.visitedGuards.has(guardName) && !this.resolutionStack.has(guardName);
  }

  pushToStack(guardName: string): void {
    this.resolutionStack.add(guardName);
  }

  popFromStack(guardName: string): void {
    this.resolutionStack.delete(guardName);
  }

  markAsVisited(guardName: string): void {
    this.visitedGuards.add(guardName);
  }
}
