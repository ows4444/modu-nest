import { ExecutorContext, PromiseExecutor, logger } from '@nx/devkit';
import { PluginValidateExecutorSchema } from './schema';
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

const runExecutor: PromiseExecutor<PluginValidateExecutorSchema> = async (
  options,
  context: ExecutorContext
) => {
  const { tsConfig = 'tsconfig.json', validateManifest = true } = options;

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
  let hasErrors = false;

  try {
    logger.info(`Validating plugin ${projectName}...`);

    // 1. Validate manifest schema
    if (validateManifest) {
      logger.info('Validating plugin manifest...');
      const manifestPath = path.join(sourceRoot, 'plugin.manifest.json');

      if (!fs.existsSync(manifestPath)) {
        logger.error('❌ plugin.manifest.json not found');
        hasErrors = true;
      } else {
        try {
          const manifest: PluginManifest = JSON.parse(
            fs.readFileSync(manifestPath, 'utf8')
          );

          // Required fields validation
          const requiredFields = [
            'name',
            'version',
            'entryPoint',
            'compatibilityVersion',
          ];
          for (const field of requiredFields) {
            if (!manifest[field as keyof PluginManifest]) {
              logger.error(`❌ Missing required field in manifest: ${field}`);
              hasErrors = true;
            }
          }

          // Validate load order is a number if present
          if (
            manifest.loadOrder !== undefined &&
            typeof manifest.loadOrder !== 'number'
          ) {
            logger.error('❌ loadOrder must be a number');
            hasErrors = true;
          }

          // Validate dependencies array if present
          if (manifest.dependencies && !Array.isArray(manifest.dependencies)) {
            logger.error('❌ dependencies must be an array');
            hasErrors = true;
          }

          if (!hasErrors) {
            logger.info('✓ Manifest validation passed');
          }
        } catch (error) {
          logger.error(`❌ Invalid JSON in manifest: ${error}`);
          hasErrors = true;
        }
      }
    }

    // 2. TypeScript type checking
    logger.info('Running TypeScript type check...');
    try {
      const tsConfigPath = path.join(sourceRoot, tsConfig);
      if (!fs.existsSync(tsConfigPath)) {
        logger.error(`❌ TypeScript config not found: ${tsConfig}`);
        hasErrors = true;
      } else {
        await execAsync(`npx tsc --project ${tsConfigPath} --noEmit`);
        logger.info('✓ TypeScript type check passed');
      }
    } catch (error) {
      logger.error(`❌ TypeScript type check failed: ${error}`);
      hasErrors = true;
    }

    // 3. Validate NestJS structure
    logger.info('Validating NestJS structure...');
    const srcDir = path.join(sourceRoot, 'src');
    // projectName already defined above

    const expectedFiles = [
      `${projectName}.module.ts`,
      `${projectName}.service.ts`,
      `${projectName}.controller.ts`,
      'index.ts',
    ];

    for (const file of expectedFiles) {
      const filePath = path.join(srcDir, file);
      if (!fs.existsSync(filePath)) {
        logger.error(`❌ Missing required file: src/${file}`);
        hasErrors = true;
      }
    }

    // 4. Validate module exports
    const indexPath = path.join(srcDir, 'index.ts');
    if (fs.existsSync(indexPath)) {
      const indexContent = fs.readFileSync(indexPath, 'utf8');
      // Check if the module file is exported (more flexible approach)
      const moduleFileExportPattern = new RegExp(
        `export.*from.*${projectName}\\.module`,
        'i'
      );

      if (!moduleFileExportPattern.test(indexContent)) {
        logger.error(`❌ index.ts must export the plugin module`);
        hasErrors = true;
      } else {
        logger.info('✓ Module export validation passed');
      }
    }

    // 5. Check package.json dependencies
    const packageJsonPath = path.join(sourceRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8')
        );
        const nestDeps = ['@nestjs/common', '@nestjs/core'];
        const missingDeps = nestDeps.filter(
          dep =>
            !packageJson.dependencies?.[dep] &&
            !packageJson.peerDependencies?.[dep]
        );

        if (missingDeps.length > 0) {
          logger.warn(
            `⚠️  Missing NestJS dependencies: ${missingDeps.join(', ')}`
          );
        } else {
          logger.info('✓ NestJS dependencies validation passed');
        }
      } catch (error) {
        logger.error(`❌ Invalid package.json: ${error}`);
        hasErrors = true;
      }
    }

    if (!hasErrors) {
      logger.info(`✓ Plugin ${projectName} validation completed successfully`);
      return { success: true };
    } else {
      logger.error(`❌ Plugin ${projectName} validation failed`);
      return { success: false };
    }
  } catch (error) {
    logger.error(`Validation failed: ${error}`);
    return { success: false };
  }
};

export default runExecutor;
