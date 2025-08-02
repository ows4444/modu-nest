import { Injectable, Logger, DynamicModule, Module } from '@nestjs/common';
import 'reflect-metadata';
import path from 'path';
import fs from 'fs';
import {
  PluginManifest,
  LoadedPlugin,
  PluginGuardRegistryService,
  getPluginGuardMetadata,
  isPluginGuardClass,
  RegisteredPluginGuard,
} from '@modu-nest/plugin-types';

@Injectable()
export class PluginLoaderService {
  private readonly logger = new Logger(PluginLoaderService.name);
  private loadedPlugins = new Map<string, LoadedPlugin>();
  private guardRegistry?: PluginGuardRegistryService;

  // Security: List of unsafe modules that plugins should not use
  private readonly UNSAFE_MODULES = [
    'fs',
    'fs/promises',
    'node:fs',
    'node:fs/promises',
    'child_process',
    'node:child_process',
    'process',
    'node:process',
    'os',
    'node:os',
    'path',
    'node:path',
    'crypto',
    'node:crypto',
    'net',
    'node:net',
    'http',
    'node:http',
    'https',
    'node:https',
    'url',
    'node:url',
    'stream',
    'node:stream',
    'events',
    'node:events',
    'util',
    'node:util',
    'cluster',
    'node:cluster',
    'worker_threads',
    'node:worker_threads',
  ];

  getLoadedPlugins(): Map<string, LoadedPlugin> {
    return this.loadedPlugins;
  }

  setGuardRegistry(guardRegistry: PluginGuardRegistryService): void {
    this.guardRegistry = guardRegistry;
  }

  async scanAndLoadAllPlugins(): Promise<DynamicModule[]> {
    this.logger.log('Scanning plugins folder for available plugins...');
    const pluginsPath = process.env.PLUGINS_DIR || path.resolve(__dirname, 'assets', 'plugins');
    const dynamicModules: DynamicModule[] = [];

    try {
      if (!fs.existsSync(pluginsPath)) {
        this.logger.warn(`Plugins directory not found: ${pluginsPath}`);
        this.logger.debug(`Expected path: ${pluginsPath}`);
        return dynamicModules;
      }

      const pluginDirs = fs
        .readdirSync(pluginsPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      this.logger.log(`Found plugin directories: ${pluginDirs.join(', ')}`);

      for (const pluginDir of pluginDirs) {
        try {
          const pluginPath = path.join(pluginsPath, pluginDir);
          const manifestPath = path.join(pluginPath, 'plugin.manifest.json');
          const indexPath = path.join(pluginPath, 'index.js');

          // Check for required files
          if (!fs.existsSync(manifestPath)) {
            this.logger.warn(`Skipping ${pluginDir}: missing manifest file`);
            continue;
          }

          if (!fs.existsSync(indexPath)) {
            this.logger.warn(`Skipping ${pluginDir}: missing index.js file`);
            continue;
          }

          // Load and validate manifest
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PluginManifest;

          if (!manifest.name) {
            this.logger.warn(`Skipping ${pluginDir}: invalid manifest - missing name`);
            continue;
          }

          this.logger.debug(`Loading plugin: ${manifest.name}`);

          // Security validation: scan for unsafe imports
          const unsafeImportResults = this.scanDirectoryForUnsafeImports(pluginPath);
          if (unsafeImportResults.length > 0) {
            this.logger.error(`Security validation failed for plugin ${manifest.name} - unsafe imports detected:`);
            for (const result of unsafeImportResults) {
              this.logger.error(`   ${result.file}: ${result.imports.join(', ')}`);
            }
            this.logger.error('   Plugins are not allowed to use Node.js system modules for security reasons.');
            continue;
          }

          // Import plugin module
          const pluginModule = await import(/* webpackIgnore: true */ indexPath);
          const dynamicModule = await this.createDynamicModuleFromPlugin(manifest, pluginModule);

          if (dynamicModule) {
            // Scan for and register plugin guards
            this.scanAndRegisterPluginGuards(manifest, pluginModule);

            dynamicModules.push(dynamicModule);
            this.loadedPlugins.set(manifest.name, {
              manifest,
              module: dynamicModule,
              instance: pluginModule,
            });
            this.logger.log(`✓ Successfully loaded plugin: ${manifest.name} v${manifest.version}`);
          }
        } catch (error) {
          this.logger.error(`Failed to load plugin ${pluginDir}:`, error);
        }
      }

      this.logger.log(`Successfully loaded ${dynamicModules.length} plugins`);
      return dynamicModules;
    } catch (error) {
      this.logger.error('Failed to scan plugins folder:', error);
      return dynamicModules;
    }
  }

  private async createDynamicModuleFromPlugin(
    manifest: PluginManifest,
    pluginModule: Record<string, unknown>
  ): Promise<DynamicModule | null> {
    try {
      this.logger.debug(`Creating dynamic module for plugin: ${manifest.name}`);
      this.logger.debug(`Available exports: ${Object.keys(pluginModule).join(', ')}`);

      // Validate manifest module structure
      if (!manifest.module || typeof manifest.module !== 'object') {
        this.logger.error(`Invalid manifest module structure for plugin '${manifest.name}'`);
        return null;
      }

      // Helper function to resolve component references from manifest
      const resolveComponents = (componentRefs: string[] | string | undefined): any[] => {
        if (!componentRefs) return [];

        const refs = Array.isArray(componentRefs) ? componentRefs : [componentRefs];
        const components: any[] = [];

        for (const ref of refs) {
          if (typeof ref !== 'string' || !ref.trim()) {
            this.logger.warn(`Invalid component reference in manifest for plugin '${manifest.name}': ${ref}`);
            continue;
          }

          const component = pluginModule[ref];
          if (!component) {
            this.logger.warn(`Component '${ref}' not found in plugin exports for '${manifest.name}'`);
            continue;
          }

          if (typeof component !== 'function') {
            this.logger.warn(`Component '${ref}' is not a valid class/function for plugin '${manifest.name}'`);
            continue;
          }

          components.push(component);
          this.logger.debug(`Resolved component '${ref}' for plugin '${manifest.name}'`);
        }

        return components;
      };

      // Resolve plugin components from manifest
      const controllers = resolveComponents(manifest.module.controllers);
      const providers = resolveComponents(manifest.module.providers);
      const moduleExports = resolveComponents(manifest.module.exports);
      const imports = resolveComponents(manifest.module.imports);

      // Generate module class name from plugin name
      const moduleClassName = `${
        manifest.name.charAt(0).toUpperCase() +
        manifest.name.slice(1).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      }Module`;

      // Create a dynamic module class at runtime using decorator
      const DynamicPluginModule = class {};

      // Set meaningful name for debugging
      Object.defineProperty(DynamicPluginModule, 'name', {
        value: moduleClassName,
        configurable: true,
      });

      // Apply @Module decorator at runtime
      const moduleDecorator = Module({
        controllers,
        providers,
        exports: moduleExports,
        imports,
      });

      // Apply the decorator to the class
      moduleDecorator(DynamicPluginModule);

      // Return the dynamic module configuration
      const dynamicModule: DynamicModule = {
        module: DynamicPluginModule,
        global: false,
      };

      this.logger.log(
        `✓ Dynamic module created for '${manifest.name}': ` +
          `${controllers.length} controllers, ${providers.length} providers, ` +
          `${moduleExports.length} exports, ${imports.length} imports`
      );

      return dynamicModule;
    } catch (error) {
      this.logger.error(`Failed to create dynamic module for ${manifest.name}:`, error);
      return null;
    }
  }

  /**
   * Reloads all plugins from the plugins directory
   * Useful for hot-reloading plugins in development
   */
  async reloadPlugins(): Promise<DynamicModule[]> {
    this.logger.log('Reloading all plugins...');
    this.loadedPlugins.clear();
    return this.scanAndLoadAllPlugins();
  }

  /**
   * Gets a specific loaded plugin by name
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(name);
  }

  /**
   * Gets plugin statistics
   */
  getPluginStats() {
    const plugins = Array.from(this.loadedPlugins.values());
    return {
      totalLoaded: plugins.length,
      pluginNames: Array.from(this.loadedPlugins.keys()),
      byVersion: plugins.reduce((acc, plugin) => {
        const version = plugin.manifest.version || 'unknown';
        acc[version] = (acc[version] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byAuthor: plugins.reduce((acc, plugin) => {
        const author = plugin.manifest.author || 'unknown';
        acc[author] = (acc[author] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  private scanForUnsafeImports(filePath: string): string[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const unsafeImports: string[] = [];

    // Check for import statements and require calls
    const importRegex = /(?:import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const moduleName = match[1] || match[2];
      if (this.UNSAFE_MODULES.includes(moduleName)) {
        unsafeImports.push(moduleName);
      }
    }

    return [...new Set(unsafeImports)]; // Remove duplicates
  }

  private scanDirectoryForUnsafeImports(dirPath: string): { file: string; imports: string[] }[] {
    const results: { file: string; imports: string[] }[] = [];

    const scanRecursive = (currentPath: string) => {
      if (!fs.existsSync(currentPath)) {
        return;
      }

      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          scanRecursive(itemPath);
        } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.js'))) {
          const unsafeImports = this.scanForUnsafeImports(itemPath);
          if (unsafeImports.length > 0) {
            results.push({
              file: path.relative(dirPath, itemPath),
              imports: unsafeImports,
            });
          }
        }
      }
    };

    scanRecursive(dirPath);
    return results;
  }

  private scanAndRegisterPluginGuards(manifest: PluginManifest, pluginModule: Record<string, unknown>): void {
    if (!this.guardRegistry) {
      this.logger.debug(`Guard registry not available, skipping guard registration for ${manifest.name}`);
      return;
    }

    let guardCount = 0;

    // Scan all exports for plugin guards
    for (const [exportName, exportValue] of Object.entries(pluginModule)) {
      if (isPluginGuardClass(exportValue)) {
        const guardMetadata = getPluginGuardMetadata(exportValue);

        if (guardMetadata) {
          // Register the guard
          const registeredGuard: RegisteredPluginGuard = {
            metadata: guardMetadata,
            guardClass: exportValue,
          };

          this.guardRegistry.registerGuard(registeredGuard);
          guardCount++;

          this.logger.debug(`Registered guard '${guardMetadata.name}' from plugin '${manifest.name}'`);
        } else {
          this.logger.warn(
            `Found guard class '${exportName}' in plugin '${manifest.name}' but missing metadata. Use @RegisterPluginGuard decorator.`
          );
        }
      }
    }

    if (guardCount > 0) {
      this.logger.log(`Registered ${guardCount} guards from plugin '${manifest.name}'`);
    }
  }
}
