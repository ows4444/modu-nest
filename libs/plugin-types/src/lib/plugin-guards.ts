import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ExternalGuardEntry, LocalGuardEntry } from './plugin-interfaces';

// Plugin guard interfaces
export interface PluginGuard extends CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean>;
}

export type PluginGuardMetadata = ExternalGuardEntry | Omit<LocalGuardEntry, 'class'>;

export interface RegisteredPluginGuard {
  metadata: PluginGuardMetadata;
  guardClass: new (...args: any[]) => PluginGuard;
  instance?: PluginGuard;
}

// Plugin guard registry for sharing guards between plugins
export interface PluginGuardRegistry {
  registerGuard(guard: RegisteredPluginGuard): void;
  getGuard(name: string): RegisteredPluginGuard | undefined;
  getGuardsByPlugin(pluginName: string): RegisteredPluginGuard[];
  getAllGuards(): RegisteredPluginGuard[];
  unregisterGuard(name: string): boolean;
  unregisterPluginGuards(pluginName: string): void;
}

// Decorator metadata keys
export const PLUGIN_GUARD_METADATA_KEY = 'plugin:guard:metadata';
export const PLUGIN_USE_GUARDS_KEY = 'plugin:use-guards';

// Plugin guard decorators
export function PluginGuardMetadata(metadata: PluginGuardMetadata): ClassDecorator {
  return SetMetadata(PLUGIN_GUARD_METADATA_KEY, metadata);
}

export function PluginUseGuards(
  ...guards: (string | (new (...args: any[]) => PluginGuard))[]
): MethodDecorator & ClassDecorator {
  return SetMetadata(PLUGIN_USE_GUARDS_KEY, guards);
}

// Base plugin guard class
export abstract class BasePluginGuard implements PluginGuard {
  abstract canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean>;
}

// Plugin guard registration decorator
export function RegisterPluginGuard(metadata: PluginGuardMetadata) {
  return function <T extends new (...args: any[]) => PluginGuard>(constructor: T): T {
    // Store metadata on the constructor
    Reflect.defineMetadata(PLUGIN_GUARD_METADATA_KEY, metadata, constructor);

    // Mark as injectable if not already
    if (!Reflect.hasMetadata('__injectable__', constructor)) {
      Injectable()(constructor);
    }

    return constructor;
  };
}

// Utility functions
export function getPluginGuardMetadata(
  guardClass: new (...args: any[]) => PluginGuard
): PluginGuardMetadata | undefined {
  return Reflect.getMetadata(PLUGIN_GUARD_METADATA_KEY, guardClass);
}

export function isPluginGuard(obj: any): obj is PluginGuard {
  return obj && typeof obj.canActivate === 'function';
}

export function isPluginGuardClass(constructor: any): constructor is new (...args: any[]) => PluginGuard {
  return (
    typeof constructor === 'function' &&
    constructor.prototype &&
    typeof constructor.prototype.canActivate === 'function'
  );
}
