import { ExecutorContext, PromiseExecutor, logger } from '@nx/devkit';
import { PluginBuildExecutorSchema } from './schema';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

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

const runExecutor: PromiseExecutor<PluginBuildExecutorSchema> = async (options, context: ExecutorContext) => {
  const {
    outputPath = 'dist',
    tsConfig = 'tsconfig.json',
    assets = ['plugin.manifest.json'],
    validateManifest = true,
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
  const outputDir = path.join(sourceRoot, outputPath);

  try {
    logger.info(`Building plugin ${projectName}...`);

    // Validate manifest if required
    if (validateManifest) {
      const manifestPath = path.join(sourceRoot, 'plugin.manifest.json');
      if (!fs.existsSync(manifestPath)) {
        logger.error('plugin.manifest.json not found');
        return { success: false };
      }

      const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest.name || !manifest.version || !manifest.entryPoint) {
        logger.error('Invalid manifest: missing required fields (name, version, entryPoint)');
        return { success: false };
      }
      logger.info('✓ Manifest validation passed');
    }

    // Compile TypeScript
    logger.info('Compiling TypeScript...');
    const tsConfigPath = path.join(sourceRoot, tsConfig);
    // remove the output directory if it exists
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      logger.info(`✓ Removed existing output directory: ${outputDir}`);
    }
    await execAsync(`npx tsc --project ${tsConfigPath} --outDir ${outputDir}`);
    logger.info('✓ TypeScript compilation completed');

    // Copy assets
    logger.info('Copying assets...');
    for (const asset of assets) {
      const assetPath = path.join(sourceRoot, asset);
      const targetPath = path.join(outputDir, asset);

      if (fs.existsSync(assetPath)) {
        fs.copyFileSync(assetPath, targetPath);
        logger.info(`✓ Copied ${asset}`);
      }
    }

    // Ensure package.json exists for module loading
    const packageJsonPath = path.join(outputDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      const sourcePackageJson = path.join(sourceRoot, 'package.json');
      if (fs.existsSync(sourcePackageJson)) {
        fs.copyFileSync(sourcePackageJson, packageJsonPath);
        logger.info('✓ Copied package.json');
      }
    }

    logger.info(`✓ Plugin ${projectName} built successfully to ${outputDir}`);
    return { success: true };
  } catch (error) {
    logger.error(`Build failed: ${error}`);
    return { success: false };
  }
};

export default runExecutor;
