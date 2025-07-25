import { PromiseExecutor } from '@nx/devkit';
import { PluginBuildExecutorSchema } from './schema';

const runExecutor: PromiseExecutor<
  PluginBuildExecutorSchema
> = async options => {
  console.log('Executor ran for PluginBuild', options);
  return {
    success: true,
  };
};

export default runExecutor;
