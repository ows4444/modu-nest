import { PromiseExecutor, ExecutorContext } from '@nx/devkit';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ZipExecutorSchema } from './schema';

const runExecutor: PromiseExecutor<ZipExecutorSchema> = async (
  options,
  context: ExecutorContext
) => {
  const { projectName, root, projectsConfigurations } = context;
  
  if (!projectName) {
    throw new Error('Project name is required');
  }

  const projectConfig = projectsConfigurations?.projects[projectName];
  if (!projectConfig) {
    throw new Error(`Project ${projectName} not found`);
  }

  const outputPath = options.outputPath || join(projectConfig.root, 'dist');
  const builtProjectPath = join(root, outputPath);
  
  // Read version from package.json
  const packageJsonPath = join(root, projectConfig.root, 'package.json');
  let version = '0.0.1';
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    version = packageJson.version || '0.0.1';
  }
  
  // Create releases directory
  const releasesPath = join(root, projectConfig.root, 'releases');
  // Remove scope prefix from project name for filename
  const cleanProjectName = projectName.replace(/^@[^/]+\//, '');
  const zipFileName = `${cleanProjectName}-v${version}.zip`;
  const zipFilePath = join(releasesPath, zipFileName);

  try {
    // Ensure the built project exists
    if (!existsSync(builtProjectPath)) {
      throw new Error(`Built project not found at ${builtProjectPath}. Run build first.`);
    }

    // Ensure releases directory exists
    if (!existsSync(releasesPath)) {
      mkdirSync(releasesPath, { recursive: true });
    }

    console.log(`Creating zip package for ${projectName} v${version}...`);
    
    // Create zip file using native zip command - only include .js files, package.json, and manifest
    execSync(
      `cd ${builtProjectPath} && find . -name "*.js" -o -name "package.json" -o -name "plugin.manifest.json" | zip -r ${zipFilePath} -@`,
      {
        cwd: root,
        stdio: 'inherit',
      }
    );

    console.log(`✅ Successfully created ${zipFileName} in releases folder`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Zip creation failed for ${projectName}:`, error);
    return { success: false };
  }
};

export default runExecutor;
