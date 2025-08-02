import { Injectable, Logger } from '@nestjs/common';
import { GuardEntry, LocalGuardEntry } from './plugin-interfaces';

export interface LoadedGuard {
  entry: GuardEntry;
  pluginName: string;
  guardClass?: any;
  instance?: any;
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

  /**
   * Store guards from a plugin without global registration
   * Guards are stored in a centralized map but not globally available
   */
  storePluginGuards(
    pluginName: string, 
    guardEntries: GuardEntry[], 
    pluginModule: Record<string, unknown>
  ): void {
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
        
        if (!guardClass) {
          this.logger.warn(`Guard class '${localEntry.class}' not found in plugin '${pluginName}' exports`);
          continue;
        }
        
        if (typeof guardClass !== 'function') {
          this.logger.warn(`Guard class '${localEntry.class}' is not a valid class in plugin '${pluginName}'`);
          continue;
        }

        this.guardsMap.set(guardKey, {
          entry,
          pluginName,
          guardClass,
        });
        
        pluginGuardNames.add(entry.name);
        this.logger.debug(`Stored local guard '${entry.name}' from plugin '${pluginName}'`);
        
      } else if (entry.scope === 'external') {
        // External guards are just references - store metadata only
        this.guardsMap.set(guardKey, {
          entry,
          pluginName,
        });
        
        pluginGuardNames.add(entry.name);
        this.logger.debug(`Stored external guard reference '${entry.name}' from plugin '${pluginName}'`);
      }
    }
  }

  /**
   * Resolve guards specified in a plugin manifest, ensuring dependencies are met
   * and no circular dependencies exist. Returns only the guards that should be
   * injected for this specific plugin.
   */
  resolveGuardsForPlugin(
    pluginName: string, 
    requestedGuards: string[]
  ): GuardResolutionResult {
    this.logger.debug(`Resolving guards for plugin '${pluginName}': [${requestedGuards.join(', ')}]`);
    
    const resolvedGuards: LoadedGuard[] = [];
    const missingDependencies: string[] = [];
    const circularDependencies: string[] = [];
    const visitedGuards = new Set<string>();
    const resolutionStack = new Set<string>();

    for (const guardName of requestedGuards) {
      const result = this.resolveGuardRecursive(
        pluginName, 
        guardName, 
        visitedGuards, 
        resolutionStack
      );
      
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
  }

  /**
   * Recursively resolve a guard and its dependencies
   */
  private resolveGuardRecursive(
    requestingPlugin: string,
    guardName: string,
    visitedGuards: Set<string>,
    resolutionStack: Set<string>
  ): {
    guard?: LoadedGuard;
    missingDependencies: string[];
    circularDependencies: string[];
  } {
    const missingDependencies: string[] = [];
    const circularDependencies: string[] = [];

    // Check for circular dependency
    if (resolutionStack.has(guardName)) {
      circularDependencies.push(guardName);
      return { missingDependencies, circularDependencies };
    }

    // Skip if already resolved
    if (visitedGuards.has(guardName)) {
      const guard = this.findAvailableGuard(requestingPlugin, guardName);
      return { guard, missingDependencies, circularDependencies };
    }

    resolutionStack.add(guardName);
    visitedGuards.add(guardName);

    // Find the guard
    const guard = this.findAvailableGuard(requestingPlugin, guardName);
    if (!guard) {
      missingDependencies.push(guardName);
      resolutionStack.delete(guardName);
      return { missingDependencies, circularDependencies };
    }

    // Resolve dependencies for local guards
    if (guard.entry.scope === 'local') {
      const localEntry = guard.entry as LocalGuardEntry;
      if (localEntry.dependencies) {
        for (const depName of localEntry.dependencies) {
          const depResult = this.resolveGuardRecursive(
            requestingPlugin,
            depName,
            visitedGuards,
            resolutionStack
          );
          
          missingDependencies.push(...depResult.missingDependencies);
          circularDependencies.push(...depResult.circularDependencies);
        }
      }
    }

    resolutionStack.delete(guardName);
    return { guard, missingDependencies, circularDependencies };
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
    return guards.filter(guard => {
      const key = `${guard.pluginName}:${guard.entry.name}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Clean up guards for a specific plugin
   */
  removePluginGuards(pluginName: string): void {
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
   * Get statistics about the guard system
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
   * Create a unique key for storing guards
   */
  private createGuardKey(pluginName: string, guardName: string): string {
    return `${pluginName}:${guardName}`;
  }

  /**
   * Clear all guards (useful for testing or system reset)
   */
  clearAllGuards(): void {
    this.logger.warn('Clearing all guards from the system');
    this.guardsMap.clear();
    this.pluginGuardsMap.clear();
  }
}