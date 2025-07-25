import { PromiseExecutor } from '@nx/devkit';
import { PluginPublishExecutorSchema } from './schema';

const runExecutor: PromiseExecutor<
  PluginPublishExecutorSchema
> = async options => {
  console.log('Executor ran for PluginPublish', options);
  return {
    success: true,
  };
};

export default runExecutor;
