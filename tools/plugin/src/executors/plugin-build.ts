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
  dependencies?: string[];
  loadOrder?: number;
  module: {
    controllers?: string[];
    providers?: string[];
    exports?: string[];
    imports?: string[];
    guards?: string[];
  };
}

interface BuildResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

class PluginBuilder {
  private sourceRoot: string;
  private projectName: string;
  private outputDir: string;

  constructor(sourceRoot: string, projectName: string, outputPath: string) {
    this.sourceRoot = sourceRoot;
    this.projectName = projectName;
    this.outputDir = path.join(sourceRoot, outputPath);
  }

  async build(options: PluginBuildExecutorSchema): Promise<BuildResult> {
    try {
      logger.info(`Building plugin ${this.projectName}...`);

      if (options.validateManifest) {
        await this.validateManifest();
      }

      await this.cleanOutput();
      await this.compileTypeScript(options);

      if (options.minify && options.production) {
        await this.minifyJavaScriptFiles();
      }

      await this.copyAssets(options.assets);
      await this.ensurePackageJson();

      logger.info(`✅ Plugin ${this.projectName} built successfully to ${this.outputDir}`);
      return { success: true, outputPath: this.outputDir };
    } catch (error) {
      logger.error(`Build failed: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  private async validateManifest(): Promise<void> {
    const manifestPath = path.join(this.sourceRoot, 'plugin.manifest.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error('plugin.manifest.json not found');
    }

    try {
      const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const requiredFields = ['name', 'version'];
      for (const field of requiredFields) {
        if (!manifest[field as keyof PluginManifest]) {
          throw new Error(`Invalid manifest: missing required field '${field}'`);
        }
      }

      // Validate semantic versioning
      if (!this.isValidSemver(manifest.version)) {
        throw new Error(`Invalid version format: ${manifest.version}. Must follow semantic versioning.`);
      }

      logger.info('✅ Manifest validation passed');
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

  private async cleanOutput(): Promise<void> {
    if (fs.existsSync(this.outputDir)) {
      fs.rmSync(this.outputDir, { recursive: true, force: true });
      logger.info(`✅ Removed existing output directory: ${this.outputDir}`);
    }

    // Ensure output directory exists
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  private async compileTypeScript(options: PluginBuildExecutorSchema): Promise<void> {
    logger.info('Compiling TypeScript...');

    const tsConfigPath = path.join(this.sourceRoot, options.tsConfig || 'tsconfig.json');

    if (!fs.existsSync(tsConfigPath)) {
      throw new Error(`TypeScript config not found: ${options.tsConfig}`);
    }

    // Build TypeScript compiler options based on production mode
    let tscOptions = `--project "${tsConfigPath}" --outDir "${this.outputDir}"`;

    if (options.production) {
      // For production builds, we need to be careful with composite projects
      // Don't disable declarations or source maps as they may be required by the base config
      tscOptions += ' --removeComments --skipLibCheck --noEmitOnError';
      logger.info('Building in production mode with optimizations...');
    } else {
      logger.info('Building in development mode...');
    }

    try {
      const { stderr } = await execAsync(`npx tsc ${tscOptions}`);

      if (stderr && !stderr.includes('TS2307')) {
        // Ignore module resolution warnings for now
        logger.warn(`TypeScript warnings: ${stderr}`);
      }

      logger.info('✅ TypeScript compilation completed');
    } catch (error) {
      // Parse TypeScript errors for better error messages
      const errorMessage = String(error);
      if (errorMessage.includes('error TS')) {
        const tsErrors = errorMessage
          .split('\n')
          .filter((line: string) => line.includes('error TS'))
          .slice(0, 5) // Show only first 5 errors
          .join('\n');
        throw new Error(`TypeScript compilation failed:\n${tsErrors}`);
      }
      throw new Error(`TypeScript compilation failed: ${errorMessage}`);
    }
  }

  private async minifyJavaScriptFiles(): Promise<void> {
    logger.info('Minifying JavaScript files...');

    const jsFiles = this.getAllJsFiles(this.outputDir);
    let minifiedCount = 0;

    for (const file of jsFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const minified = this.minifyJavaScript(content);

        // Only write if minification actually reduced size
        if (minified.length < content.length * 0.9) {
          fs.writeFileSync(file, minified);
          minifiedCount++;
        }
      } catch (error) {
        logger.warn(`Failed to minify ${path.relative(this.outputDir, file)}: ${error}`);
      }
    }

    logger.info(`✅ JavaScript minification completed (${minifiedCount} files minified)`);
  }

  private getAllJsFiles(directory: string): string[] {
    const files: string[] = [];

    const scanRecursive = (currentPath: string) => {
      if (!fs.existsSync(currentPath)) return;

      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          scanRecursive(itemPath);
        } else if (item.endsWith('.js') && !item.endsWith('.min.js')) {
          files.push(itemPath);
        }
      }
    };

    scanRecursive(directory);
    return files;
  }

  private minifyJavaScript(code: string): string {
    return (
      code
        // Remove single line comments (but preserve URLs and important comments)
        .replace(/(?<!:)\/\/(?!.*https?:\/\/).*$/gm, '')
        // Remove multi-line comments (but preserve JSDoc and licenses)
        .replace(/\/\*(?![\s\S]*@|\*!|![\s\S]*?\*\/)[\s\S]*?\*\//g, '')
        // Remove extra whitespace but preserve string literals
        .replace(/(?<!['"`])\s+(?!['"`])/g, ' ')
        // Remove whitespace around operators (carefully)
        .replace(/\s*([{}();,=<>!&|+\-*/])\s*/g, '$1')
        // Remove leading/trailing whitespace from lines
        .replace(/^\s+|\s+$/gm, '')
        // Remove consecutive empty lines
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim()
    );
  }

  private async copyAssets(assets: string[] = ['plugin.manifest.json']): Promise<void> {
    logger.info('Copying assets...');
    let copiedCount = 0;

    for (const asset of assets) {
      const assetPath = path.join(this.sourceRoot, asset);

      if (fs.existsSync(assetPath)) {
        const targetPath = path.join(this.outputDir, asset);

        // Ensure target directory exists
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        fs.copyFileSync(assetPath, targetPath);
        logger.info(`✅ Copied ${asset}`);
        copiedCount++;
      } else {
        logger.warn(`Asset not found: ${asset}`);
      }
    }

    if (copiedCount === 0) {
      logger.warn('No assets were copied');
    }
  }

  private async ensurePackageJson(): Promise<void> {
    const packageJsonPath = path.join(this.outputDir, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      const sourcePackageJson = path.join(this.sourceRoot, 'package.json');

      if (fs.existsSync(sourcePackageJson)) {
        // Copy and potentially modify package.json for plugin distribution
        const sourcePackage = JSON.parse(fs.readFileSync(sourcePackageJson, 'utf8'));

        // Create a minimal package.json for the plugin
        const pluginPackage = {
          name: sourcePackage.name,
          version: sourcePackage.version,
          description: sourcePackage.description,
          main: 'index.js',
          type: 'commonjs',
          dependencies: sourcePackage.dependencies || {},
          peerDependencies: sourcePackage.peerDependencies || {},
        };

        fs.writeFileSync(packageJsonPath, JSON.stringify(pluginPackage, null, 2));
        logger.info('✅ Generated optimized package.json');
      } else {
        logger.warn('No package.json found to copy');
      }
    }
  }
}

const runExecutor: PromiseExecutor<PluginBuildExecutorSchema> = async (options, context: ExecutorContext) => {
  const {
    outputPath = 'dist',
    tsConfig = 'tsconfig.json',
    assets = ['plugin.manifest.json'],
    validateManifest = true,
    production = false,
    minify = false,
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

  try {
    const builder = new PluginBuilder(sourceRoot, projectName, outputPath);
    const result = await builder.build({
      outputPath,
      tsConfig,
      assets,
      validateManifest,
      production,
      minify,
    });

    return { success: result.success };
  } catch (error) {
    logger.error(`Build executor failed: ${error}`);
    return { success: false };
  }
};

export default runExecutor;
