import { ControllerOptions, Controller } from '@nestjs/common';
import 'reflect-metadata';

export interface PluginRouteOptions {
  path?: ControllerOptions['path'];
}

export function PluginRoute(options?: PluginRouteOptions): ClassDecorator;
export function PluginRoute(prefix?: string | string[]): ClassDecorator;
export function PluginRoute(prefixOrOptions?: string | string[] | PluginRouteOptions): ClassDecorator {
  let options: PluginRouteOptions = {};

  if (typeof prefixOrOptions === 'string' || Array.isArray(prefixOrOptions)) {
    options.path = prefixOrOptions;
  } else if (prefixOrOptions) {
    options = prefixOrOptions;
  }

  return (target: Function) => {
    const controllerOptions: ControllerOptions = {
      path: options.path,
    };

    Controller(controllerOptions)(target);
  };
}
