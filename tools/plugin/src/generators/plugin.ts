import { addProjectConfiguration, formatFiles, generateFiles, names, Tree, updateJson } from '@nx/devkit';
import * as path from 'path';
import { PluginGeneratorSchema } from './schema';

export async function pluginGenerator(tree: Tree, options: PluginGeneratorSchema) {
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
      'plugin-registry-publish': {
        executor: '@modu-nest/plugin:plugin-registry-publish',
        options: {
          outputPath: 'dist',
          registryUrl: 'http://localhost:3001',
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

  generateFiles(tree, path.join(__dirname, 'files'), projectRoot, normalizedOptions);

  // Update root tsconfig.json to include the new plugin project
  updateJson(tree, 'tsconfig.json', (json) => {
    if (!json.references) {
      json.references = [];
    }
    const projectRef = { path: `./${projectRoot}` };
    if (!json.references.some((ref: { path: string }) => ref.path === projectRef.path)) {
      json.references.push(projectRef);
    }
    return json;
  });

  // Update root package.json to include the plugin in workspaces
  updateJson(tree, 'package.json', (json) => {
    if (!json.workspaces) {
      json.workspaces = [];
    }
    if (!json.workspaces.includes('plugins/*')) {
      json.workspaces.push('plugins/*');
    }
    return json;
  });

  await formatFiles(tree);
}

export default pluginGenerator;
