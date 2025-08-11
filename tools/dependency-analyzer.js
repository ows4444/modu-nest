#!/usr/bin/env node

/**
 * Library Dependency Analyzer
 * 
 * Analyzes dependencies between libraries in the monorepo to detect:
 * - Circular dependencies
 * - Dependency depth issues
 * - Unused dependencies
 * - Version mismatches
 */

const fs = require('fs');
const path = require('path');

class LibraryDependencyAnalyzer {
  constructor(libsPath) {
    this.libsPath = libsPath;
    this.libraries = new Map();
    this.dependencyGraph = new Map();
    this.circularDependencies = [];
    this.versionMismatches = [];
  }

  /**
   * Main analysis method
   */
  analyze() {
    console.log('🔍 Analyzing library dependencies...\n');
    
    this.discoverLibraries();
    this.buildDependencyGraph();
    this.detectCircularDependencies();
    this.detectVersionMismatches();
    this.generateReport();
  }

  /**
   * Discover all libraries in the libs directory
   */
  discoverLibraries() {
    const findPackageJsons = (dir, basePath = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name === 'node_modules') continue;
        
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);
        
        if (entry.isDirectory()) {
          findPackageJsons(fullPath, relativePath);
        } else if (entry.name === 'package.json') {
          try {
            const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            if (packageJson.name && packageJson.name.startsWith('@libs/')) {
              this.libraries.set(packageJson.name, {
                name: packageJson.name,
                version: packageJson.version,
                path: relativePath.replace('/package.json', ''),
                fullPath: fullPath,
                dependencies: packageJson.dependencies || {},
                devDependencies: packageJson.devDependencies || {},
                peerDependencies: packageJson.peerDependencies || {}
              });
            }
          } catch (error) {
            console.warn(`⚠️  Warning: Could not parse ${fullPath}: ${error.message}`);
          }
        }
      }
    };

    findPackageJsons(this.libsPath);
    console.log(`📚 Discovered ${this.libraries.size} libraries`);
  }

  /**
   * Build dependency graph
   */
  buildDependencyGraph() {
    for (const [libName, libInfo] of this.libraries) {
      const deps = new Set();
      
      // Add all types of dependencies that are internal libraries
      const allDeps = {
        ...libInfo.dependencies,
        ...libInfo.devDependencies,
        ...libInfo.peerDependencies
      };
      
      for (const [depName, depVersion] of Object.entries(allDeps)) {
        if (depName.startsWith('@libs/') && this.libraries.has(depName)) {
          deps.add(depName);
        }
      }
      
      this.dependencyGraph.set(libName, deps);
    }
  }

  /**
   * Detect circular dependencies using DFS
   */
  detectCircularDependencies() {
    const visited = new Set();
    const recursionStack = new Set();
    const pathStack = [];

    const dfs = (node) => {
      if (recursionStack.has(node)) {
        // Found a cycle
        const cycleStart = pathStack.indexOf(node);
        const cycle = pathStack.slice(cycleStart).concat([node]);
        this.circularDependencies.push(cycle);
        return true;
      }

      if (visited.has(node)) {
        return false;
      }

      visited.add(node);
      recursionStack.add(node);
      pathStack.push(node);

      const dependencies = this.dependencyGraph.get(node) || new Set();
      for (const dep of dependencies) {
        if (dfs(dep)) {
          return true; // Propagate cycle detection
        }
      }

      recursionStack.delete(node);
      pathStack.pop();
      return false;
    };

    for (const libName of this.libraries.keys()) {
      if (!visited.has(libName)) {
        dfs(libName);
      }
    }
  }

  /**
   * Detect version mismatches
   */
  detectVersionMismatches() {
    const dependencyVersions = new Map();

    // Collect all dependency version requirements
    for (const [libName, libInfo] of this.libraries) {
      const allDeps = {
        ...libInfo.dependencies,
        ...libInfo.devDependencies,
        ...libInfo.peerDependencies
      };

      for (const [depName, depVersion] of Object.entries(allDeps)) {
        if (depName.startsWith('@libs/')) {
          if (!dependencyVersions.has(depName)) {
            dependencyVersions.set(depName, new Map());
          }
          dependencyVersions.get(depName).set(libName, depVersion);
        }
      }
    }

    // Check for version mismatches
    for (const [depName, versions] of dependencyVersions) {
      const uniqueVersions = new Set(versions.values());
      if (uniqueVersions.size > 1) {
        this.versionMismatches.push({
          dependency: depName,
          versions: Array.from(versions.entries())
        });
      }
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\n📊 DEPENDENCY ANALYSIS REPORT\n');
    console.log('='.repeat(50));

    // Library summary
    console.log('\n📚 LIBRARY OVERVIEW');
    console.log('-'.repeat(20));
    for (const [name, info] of this.libraries) {
      const depsCount = this.dependencyGraph.get(name)?.size || 0;
      console.log(`${name}@${info.version} (${depsCount} internal deps)`);
    }

    // Dependency graph
    console.log('\n🕸️  DEPENDENCY GRAPH');
    console.log('-'.repeat(20));
    for (const [libName, deps] of this.dependencyGraph) {
      if (deps.size > 0) {
        console.log(`${libName}:`);
        for (const dep of deps) {
          console.log(`  └── ${dep}`);
        }
      }
    }

    // Circular dependencies
    console.log('\n🔄 CIRCULAR DEPENDENCIES');
    console.log('-'.repeat(25));
    if (this.circularDependencies.length === 0) {
      console.log('✅ No circular dependencies detected');
    } else {
      console.log(`❌ Found ${this.circularDependencies.length} circular dependency chain(s):`);
      this.circularDependencies.forEach((cycle, index) => {
        console.log(`  ${index + 1}. ${cycle.join(' → ')}`);
      });
    }

    // Version mismatches
    console.log('\n🔢 VERSION MISMATCHES');
    console.log('-'.repeat(20));
    if (this.versionMismatches.length === 0) {
      console.log('✅ No version mismatches detected');
    } else {
      console.log(`❌ Found ${this.versionMismatches.length} version mismatch(es):`);
      this.versionMismatches.forEach((mismatch, index) => {
        console.log(`  ${index + 1}. ${mismatch.dependency}:`);
        mismatch.versions.forEach(([lib, version]) => {
          console.log(`     ${lib} requires ${version}`);
        });
      });
    }

    // Recommendations
    this.generateRecommendations();

    // Exit with appropriate code
    const hasIssues = this.circularDependencies.length > 0 || this.versionMismatches.length > 0;
    if (hasIssues) {
      console.log('\n❌ Analysis completed with issues. Please address the problems above.');
      process.exit(1);
    } else {
      console.log('\n✅ Analysis completed successfully. No dependency issues found.');
      process.exit(0);
    }
  }

  /**
   * Generate recommendations
   */
  generateRecommendations() {
    console.log('\n💡 RECOMMENDATIONS');
    console.log('-'.repeat(18));

    if (this.circularDependencies.length > 0) {
      console.log('🔄 Circular Dependency Solutions:');
      console.log('   1. Extract shared interfaces to @libs/shared-interfaces');
      console.log('   2. Use dependency injection instead of direct imports');
      console.log('   3. Consider architectural refactoring to reduce coupling');
      console.log('   4. Use event-driven patterns for loose coupling');
    }

    if (this.versionMismatches.length > 0) {
      console.log('🔢 Version Mismatch Solutions:');
      console.log('   1. Standardize on single version for each internal dependency');
      console.log('   2. Use workspace:* for latest internal versions');
      console.log('   3. Update package.json files to match semantic versioning');
      console.log('   4. Consider automated version bumping with changesets');
    }

    // General recommendations
    console.log('🏗️ Architecture Recommendations:');
    
    // Find libraries with high dependency count
    const highDependencyLibs = Array.from(this.dependencyGraph.entries())
      .filter(([, deps]) => deps.size >= 3)
      .sort(([, a], [, b]) => b.size - a.size);
    
    if (highDependencyLibs.length > 0) {
      console.log('   📊 Libraries with high dependency count:');
      highDependencyLibs.slice(0, 3).forEach(([libName, deps]) => {
        console.log(`      ${libName}: ${deps.size} dependencies`);
      });
      console.log('   💡 Consider refactoring to reduce coupling');
    }

    // Find leaf libraries (no dependents)
    const dependents = new Map();
    for (const [lib, deps] of this.dependencyGraph) {
      for (const dep of deps) {
        if (!dependents.has(dep)) dependents.set(dep, new Set());
        dependents.get(dep).add(lib);
      }
    }

    const leafLibraries = Array.from(this.libraries.keys())
      .filter(lib => !dependents.has(lib) || dependents.get(lib).size === 0);
    
    if (leafLibraries.length > 0) {
      console.log('   🍃 Potential unused libraries:');
      leafLibraries.slice(0, 3).forEach(lib => {
        console.log(`      ${lib}`);
      });
    }
  }

  /**
   * Export dependency graph for external tools
   */
  exportGraph(format = 'json') {
    const graphData = {
      libraries: Object.fromEntries(this.libraries),
      dependencies: Object.fromEntries(
        Array.from(this.dependencyGraph.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
      analysis: {
        circularDependencies: this.circularDependencies,
        versionMismatches: this.versionMismatches,
        timestamp: new Date().toISOString()
      }
    };

    const outputPath = path.join(process.cwd(), `dependency-graph.${format}`);
    
    if (format === 'json') {
      fs.writeFileSync(outputPath, JSON.stringify(graphData, null, 2));
    } else if (format === 'dot') {
      // Generate Graphviz DOT format
      let dotContent = 'digraph LibraryDependencies {\n';
      dotContent += '  rankdir=TB;\n';
      dotContent += '  node [shape=box, style=rounded];\n\n';
      
      for (const [lib, deps] of this.dependencyGraph) {
        for (const dep of deps) {
          dotContent += `  "${lib}" -> "${dep}";\n`;
        }
      }
      
      dotContent += '}\n';
      fs.writeFileSync(outputPath, dotContent);
    }

    console.log(`📁 Dependency graph exported to: ${outputPath}`);
  }
}

// CLI Interface
function main() {
  const args = process.argv.slice(2);
  const libsPath = args[0] || path.join(process.cwd(), 'libs');
  
  if (!fs.existsSync(libsPath)) {
    console.error(`❌ Error: libs directory not found at ${libsPath}`);
    process.exit(1);
  }

  const analyzer = new LibraryDependencyAnalyzer(libsPath);
  analyzer.analyze();

  // Export graph if requested
  if (args.includes('--export-json')) {
    analyzer.exportGraph('json');
  }
  
  if (args.includes('--export-dot')) {
    analyzer.exportGraph('dot');
  }
}

if (require.main === module) {
  main();
}

module.exports = LibraryDependencyAnalyzer;