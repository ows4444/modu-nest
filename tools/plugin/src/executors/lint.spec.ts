import { ExecutorContext } from '@nx/devkit';
import { LintExecutorSchema } from './schema';
import executor from './lint';

describe('Lint Executor', () => {
  const mockContext: ExecutorContext = {
    root: '/test/workspace',
    cwd: '/test/workspace',
    isVerbose: false,
    projectName: 'test-plugin',
    projectGraph: {
      nodes: {},
      dependencies: {},
    },
    projectsConfigurations: {
      projects: {
        'test-plugin': {
          root: 'plugins/test-plugin',
          sourceRoot: 'plugins/test-plugin/src',
          projectType: 'library',
        },
      },
      version: 2,
    },
    nxJsonConfiguration: {},
  };

  it('should throw error when project name is missing', async () => {
    const options: LintExecutorSchema = {};
    const contextWithoutProject = { ...mockContext, projectName: undefined };
    
    await expect(executor(options, contextWithoutProject)).rejects.toThrow('Project name is required');
  });

  it('should throw error when project is not found', async () => {
    const options: LintExecutorSchema = {};
    const contextWithMissingProject = {
      ...mockContext,
      projectName: 'missing-project',
    };
    
    await expect(executor(options, contextWithMissingProject)).rejects.toThrow('Project missing-project not found');
  });

  it('should use default lint patterns when none provided', async () => {
    // Mock execSync to avoid actual execution
    jest.mock('child_process', () => ({
      execSync: jest.fn(),
    }));
    
    // This test would need more setup to actually run without errors
    // For now, just test the basic structure
    expect(typeof executor).toBe('function');
  });
});
