import { ExecutorContext, PromiseExecutor, logger } from '@nx/devkit';
import { PluginZipExecutorSchema } from './schema';
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
  entryPoint: string;
  dependencies?: string[];
  loadOrder?: number;
  compatibilityVersion: string;
  routes?: string[];
  configuration?: {
    schema: Record<string, unknown>;
  };
}

const runExecutor: PromiseExecutor<PluginZipExecutorSchema> = async (
  options,
  context: ExecutorContext
) => {
  const { 
    inputPath = 'dist', 
    outputPath = 'releases',
    includeSourceMaps = false 
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
  const buildDir = path.join(sourceRoot, inputPath);
  const outputDir = path.join(sourceRoot, outputPath);

  try {
    logger.info(`Creating production ZIP package for plugin ${projectName}...`);

    // Check if build directory exists
    if (!fs.existsSync(buildDir)) {
      logger.error(`Build directory not found: ${buildDir}`);
      logger.info('Run the build command first: npx nx run <plugin-name>:plugin-build');
      return { success: false };
    }

    // Validate and read manifest
    const manifestPath = path.join(buildDir, 'plugin.manifest.json');
    if (!fs.existsSync(manifestPath)) {
      logger.error('plugin.manifest.json not found in build directory');
      return { success: false };
    }

    const manifest: PluginManifest = JSON.parse(
      fs.readFileSync(manifestPath, 'utf8')
    );

    if (!manifest.name || !manifest.version) {
      logger.error('Invalid manifest: missing name or version');
      return { success: false };
    }

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      logger.info(`Created releases directory: ${outputDir}`);
    }

    // Create temporary directory for ZIP contents
    const tempDir = path.join(outputDir, `temp-${manifest.name}-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Copy only required files
      await copyRequiredFiles(buildDir, tempDir, includeSourceMaps);
      logger.info('✓ Copied required files to temporary directory');

      // Create ZIP file
      const zipFileName = `${manifest.name}-v${manifest.version}.zip`;
      const zipFilePath = path.join(outputDir, zipFileName);

      // Remove existing ZIP if it exists
      if (fs.existsSync(zipFilePath)) {
        fs.unlinkSync(zipFilePath);
        logger.info(`Removed existing ZIP: ${zipFileName}`);
      }

      // Create ZIP using system zip command
      await execAsync(`cd "${tempDir}" && zip -r "${zipFilePath}" .`);
      
      // Verify ZIP was created and get its size
      if (fs.existsSync(zipFilePath)) {
        const stats = fs.statSync(zipFilePath);
        const sizeKB = Math.round(stats.size / 1024);
        logger.info(`✓ Created ZIP package: ${zipFileName} (${sizeKB} KB)`);
        
        // Log package contents
        logger.info(`Package contents:`);
        const contents = await listZipContents(zipFilePath);
        contents.forEach(file => logger.info(`   ${file}`));
        
        return { 
          success: true, 
          zipPath: zipFilePath,
          fileName: zipFileName,
          size: stats.size
        };
      } else {
        logger.error('Failed to create ZIP file');
        return { success: false };
      }

    } finally {
      // Clean up temporary directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }

  } catch (error) {
    logger.error(`ZIP creation failed: ${error}`);
    return { success: false };
  }
};

// Copy only the required files for production deployment
async function copyRequiredFiles(
  sourceDir: string, 
  targetDir: string, 
  includeSourceMaps: boolean
): Promise<void> {
  const requiredFiles = [
    'plugin.manifest.json',
    'package.json'
  ];
  
  // Copy manifest and package.json
  for (const file of requiredFiles) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
  
  // Copy all JavaScript files recursively, excluding source maps if not needed
  await copyJavaScriptFiles(sourceDir, targetDir, includeSourceMaps);
}

// Copy JavaScript files recursively
async function copyJavaScriptFiles(
  sourceDir: string, 
  targetDir: string, 
  includeSourceMaps: boolean
): Promise<void> {
  function copyRecursive(currentSource: string, currentTarget: string) {
    const items = fs.readdirSync(currentSource);
    
    for (const item of items) {
      const sourcePath = path.join(currentSource, item);
      const targetPath = path.join(currentTarget, item);
      const stat = fs.statSync(sourcePath);
      
      if (stat.isDirectory()) {
        // Create directory and recurse
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }
        copyRecursive(sourcePath, targetPath);
      } else if (stat.isFile()) {
        // Copy only JavaScript files and optionally source maps
        const shouldCopy = item.endsWith('.js') || 
                          item.endsWith('.d.ts') ||
                          (includeSourceMaps && (item.endsWith('.js.map') || item.endsWith('.d.ts.map')));
                          
        if (shouldCopy) {
          // Ensure target directory exists
          const targetDirPath = path.dirname(targetPath);
          if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true });
          }
          fs.copyFileSync(sourcePath, targetPath);
        }
      }
    }
  }
  
  copyRecursive(sourceDir, targetDir);
}

// List contents of ZIP file for verification
async function listZipContents(zipPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(`unzip -l "${zipPath}"`);
    const lines = stdout.split('\n');
    const contents: string[] = [];
    
    // Parse unzip -l output to extract file names
    for (const line of lines) {
      // Skip header and footer lines
      if (line.includes('----') || line.includes('Archive:') || 
          line.includes('files') || line.trim() === '') {
        continue;
      }
      
      // Extract filename from the line (format: length date time name)
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const fileName = parts.slice(3).join(' ');
        if (fileName && !fileName.includes('----')) {
          contents.push(fileName);
        }
      }
    }
    
    return contents.filter(f => f.length > 0);
  } catch (error) {
    return ['(unable to list contents)'];
  }
}

export default runExecutor;