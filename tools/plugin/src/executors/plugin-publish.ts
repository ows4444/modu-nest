import { ExecutorContext, PromiseExecutor, logger } from '@nx/devkit';
import { PluginPublishExecutorSchema } from './schema';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dependencies?: string[];
  loadOrder?: number;
  module?: {
    controllers?: string[];
    providers?: string[];
    exports?: string[];
    imports?: string[];
  };
}

interface PluginRegistryEntry {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dependencies: string[];
  loadOrder: number;
  publishedAt: string;
  path: string;
}

interface PublishResult {
  success: boolean;
  pluginPath?: string;
  error?: string;
}

class PluginPublisher {
  private sourceRoot: string;
  private projectName: string;
  private targetPluginsDir: string;

  constructor(sourceRoot: string, projectName: string, targetPluginsDir: string) {
    this.sourceRoot = sourceRoot;
    this.projectName = projectName;
    this.targetPluginsDir = targetPluginsDir;
  }

  async publish(options: PluginPublishExecutorSchema): Promise<PublishResult> {
    try {
      logger.info(`Publishing plugin ${this.projectName}...`);

      if (options.useZip) {
        if (options.keepZipFile) {
          return await this.publishZipFile(options.zipPath || 'releases');
        } else {
          return await this.publishFromZip(options.zipPath || 'releases');
        }
      } else {
        return await this.publishFromBuild(options.outputPath || 'dist');
      }
    } catch (error) {
      logger.error(`Publish failed: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  private async publishFromBuild(outputPath: string): Promise<PublishResult> {
    const buildDir = path.join(this.sourceRoot, outputPath);

    // Validate build directory exists
    if (!fs.existsSync(buildDir)) {
      throw new Error(
        `Build directory not found: ${buildDir}. Run the build command first: npx nx run ${this.projectName}:plugin-build`
      );
    }

    // Validate manifest exists in build
    const manifestPath = path.join(buildDir, 'plugin.manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('plugin.manifest.json not found in build directory');
    }

    // Read and validate manifest
    const manifest = await this.loadAndValidateManifest(manifestPath);

    // Create target directory
    await this.ensureTargetDirectory();

    // Create plugin-specific directory
    const pluginTargetDir = path.join(this.targetPluginsDir, manifest.name);
    if (fs.existsSync(pluginTargetDir)) {
      logger.info(`Updating existing plugin: ${manifest.name}`);
      fs.rmSync(pluginTargetDir, { recursive: true, force: true });
    }

    fs.mkdirSync(pluginTargetDir, { recursive: true });

    // Copy all build artifacts to target directory
    await this.copyRecursiveSync(buildDir, pluginTargetDir);
    logger.info(`✅ Plugin files copied to ${pluginTargetDir}`);

    // Update plugins registry
    await this.updatePluginsRegistry(manifest, pluginTargetDir);

    // Create plugin index file for easy importing
    await this.createPluginIndex(manifest, pluginTargetDir);

    this.logPublishSuccess(manifest, pluginTargetDir, 'build');
    return { success: true, pluginPath: pluginTargetDir };
  }

  private async publishFromZip(zipPath: string): Promise<PublishResult> {
    const zipDir = path.join(this.sourceRoot, zipPath);

    if (!fs.existsSync(zipDir)) {
      throw new Error(
        `ZIP directory not found: ${zipDir}. Run the ZIP command first: npx nx run ${this.projectName}:plugin-zip`
      );
    }

    // Find the latest ZIP file for this plugin
    const zipFiles = fs
      .readdirSync(zipDir)
      .filter((file) => file.startsWith(`${this.projectName}-v`) && file.endsWith('.zip'))
      .sort()
      .reverse(); // Get latest version first

    if (zipFiles.length === 0) {
      throw new Error(
        `No ZIP file found for plugin ${this.projectName} in ${zipDir}. Run the ZIP command first: npx nx run ${this.projectName}:plugin-zip`
      );
    }

    const latestZip = zipFiles[0];
    const zipFilePath = path.join(zipDir, latestZip);

    logger.info(`Found ZIP package: ${latestZip}`);

    // Create target directory
    await this.ensureTargetDirectory();

    // Extract ZIP to a temporary directory first to read manifest
    const tempExtractDir = path.join(this.targetPluginsDir, `temp-${this.projectName}-${Date.now()}`);
    fs.mkdirSync(tempExtractDir, { recursive: true });

    try {
      // Extract ZIP
      await execAsync(`cd "${tempExtractDir}" && unzip -q "${zipFilePath}"`);

      // Read manifest from extracted files
      const manifestPath = path.join(tempExtractDir, 'plugin.manifest.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('plugin.manifest.json not found in ZIP package');
      }

      const manifest = await this.loadAndValidateManifest(manifestPath);

      // Create final plugin directory
      const pluginTargetDir = path.join(this.targetPluginsDir, manifest.name);
      if (fs.existsSync(pluginTargetDir)) {
        logger.info(`Updating existing plugin: ${manifest.name}`);
        fs.rmSync(pluginTargetDir, { recursive: true, force: true });
      }

      // Move extracted files to final location
      fs.renameSync(tempExtractDir, pluginTargetDir);
      logger.info(`✅ Plugin extracted to ${pluginTargetDir}`);

      // Update plugins registry
      await this.updatePluginsRegistry(manifest, pluginTargetDir);

      // Create plugin index file for easy importing
      await this.createPluginIndex(manifest, pluginTargetDir);

      this.logPublishSuccess(manifest, pluginTargetDir, latestZip);
      return { success: true, pluginPath: pluginTargetDir };
    } finally {
      // Clean up temp directory if it still exists
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    }
  }

  private async publishZipFile(zipPath: string): Promise<PublishResult> {
    const zipDir = path.join(this.sourceRoot, zipPath);

    if (!fs.existsSync(zipDir)) {
      throw new Error(
        `ZIP directory not found: ${zipDir}. Run the ZIP command first: npx nx run ${this.projectName}:plugin-zip`
      );
    }

    // Find the latest ZIP file for this plugin
    const zipFiles = fs
      .readdirSync(zipDir)
      .filter((file) => file.startsWith(`${this.projectName}-v`) && file.endsWith('.zip'))
      .sort()
      .reverse(); // Get latest version first

    if (zipFiles.length === 0) {
      throw new Error(
        `No ZIP file found for plugin ${this.projectName} in ${zipDir}. Run the ZIP command first: npx nx run ${this.projectName}:plugin-zip`
      );
    }

    const latestZip = zipFiles[0];
    const zipFilePath = path.join(zipDir, latestZip);

    logger.info(`Found ZIP package: ${latestZip}`);

    // Extract ZIP to a temporary directory first to read manifest
    const tempExtractDir = path.join('/tmp', `temp-${this.projectName}-${Date.now()}`);
    fs.mkdirSync(tempExtractDir, { recursive: true });

    let manifest: PluginManifest;

    try {
      // Extract ZIP to temp location to read manifest
      await execAsync(`cd "${tempExtractDir}" && unzip -q "${zipFilePath}"`);

      // Read manifest from extracted files
      const manifestPath = path.join(tempExtractDir, 'plugin.manifest.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('plugin.manifest.json not found in ZIP package');
      }

      manifest = await this.loadAndValidateManifest(manifestPath);
    } finally {
      // Clean up temp directory
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    }

    // Create target directory
    await this.ensureTargetDirectory();

    // Copy ZIP file to plugins directory with plugin name
    const targetZipPath = path.join(this.targetPluginsDir, `${manifest.name}.zip`);

    if (fs.existsSync(targetZipPath)) {
      logger.info(`Updating existing ZIP plugin: ${manifest.name}`);
      fs.unlinkSync(targetZipPath);
    }

    fs.copyFileSync(zipFilePath, targetZipPath);
    logger.info(`✅ ZIP file copied to ${targetZipPath}`);

    // Update plugins registry
    await this.updatePluginsRegistry(manifest, targetZipPath);

    this.logPublishSuccess(manifest, targetZipPath, latestZip);
    return { success: true, pluginPath: targetZipPath };
  }

  private async loadAndValidateManifest(manifestPath: string): Promise<PluginManifest> {
    try {
      const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      if (!manifest.name || !manifest.version) {
        throw new Error('Invalid manifest: missing name or version');
      }

      // Validate semantic versioning
      if (!this.isValidSemver(manifest.version)) {
        throw new Error(`Invalid version format: ${manifest.version}. Must follow semantic versioning.`);
      }

      return manifest;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in manifest: ${error.message}`);
      }
      throw error;
    }
  }

  private isValidSemver(version: string): boolean {
    const semverRegex =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    return semverRegex.test(version);
  }

  private async ensureTargetDirectory(): Promise<void> {
    if (!fs.existsSync(this.targetPluginsDir)) {
      fs.mkdirSync(this.targetPluginsDir, { recursive: true });
      logger.info(`Created plugins directory: ${this.targetPluginsDir}`);
    }
  }

  private async updatePluginsRegistry(manifest: PluginManifest, pluginPath: string): Promise<void> {
    const registryPath = path.join(this.targetPluginsDir, 'plugins-registry.json');
    let registry: { plugins: PluginRegistryEntry[] } = { plugins: [] };

    if (fs.existsSync(registryPath)) {
      try {
        registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      } catch (error) {
        logger.warn(`Invalid registry file, creating new one: ${error}`);
        registry = { plugins: [] };
      }
    }

    // Ensure plugins array exists
    if (!Array.isArray(registry.plugins)) {
      registry.plugins = [];
    }

    // Remove existing entry if it exists
    registry.plugins = registry.plugins.filter((p) => p.name !== manifest.name);

    // Add current plugin
    const registryEntry: PluginRegistryEntry = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description || '',
      author: manifest.author || '',
      license: manifest.license || '',
      dependencies: manifest.dependencies || [],
      loadOrder: manifest.loadOrder || 100,
      publishedAt: new Date().toISOString(),
      path: path.relative(this.targetPluginsDir, pluginPath),
    };

    registry.plugins.push(registryEntry);

    // Sort by load order
    registry.plugins.sort((a, b) => a.loadOrder - b.loadOrder);

    // Write updated registry
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    logger.info(`✅ Updated plugins registry: ${registryPath}`);
  }

  private async createPluginIndex(manifest: PluginManifest, pluginTargetDir: string): Promise<void> {
    const indexContent = `module.exports = require('./index);`;
    const indexPath = path.join(pluginTargetDir, 'plugin.js');
    fs.writeFileSync(indexPath, indexContent);
    logger.info(`✅ Created plugin index: plugin.js`);
  }

  private logPublishSuccess(manifest: PluginManifest, pluginTargetDir: string, source: string): void {
    logger.info(`✅ Plugin ${manifest.name}@${manifest.version} published successfully`);
    logger.info(`   Location: ${pluginTargetDir}`);
    logger.info(`   Load Order: ${manifest.loadOrder || 100}`);
    logger.info(`   Source: ${source}`);

    if (manifest.dependencies && manifest.dependencies.length > 0) {
      logger.info(`   Dependencies: ${manifest.dependencies.join(', ')}`);
    }

    if (manifest.routes && manifest.routes.length > 0) {
      logger.info(`   Routes: ${manifest.routes.join(', ')}`);
    }
  }

  private async copyRecursiveSync(src: string, dest: string): Promise<void> {
    let srcStats;
    try {
      srcStats = fs.statSync(src);
    } catch (error) {
      throw new Error(`Source path does not exist or cannot be accessed: ${src}. Error: ${error}`);
    }

    if (srcStats.isDirectory()) {
      // Ensure destination directory exists
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }

      const items = fs.readdirSync(src);

      for (const childItemName of items) {
        await this.copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
      }
    } else {
      // Ensure destination directory exists
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(src, dest);
    }
  }
}

const runExecutor: PromiseExecutor<PluginPublishExecutorSchema> = async (options, context: ExecutorContext) => {
  const {
    outputPath = 'dist',
    pluginsDir = 'apps/plugin-host/src/assets/plugins',
    useZip = true,
    zipPath = 'releases',
    keepZipFile = true,
  } = options;

  const projectName = context.projectName;
  if (!projectName) {
    logger.error('Project name not found in context');
    return { success: false };
  }

  const projectRoot = context.projectGraph?.nodes[projectName]?.data?.root;
  if (!projectRoot) {
    logger.error(`Could not find project root for ${projectName}`);
    return { success: false };
  }

  const sourceRoot = path.join(context.root, projectRoot);
  const targetPluginsDir = path.resolve(context.root, pluginsDir);

  try {
    const publisher = new PluginPublisher(sourceRoot, projectName, targetPluginsDir);
    const result = await publisher.publish({
      outputPath,
      pluginsDir,
      useZip,
      zipPath,
      keepZipFile,
    });

    return { success: result.success };
  } catch (error) {
    logger.error(`Publish executor failed: ${error}`);
    return { success: false };
  }
};

export default runExecutor;
