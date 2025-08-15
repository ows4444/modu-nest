import { PromiseExecutor, ExecutorContext } from '@nx/devkit';
import { execSync } from 'child_process';
import { LintExecutorSchema } from './schema';

const runExecutor: PromiseExecutor<LintExecutorSchema> = async (
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
  const lintPatterns = options.lintFilePatterns || [`${projectRoot}/**/*.ts`];
  const fixFlag = options.fix ? ' --fix' : '';

  try {
    console.log(`Linting ${projectName}...`);
    const quotedPatterns = lintPatterns.map(pattern => `"${pattern}"`).join(' ');
    execSync(`npx eslint ${quotedPatterns}${fixFlag}`, {
      cwd: root,
      stdio: 'inherit',
    });

    console.log(`✅ Successfully linted ${projectName}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Lint failed for ${projectName}:`, error);
    return { success: false };
  }
};

export default runExecutor;
