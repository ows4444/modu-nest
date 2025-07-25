import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  names,
  Tree,
} from '@nx/devkit';
import * as path from 'path';
import { PluginGeneratorSchema } from './schema';

export async function pluginGenerator(
  tree: Tree,
  options: PluginGeneratorSchema
) {
  const projectRoot = `plugins/${options.name}`;
  const normalizedOptions = {
    ...options,
    ...names(options.name),
  };

  addProjectConfiguration(tree, options.name, {
    root: projectRoot,
    projectType: 'library',
    sourceRoot: `${projectRoot}/src`,
    targets: {
      build: {
        executor: '@nx/js:tsc',
        outputs: ['{options.outputPath}'],
        options: {
          outputPath: `dist/libs/${options.name}`,
          tsConfig: `${projectRoot}/tsconfig.lib.json`,
          packageJson: `${projectRoot}/package.json`,
        },
      },
      'plugin-build': {
        executor: '@modu-nest/plugin:plugin-build',
        options: {
          outputPath: 'dist',
          tsConfig: 'tsconfig.lib.json',
          assets: ['plugin.manifest.json'],
        },
      },
      'plugin-validate': {
        executor: '@modu-nest/plugin:plugin-validate',
        options: {
          tsConfig: 'tsconfig.lib.json',
        },
      },
      'plugin-publish': {
        executor: '@modu-nest/plugin:plugin-publish',
        options: {
          outputPath: 'dist',
          pluginsDir: './plugins',
        },
      },
      lint: {
        executor: '@nx/eslint:lint',
        outputs: ['{options.outputFile}'],
        options: {
          lintFilePatterns: [`${projectRoot}/**/*.ts`],
        },
      },
      test: {
        executor: '@nx/jest:jest',
        outputs: ['{workspaceRoot}/coverage/{projectRoot}'],
        options: {
          jestConfig: `${projectRoot}/jest.config.ts`,
        },
      },
    },
  });

  generateFiles(
    tree,
    path.join(__dirname, 'files'),
    projectRoot,
    normalizedOptions
  );
  await formatFiles(tree);
}

export default pluginGenerator;
