import { Injectable, Logger, DynamicModule } from '@nestjs/common';
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
      // Convert plugin name to PascalCase (e.g., 'x-test-plugin' -> 'XTestPlugin')
      const name = manifest.name
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');

      this.logger.debug(`Looking for plugin components with base name: ${name}`);
      this.logger.debug(`Available exports: ${Object.keys(pluginModule).join(', ')}`);

      // Try to find the module, service, and controller
      const PluginModule = pluginModule[name + 'Module'];
      const PluginService = pluginModule[name + 'Service'];
      const PluginGuardResolverService = pluginModule['PluginGuardResolverService'];
      const PluginController = pluginModule[name + 'Controller'];

      if (!PluginModule) {
        this.logger.error(`No module found for ${manifest.name}. Expected: ${name}Module`);
        return null;
      }

      // Build the dynamic module components
      const controllers = PluginController ? [PluginController] : [];
      const providers = PluginService ? [PluginService] : [];
      const exports = PluginService ? [PluginService] : [];

      if (PluginGuardResolverService) {
        providers.push(PluginGuardResolverService);
        exports.push(PluginGuardResolverService);
      }

      const dynamicModule: DynamicModule = {
        module: PluginModule as any,
        controllers: controllers as any[],
        providers: providers as any[],
        exports: exports as any[],
      };

      this.logger.log(
        `✓ Created dynamic module for ${manifest.name} with ${controllers.length} controllers and ${providers.length} providers`
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
