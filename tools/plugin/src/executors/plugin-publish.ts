import { ExecutorContext, PromiseExecutor, logger } from '@nx/devkit';
import { PluginPublishExecutorSchema } from './schema';
import * as fs from 'fs';
import * as path from 'path';

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  entryPoint: string;
  dependencies?: string[];
  loadOrder?: number;
  compatibilityVersion: string;
  routes?: string[];
  configuration?: {
    schema: Record<string, unknown>;
  };
}

const runExecutor: PromiseExecutor<PluginPublishExecutorSchema> = async (
  options,
  context: ExecutorContext
) => {
  const { outputPath = 'dist', pluginsDir = './plugins' } = options;

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
  const buildDir = path.join(sourceRoot, outputPath);
  const targetPluginsDir = path.resolve(context.root, pluginsDir);

  try {
    logger.info(`Publishing plugin ${projectName}...`);

    // Check if build directory exists
    if (!fs.existsSync(buildDir)) {
      logger.error(`Build directory not found: ${buildDir}`);
      logger.info(
        'Run the build command first: npx nx run <plugin-name>:plugin-build'
      );
      return { success: false };
    }

    // Validate manifest exists in build
    const manifestPath = path.join(buildDir, 'plugin.manifest.json');
    if (!fs.existsSync(manifestPath)) {
      logger.error('plugin.manifest.json not found in build directory');
      return { success: false };
    }

    // Read and validate manifest
    const manifest: PluginManifest = JSON.parse(
      fs.readFileSync(manifestPath, 'utf8')
    );
    if (!manifest.name || !manifest.version) {
      logger.error('Invalid manifest: missing name or version');
      return { success: false };
    }

    // Create plugins directory if it doesn't exist
    if (!fs.existsSync(targetPluginsDir)) {
      fs.mkdirSync(targetPluginsDir, { recursive: true });
      logger.info(`Created plugins directory: ${targetPluginsDir}`);
    }

    // Create plugin-specific directory
    const pluginTargetDir = path.join(targetPluginsDir, manifest.name);
    if (fs.existsSync(pluginTargetDir)) {
      logger.info(`Updating existing plugin: ${manifest.name}`);
      // Remove existing version
      fs.rmSync(pluginTargetDir, { recursive: true, force: true });
    }

    fs.mkdirSync(pluginTargetDir, { recursive: true });

    // Copy all build artifacts to target directory
    copyRecursiveSync(buildDir, pluginTargetDir);
    logger.info(`✓ Plugin files copied to ${pluginTargetDir}`);

    // Update plugins registry file
    const registryPath = path.join(targetPluginsDir, 'plugins-registry.json');
    let registry: { plugins: any[] } = { plugins: [] };

    if (fs.existsSync(registryPath)) {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    }

    // Remove existing entry if it exists
    registry.plugins = registry.plugins.filter(p => p.name !== manifest.name);

    // Add current plugin
    registry.plugins.push({
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      license: manifest.license,
      entryPoint: manifest.entryPoint,
      dependencies: manifest.dependencies || [],
      loadOrder: manifest.loadOrder || 100,
      compatibilityVersion: manifest.compatibilityVersion,
      routes: manifest.routes || [],
      configuration: manifest.configuration,
      publishedAt: new Date().toISOString(),
      path: path.relative(targetPluginsDir, pluginTargetDir),
    });

    // Sort by load order
    registry.plugins.sort((a, b) => a.loadOrder - b.loadOrder);

    // Write updated registry
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    logger.info(`✓ Updated plugins registry: ${registryPath}`);

    // Create plugin index file for easy importing
    const indexContent = `module.exports = require('./${
      manifest.entryPoint || 'index'
    }');`;
    fs.writeFileSync(path.join(pluginTargetDir, 'plugin.js'), indexContent);

    logger.info(
      `✓ Plugin ${manifest.name}@${manifest.version} published successfully`
    );
    logger.info(`   Location: ${pluginTargetDir}`);
    logger.info(`   Load Order: ${manifest.loadOrder || 100}`);

    if (manifest.dependencies && manifest.dependencies.length > 0) {
      logger.info(`   Dependencies: ${manifest.dependencies.join(', ')}`);
    }

    return { success: true };
  } catch (error) {
    logger.error(`Publish failed: ${error}`);
    return { success: false };
  }
};

function copyRecursiveSync(src: string, dest: string) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest);
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

export default runExecutor;
