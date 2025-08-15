import { PromiseExecutor, ExecutorContext } from '@nx/devkit';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';
import { BuildExecutorSchema } from './schema';

const runExecutor: PromiseExecutor<BuildExecutorSchema> = async (
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

  const projectRoot = projectConfig.root;
  const tsConfigPath = options.tsConfig || `${projectRoot}/tsconfig.lib.json`;
  const outputPath = join(root, options.outputPath);

  try {
    // Ensure output directory exists
    if (!existsSync(outputPath)) {
      mkdirSync(outputPath, { recursive: true });
    }

    // Build with TypeScript
    console.log(`Building ${projectName}...`);
    execSync(`npx tsc -p ${tsConfigPath} --outDir ${outputPath}`, {
      cwd: root,
      stdio: 'inherit',
    });

    // Copy package.json and manifest if they exist
    const packageJsonPath = join(projectRoot, 'package.json');
    const manifestPath = join(projectRoot, 'plugin.manifest.json');

    if (existsSync(packageJsonPath)) {
      copyFileSync(packageJsonPath, join(outputPath, 'package.json'));
    }

    if (existsSync(manifestPath)) {
      copyFileSync(manifestPath, join(outputPath, 'plugin.manifest.json'));
    }

    console.log(`✅ Successfully built ${projectName}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Build failed for ${projectName}:`, error);
    return { success: false };
  }
};

export default runExecutor;
