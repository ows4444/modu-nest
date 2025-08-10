import { Module, ModuleMetadata } from '@nestjs/common';
import 'reflect-metadata';

export interface PluginModuleOptions {
  name?: string;
  version?: string;
  description?: string;
  isolated?: boolean;
  controllers?: ModuleMetadata['controllers'];
  imports?: ModuleMetadata['imports'];
  providers?: ModuleMetadata['providers'];
  exports?: ModuleMetadata['exports'];
}

const PLUGIN_METADATA_KEY = 'plugin:options';

export function Plugin({
  providers = [],
  controllers = [],
  exports = [],
  ...options
}: PluginModuleOptions): ClassDecorator {
  return (target: Function) => {
    const moduleMetadata: ModuleMetadata = {
      providers,
      controllers,
      exports,
    };

    // Store plugin metadata
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, options, target);

    // Apply Module decorator
    Module(moduleMetadata)(target);
  };
}
