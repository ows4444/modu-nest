import { addProjectConfiguration, formatFiles, generateFiles, names, Tree } from '@nx/devkit';
import * as path from 'path';
import { WithManifestOnlyGeneratorSchema } from './schema';

export async function withManifestOnlyGenerator(tree: Tree, options: WithManifestOnlyGeneratorSchema) {
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
  await formatFiles(tree);
}

export default withManifestOnlyGenerator;
