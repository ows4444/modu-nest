import { PromiseExecutor } from '@nx/devkit';
import { PluginValidateExecutorSchema } from './schema';

const runExecutor: PromiseExecutor<
  PluginValidateExecutorSchema
> = async options => {
  console.log('Executor ran for PluginValidate', options);
  return {
    success: true,
  };
};

export default runExecutor;
