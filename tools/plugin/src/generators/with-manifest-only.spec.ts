import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readProjectConfiguration } from '@nx/devkit';

import { withManifestOnlyGenerator } from './with-manifest-only';
import { WithManifestOnlyGeneratorSchema } from './schema';

describe('with-manifest-only generator', () => {
  let tree: Tree;
  const options: WithManifestOnlyGeneratorSchema = { name: 'test-plugin' };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should run successfully', async () => {
    await withManifestOnlyGenerator(tree, options);
    const config = readProjectConfiguration(tree, 'test-plugin');
    expect(config).toBeDefined();
  });

  it('should create project configuration with correct structure', async () => {
    await withManifestOnlyGenerator(tree, options);
    const config = readProjectConfiguration(tree, 'test-plugin');
    
    expect(config.root).toBe('plugins/test-plugin');
    expect(config.sourceRoot).toBe('plugins/test-plugin/src');
    expect(config.projectType).toBe('library');
  });

  it('should create all required files', async () => {
    await withManifestOnlyGenerator(tree, options);
    
    // Check controller file
    expect(tree.exists('plugins/test-plugin/src/lib/controllers/test-plugin.controller.ts')).toBe(true);
    
    // Check service file
    expect(tree.exists('plugins/test-plugin/src/lib/services/test-plugin.service.ts')).toBe(true);
    
    // Check manifest file
    expect(tree.exists('plugins/test-plugin/plugin.manifest.json')).toBe(true);
    
    // Check package.json
    expect(tree.exists('plugins/test-plugin/package.json')).toBe(true);
    
    // Check TypeScript configs
    expect(tree.exists('plugins/test-plugin/tsconfig.json')).toBe(true);
    expect(tree.exists('plugins/test-plugin/tsconfig.lib.json')).toBe(true);
    
    // Check Jest config
    expect(tree.exists('plugins/test-plugin/jest.config.ts')).toBe(true);
  });

  it('should create project with build, lint, test, and zip targets', async () => {
    await withManifestOnlyGenerator(tree, options);
    const config = readProjectConfiguration(tree, 'test-plugin');
    
    expect(config.targets?.build).toBeDefined();
    expect(config.targets?.lint).toBeDefined();
    expect(config.targets?.test).toBeDefined();
    expect(config.targets?.zip).toBeDefined();
    expect(config.targets?.typecheck).toBeDefined();
  });
});
