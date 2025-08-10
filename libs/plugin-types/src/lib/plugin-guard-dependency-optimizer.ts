import { Injectable, Logger } from '@nestjs/common';
import { GuardEntry, LocalGuardEntry } from './plugin-interfaces';

export interface GuardNode {
  name: string;
  pluginName: string;
  entry: GuardEntry;
  dependencies: string[];
  dependents: string[];
  level: number;
}

export interface OptimizationResult {
  optimizedOrder: string[];
  circularDependencies: string[];
  redundantDependencies: string[];
  suggestions: string[];
}

export interface DependencyAnalysis {
  totalGuards: number;
  maxDepthLevel: number;
  circularDependencies: string[][];
  redundantDependencies: string[];
  orphanGuards: string[];
  criticalPath: string[];
  loadingEfficiency: number;
}

@Injectable()
export class PluginGuardDependencyOptimizer {
  private readonly logger = new Logger(PluginGuardDependencyOptimizer.name);

  /**
   * Analyze guard dependencies across all plugins for optimization opportunities
   */
  analyzeDependencies(allGuards: Map<string, GuardEntry>, pluginGuards: Map<string, string[]>): DependencyAnalysis {
    this.logger.debug('Starting comprehensive guard dependency analysis');

    const guardNodes = this.buildGuardGraph(allGuards, pluginGuards);
    const circularDependencies = this.findCircularDependencies(guardNodes);
    const redundantDependencies = this.findRedundantDependencies(guardNodes);
    const orphanGuards = this.findOrphanGuards(guardNodes);
    const criticalPath = this.findCriticalPath(guardNodes);
    const maxDepthLevel = Math.max(...guardNodes.map(node => node.level));
    const loadingEfficiency = this.calculateLoadingEfficiency(guardNodes, circularDependencies.length);

    return {
      totalGuards: guardNodes.length,
      maxDepthLevel,
      circularDependencies,
      redundantDependencies,
      orphanGuards,
      criticalPath,
      loadingEfficiency,
    };
  }

  /**
   * Optimize guard loading order to minimize dependency resolution time
   */
  optimizeGuardOrder(guardEntries: GuardEntry[], pluginName: string): OptimizationResult {
    this.logger.debug(`Optimizing guard order for plugin: ${pluginName}`);

    const guardNodes = this.createGuardNodes(guardEntries, pluginName);
    
    // Detect circular dependencies
    const circularDependencies = this.detectCircularDependencies(guardNodes);
    
    // Find redundant dependencies
    const redundantDependencies = this.findRedundantDependencies(guardNodes);
    
    // Calculate optimal loading order using topological sort
    const optimizedOrder = this.topologicalSort(guardNodes);
    
    // Generate optimization suggestions
    const suggestions = this.generateOptimizationSuggestions(guardNodes, circularDependencies, redundantDependencies);

    return {
      optimizedOrder,
      circularDependencies,
      redundantDependencies,
      suggestions,
    };
  }

  /**
   * Create a guard composition pattern to reduce complex dependencies
   */
  suggestGuardComposition(guardNodes: GuardNode[]): {
    compositeGuards: Array<{
      name: string;
      components: string[];
      benefits: string[];
    }>;
    simplificationRatio: number;
  } {
    const compositeGuards: Array<{
      name: string;
      components: string[];
      benefits: string[];
    }> = [];

    // Find commonly used guard combinations
    const combinations = this.findCommonGuardCombinations(guardNodes);
    
    for (const combination of combinations) {
      if (combination.frequency >= 2 && combination.guards.length >= 2) {
        const compositeName = `${combination.guards.join('-')}-composite`;
        const benefits = [
          `Reduces ${combination.frequency} duplicate dependency chains`,
          `Simplifies guard resolution by ${combination.guards.length - 1} steps`,
          'Improves loading performance through batching',
        ];

        compositeGuards.push({
          name: compositeName,
          components: combination.guards,
          benefits,
        });
      }
    }

    const originalComplexity = guardNodes.reduce((sum, node) => sum + node.dependencies.length, 0);
    const optimizedComplexity = originalComplexity - compositeGuards.reduce((sum, comp) => sum + (comp.components.length - 1), 0);
    const simplificationRatio = optimizedComplexity / originalComplexity;

    return { compositeGuards, simplificationRatio };
  }

  /**
   * Generate dependency resolution strategy based on analysis
   */
  generateResolutionStrategy(guardNodes: GuardNode[]): {
    strategy: 'sequential' | 'parallel' | 'hybrid';
    parallelBatches?: string[][];
    sequentialOrder?: string[];
    estimatedLoadTime: number;
  } {
    const circularDeps = this.detectCircularDependencies(guardNodes);
    const maxDepth = Math.max(...guardNodes.map(node => node.level));

    if (circularDeps.length > 0) {
      // Use sequential loading for circular dependencies
      return {
        strategy: 'sequential',
        sequentialOrder: this.topologicalSort(guardNodes),
        estimatedLoadTime: guardNodes.length * 100, // 100ms per guard
      };
    }

    if (maxDepth <= 2 && guardNodes.length <= 10) {
      // Use parallel loading for simple structures
      const parallelBatches = this.createParallelBatches(guardNodes);
      return {
        strategy: 'parallel',
        parallelBatches,
        estimatedLoadTime: parallelBatches.length * 50, // 50ms per batch
      };
    }

    // Use hybrid approach for complex structures
    const parallelBatches = this.createParallelBatches(guardNodes);
    return {
      strategy: 'hybrid',
      parallelBatches,
      sequentialOrder: this.topologicalSort(guardNodes),
      estimatedLoadTime: parallelBatches.length * 75, // 75ms per batch in hybrid mode
    };
  }

  private buildGuardGraph(allGuards: Map<string, GuardEntry>, pluginGuards: Map<string, string[]>): GuardNode[] {
    const nodes: GuardNode[] = [];
    const nodeMap = new Map<string, GuardNode>();

    // Create nodes for all guards
    for (const [guardKey, entry] of allGuards) {
      const [pluginName] = guardKey.split(':');
      const dependencies = entry.scope === 'local' ? (entry as LocalGuardEntry).dependencies || [] : [];
      
      const node: GuardNode = {
        name: entry.name,
        pluginName,
        entry,
        dependencies,
        dependents: [],
        level: 0,
      };

      nodes.push(node);
      nodeMap.set(entry.name, node);
    }

    // Build dependency relationships and calculate levels
    for (const node of nodes) {
      for (const depName of node.dependencies) {
        const depNode = nodeMap.get(depName);
        if (depNode) {
          depNode.dependents.push(node.name);
        }
      }
    }

    // Calculate dependency levels
    this.calculateDependencyLevels(nodes, nodeMap);

    return nodes;
  }

  private calculateDependencyLevels(nodes: GuardNode[], nodeMap: Map<string, GuardNode>): void {
    const visited = new Set<string>();
    const inProgress = new Set<string>();

    const calculateLevel = (node: GuardNode): number => {
      if (inProgress.has(node.name)) {
        return 0; // Circular dependency detected
      }
      if (visited.has(node.name)) {
        return node.level;
      }

      visited.add(node.name);
      inProgress.add(node.name);

      let maxDepLevel = 0;
      for (const depName of node.dependencies) {
        const depNode = nodeMap.get(depName);
        if (depNode) {
          const depLevel = calculateLevel(depNode);
          maxDepLevel = Math.max(maxDepLevel, depLevel + 1);
        }
      }

      node.level = maxDepLevel;
      inProgress.delete(node.name);
      return node.level;
    };

    for (const node of nodes) {
      if (!visited.has(node.name)) {
        calculateLevel(node);
      }
    }
  }

  private createGuardNodes(guardEntries: GuardEntry[], pluginName: string): GuardNode[] {
    return guardEntries.map(entry => ({
      name: entry.name,
      pluginName,
      entry,
      dependencies: entry.scope === 'local' ? (entry as LocalGuardEntry).dependencies || [] : [],
      dependents: [],
      level: 0,
    }));
  }

  private detectCircularDependencies(guardNodes: GuardNode[]): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const circularDeps: string[] = [];

    const dfs = (node: GuardNode, path: string[]): void => {
      if (recursionStack.has(node.name)) {
        const cycleStart = path.indexOf(node.name);
        const cycle = path.slice(cycleStart).concat(node.name);
        circularDeps.push(cycle.join(' -> '));
        return;
      }

      if (visited.has(node.name)) {
        return;
      }

      visited.add(node.name);
      recursionStack.add(node.name);
      path.push(node.name);

      for (const depName of node.dependencies) {
        const depNode = guardNodes.find(n => n.name === depName);
        if (depNode) {
          dfs(depNode, [...path]);
        }
      }

      recursionStack.delete(node.name);
      path.pop();
    };

    for (const node of guardNodes) {
      if (!visited.has(node.name)) {
        dfs(node, []);
      }
    }

    return circularDeps;
  }

  private findCircularDependencies(guardNodes: GuardNode[]): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const nodeMap = new Map(guardNodes.map(node => [node.name, node]));

    const dfs = (nodeName: string, path: string[]): void => {
      if (recursionStack.has(nodeName)) {
        const cycleStart = path.indexOf(nodeName);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        }
        return;
      }

      if (visited.has(nodeName)) {
        return;
      }

      visited.add(nodeName);
      recursionStack.add(nodeName);
      path.push(nodeName);

      const node = nodeMap.get(nodeName);
      if (node) {
        for (const depName of node.dependencies) {
          dfs(depName, [...path]);
        }
      }

      recursionStack.delete(nodeName);
      path.pop();
    };

    for (const node of guardNodes) {
      if (!visited.has(node.name)) {
        dfs(node.name, []);
      }
    }

    return cycles;
  }

  private findRedundantDependencies(guardNodes: GuardNode[]): string[] {
    const redundant: string[] = [];
    const nodeMap = new Map(guardNodes.map(node => [node.name, node]));

    for (const node of guardNodes) {
      // Check if any dependency is already satisfied by transitive dependencies
      for (const depName of node.dependencies) {
        const depNode = nodeMap.get(depName);
        if (depNode) {
          // Check if any other dependency already includes this one transitively
          for (const otherDepName of node.dependencies) {
            if (otherDepName !== depName) {
              const otherDepNode = nodeMap.get(otherDepName);
              if (otherDepNode && this.hasTransitiveDependency(otherDepNode, depName, nodeMap, new Set())) {
                redundant.push(`${node.name} -> ${depName} (redundant via ${otherDepName})`);
              }
            }
          }
        }
      }
    }

    return redundant;
  }

  private hasTransitiveDependency(node: GuardNode, targetDep: string, nodeMap: Map<string, GuardNode>, visited: Set<string>): boolean {
    if (visited.has(node.name)) {
      return false;
    }
    visited.add(node.name);

    if (node.dependencies.includes(targetDep)) {
      return true;
    }

    for (const depName of node.dependencies) {
      const depNode = nodeMap.get(depName);
      if (depNode && this.hasTransitiveDependency(depNode, targetDep, nodeMap, visited)) {
        return true;
      }
    }

    return false;
  }

  private findOrphanGuards(guardNodes: GuardNode[]): string[] {
    return guardNodes
      .filter(node => node.dependents.length === 0 && node.dependencies.length === 0)
      .map(node => node.name);
  }

  private findCriticalPath(guardNodes: GuardNode[]): string[] {
    const maxLevelNode = guardNodes.reduce((max, node) => 
      node.level > max.level ? node : max, guardNodes[0]
    );

    const criticalPath: string[] = [];
    let currentNode = maxLevelNode;
    const nodeMap = new Map(guardNodes.map(node => [node.name, node]));

    while (currentNode) {
      criticalPath.unshift(currentNode.name);
      
      // Find the dependency with the highest level
      let nextNode: GuardNode | undefined;
      for (const depName of currentNode.dependencies) {
        const depNode = nodeMap.get(depName);
        if (depNode && (!nextNode || depNode.level > nextNode.level)) {
          nextNode = depNode;
        }
      }
      if (!nextNode) break;
      currentNode = nextNode;
    }

    return criticalPath;
  }

  private calculateLoadingEfficiency(guardNodes: GuardNode[], circularDepCount: number): number {
    const totalDependencies = guardNodes.reduce((sum, node) => sum + node.dependencies.length, 0);
    const maxPossibleDependencies = guardNodes.length * (guardNodes.length - 1);
    const dependencyRatio = totalDependencies / Math.max(maxPossibleDependencies, 1);
    const circularPenalty = circularDepCount * 0.1;
    
    return Math.max(0, 1 - dependencyRatio - circularPenalty);
  }

  private topologicalSort(guardNodes: GuardNode[]): string[] {
    const nodeMap = new Map(guardNodes.map(node => [node.name, node]));
    const inDegree = new Map<string, number>();
    const result: string[] = [];

    // Initialize in-degree count
    for (const node of guardNodes) {
      inDegree.set(node.name, 0);
    }

    // Calculate in-degrees
    for (const node of guardNodes) {
      for (const depName of node.dependencies) {
        inDegree.set(depName, (inDegree.get(depName) || 0) + 1);
      }
    }

    // Find nodes with no incoming edges
    const queue: string[] = [];
    for (const [nodeName, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeName);
      }
    }

    // Process nodes
    while (queue.length > 0) {
      const currentName = queue.shift()!;
      result.push(currentName);

      const currentNode = nodeMap.get(currentName);
      if (currentNode) {
        for (const depName of currentNode.dependencies) {
          const newDegree = (inDegree.get(depName) || 0) - 1;
          inDegree.set(depName, newDegree);
          
          if (newDegree === 0) {
            queue.push(depName);
          }
        }
      }
    }

    return result.reverse(); // Reverse for dependency-first order
  }

  private generateOptimizationSuggestions(
    guardNodes: GuardNode[], 
    circularDeps: string[], 
    redundantDeps: string[]
  ): string[] {
    const suggestions: string[] = [];

    if (circularDeps.length > 0) {
      suggestions.push(`Remove circular dependencies: ${circularDeps.join(', ')}`);
    }

    if (redundantDeps.length > 0) {
      suggestions.push(`Remove redundant dependencies: ${redundantDeps.length} found`);
    }

    const deeplyNestedGuards = guardNodes.filter(node => node.level > 3);
    if (deeplyNestedGuards.length > 0) {
      suggestions.push(`Consider flattening deeply nested guards (level > 3): ${deeplyNestedGuards.map(n => n.name).join(', ')}`);
    }

    const heavyDependencyGuards = guardNodes.filter(node => node.dependencies.length > 3);
    if (heavyDependencyGuards.length > 0) {
      suggestions.push(`Consider breaking down guards with many dependencies: ${heavyDependencyGuards.map(n => n.name).join(', ')}`);
    }

    return suggestions;
  }

  private findCommonGuardCombinations(guardNodes: GuardNode[]): Array<{ guards: string[]; frequency: number }> {
    const combinations = new Map<string, number>();

    // Find all unique combinations of dependencies
    for (const node of guardNodes) {
      if (node.dependencies.length >= 2) {
        const sortedDeps = [...node.dependencies].sort();
        const key = sortedDeps.join(',');
        combinations.set(key, (combinations.get(key) || 0) + 1);
      }
    }

    return Array.from(combinations.entries())
      .map(([key, frequency]) => ({
        guards: key.split(','),
        frequency,
      }))
      .filter(combo => combo.frequency > 1);
  }

  private createParallelBatches(guardNodes: GuardNode[]): string[][] {
    const batches: string[][] = [];
    const nodeMap = new Map(guardNodes.map(node => [node.name, node]));
    const processed = new Set<string>();

    // Group guards by dependency level
    const levelGroups = new Map<number, string[]>();
    for (const node of guardNodes) {
      const level = node.level;
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level)!.push(node.name);
    }

    // Create batches from level groups
    const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
    for (const level of sortedLevels) {
      const levelGuards = levelGroups.get(level) || [];
      const batch = levelGuards.filter(guardName => {
        const node = nodeMap.get(guardName);
        if (!node) return false;
        
        // Only include if all dependencies are already processed
        return node.dependencies.every(dep => processed.has(dep));
      });

      if (batch.length > 0) {
        batches.push(batch);
        batch.forEach(guardName => processed.add(guardName));
      }
    }

    return batches;
  }
}