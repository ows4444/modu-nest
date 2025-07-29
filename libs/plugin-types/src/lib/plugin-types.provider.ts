import { Injectable, ScopeOptions, InjectableOptions } from '@nestjs/common';
import 'reflect-metadata';

export function PluginInjectable(options?: ScopeOptions): ClassDecorator {
  return (target: Function) => {
    const controllerOptions: InjectableOptions = {
      scope: options?.scope,
      durable: options?.durable,
      // You can add more options here if needed
    };

    Injectable(controllerOptions)(target);
  };
}
