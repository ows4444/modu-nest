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
  dependencies?: string[];
  loadOrder?: number;
  compatibilityVersion: string;
  routes?: string[];
  configuration?: {
    schema: Record<string, unknown>;
  };
}

interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

class PluginValidator {
  private sourceRoot: string;
  private projectName: string;
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(sourceRoot: string, projectName: string) {
    this.sourceRoot = sourceRoot;
    this.projectName = projectName;
  }

  async validate(options: PluginValidateExecutorSchema): Promise<ValidationResult> {
    logger.info(`Validating plugin ${this.projectName}...`);

    await this.validateManifest(options.validateManifest);
    await this.validateSecurity();
    await this.validateTypeScript(options.tsConfig);
    await this.validateNestJSStructure();
    await this.validateDependencies();

    const hasErrors = this.errors.length > 0;

    if (this.warnings.length > 0) {
      this.warnings.forEach((warning) => logger.warn(`⚠️  ${warning}`));
    }

    if (hasErrors) {
      this.errors.forEach((error) => logger.error(`❌ ${error}`));
      logger.error(`❌ Plugin ${this.projectName} validation failed`);
    } else {
      logger.info(`✅ Plugin ${this.projectName} validation completed successfully`);
    }

    return {
      success: !hasErrors,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  private async validateManifest(shouldValidate = true): Promise<void> {
    if (!shouldValidate) return;

    logger.info('Validating plugin manifest...');
    const manifestPath = path.join(this.sourceRoot, 'plugin.manifest.json');

    if (!fs.existsSync(manifestPath)) {
      this.errors.push('plugin.manifest.json not found');
      return;
    }

    try {
      const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Required fields validation
      const requiredFields: (keyof PluginManifest)[] = ['name', 'version', 'compatibilityVersion'];

      for (const field of requiredFields) {
        if (!manifest[field]) {
          this.errors.push(`Missing required field in manifest: ${field}`);
        }
      }

      // Validate version format (semver)
      if (manifest.version && !this.isValidSemver(manifest.version)) {
        this.errors.push(`Invalid version format: ${manifest.version}. Must follow semantic versioning.`);
      }

      // Validate load order is a number if present
      if (manifest.loadOrder !== undefined && typeof manifest.loadOrder !== 'number') {
        this.errors.push('loadOrder must be a number');
      }

      // Validate dependencies array if present
      if (manifest.dependencies && !Array.isArray(manifest.dependencies)) {
        this.errors.push('dependencies must be an array');
      }

      if (this.errors.length === 0) {
        logger.info('✅ Manifest validation passed');
      }
    } catch (error) {
      this.errors.push(`Invalid JSON in manifest: ${error}`);
    }
  }

  private isValidSemver(version: string): boolean {
    const semverRegex =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    return semverRegex.test(version);
  }

  private async validateSecurity(): Promise<void> {
    logger.info('Scanning for unsafe imports...');
    const unsafeImportResults = this.scanDirectoryForUnsafeImports(this.sourceRoot);

    if (unsafeImportResults.length > 0) {
      this.errors.push('Security validation failed - unsafe imports detected:');
      for (const result of unsafeImportResults) {
        this.errors.push(`   ${result.file}: ${result.imports.join(', ')}`);
      }
      this.errors.push('   Plugins are not allowed to use Node.js system modules for security reasons.');
      this.errors.push('   Please remove these imports and use NestJS/framework provided alternatives.');
    } else {
      logger.info('✅ Security validation passed - no unsafe imports found');
    }
  }

  private async validateTypeScript(tsConfig = 'tsconfig.json'): Promise<void> {
    logger.info('Running TypeScript type check...');
    try {
      const tsConfigPath = path.join(this.sourceRoot, tsConfig);
      if (!fs.existsSync(tsConfigPath)) {
        this.errors.push(`TypeScript config not found: ${tsConfig}`);
        return;
      }

      await execAsync(`npx tsc --project ${tsConfigPath} --noEmit`);
      logger.info('✅ TypeScript type check passed');
    } catch (error) {
      this.errors.push(`TypeScript type check failed: ${error}`);
    }
  }

  private async validateNestJSStructure(): Promise<void> {
    logger.info('Validating NestJS structure...');
    const srcDir = path.join(this.sourceRoot, 'src');
    const libDir = path.join(srcDir, 'lib');

    // Check for index.ts in src directory
    const indexPath = path.join(srcDir, 'index.ts');
    if (!fs.existsSync(indexPath)) {
      this.errors.push('Missing required file: src/index.ts');
    }

    // Check for lib directory structure (new Nx pattern)
    if (fs.existsSync(libDir)) {
      const expectedFiles = [
        `${this.projectName}.module.ts`,
        `${this.projectName}.service.ts`,
        `${this.projectName}.controller.ts`,
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(libDir, file);
        if (!fs.existsSync(filePath)) {
          this.errors.push(`Missing required file: src/lib/${file}`);
        }
      }

      // Validate module exports for lib structure
      if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        const moduleExportPattern = new RegExp(`export.*from.*lib/${this.projectName}\\.module`, 'i');

        if (!moduleExportPattern.test(indexContent)) {
          this.errors.push(`index.ts must export the plugin module from lib/${this.projectName}.module`);
        }
      }
    } else {
      // Check for old flat structure
      const expectedFiles = [
        `${this.projectName}.module.ts`,
        `${this.projectName}.service.ts`,
        `${this.projectName}.controller.ts`,
        'index.ts',
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(srcDir, file);
        if (!fs.existsSync(filePath)) {
          this.errors.push(`Missing required file: src/${file}`);
        }
      }

      // Validate module exports for flat structure
      if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        const moduleExportPattern = new RegExp(`export.*from.*${this.projectName}\\.module`, 'i');

        if (!moduleExportPattern.test(indexContent)) {
          this.errors.push(`index.ts must export the plugin module`);
        }
      }
    }

    if (this.errors.length === 0) {
      logger.info('✅ NestJS structure validation passed');
    }
  }

  private async validateDependencies(): Promise<void> {
    const packageJsonPath = path.join(this.sourceRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      this.warnings.push('package.json not found - consider adding one for dependency management');
      return;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      const nestDeps = ['@modu-nest/plugin-types'];
      const missingDeps = nestDeps.filter(
        (dep) =>
          !packageJson.dependencies?.[dep] &&
          !packageJson.peerDependencies?.[dep] &&
          !packageJson.devDependencies?.[dep]
      );

      if (missingDeps.length > 0) {
        this.warnings.push(`Missing NestJS dependencies: ${missingDeps.join(', ')}`);
      } else {
        logger.info('✅ NestJS dependencies validation passed');
      }

      // Check for plugin-types dependency
      const pluginTypesDep = '@modu-nest/plugin-types';
      const hasPluginTypes =
        packageJson.dependencies?.[pluginTypesDep] ||
        packageJson.peerDependencies?.[pluginTypesDep] ||
        packageJson.devDependencies?.[pluginTypesDep];

      if (!hasPluginTypes) {
        this.warnings.push(`Missing plugin types dependency: ${pluginTypesDep}`);
      }
    } catch (error) {
      this.errors.push(`Invalid package.json: ${error}`);
    }
  }

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
}

const runExecutor: PromiseExecutor<PluginValidateExecutorSchema> = async (options, context: ExecutorContext) => {
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

  try {
    const validator = new PluginValidator(sourceRoot, projectName);
    const result = await validator.validate({ tsConfig, validateManifest });

    return { success: result.success };
  } catch (error) {
    logger.error(`Validation failed: ${error}`);
    return { success: false };
  }
};

export default runExecutor;
